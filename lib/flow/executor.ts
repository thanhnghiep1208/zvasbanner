/**
 * Executor tối thiểu (T2.6): Run all → compile → toLegacyConfig → gọi API hiện có → kết quả theo ratio.
 *
 * Domain thuần: không gọi fetch trực tiếp. UI truyền `generate` (bọc requestGenerationWithPayload
 * trong lib/client-generation.ts) và `onRunInfo` để cập nhật trạng thái node.
 *
 * Nhiều ratio: ratio đầu sinh từ đầu; các ratio sau gửi kèm `layoutAdaptationFromBanner` = ảnh ratio đầu,
 * giống "Biến thể kích thước" của form (AdditionalCanvasSizesPanel). Chạy tuần tự, tôn trọng rate limit.
 * Composed (T4.2): layout → guide image → POST /api/flow/generate-background, 1 lần / ratio.
 *   Ghép layer (T4.3) chưa có: kết quả tạm thời là ảnh nền.
 * Chưa có (T4.7): cache, stale, Run từ node.
 */
import type { CanvasConfig, GenerationRequest } from '@/lib/types';
import type { CompiledJob } from './compiled-job';
import { compileGraph } from './compiler';
import { toBackgroundRequests, type BackgroundRequest } from './background/request';
import { planLayoutForJob } from './layout/engine';
import type { TextMeasurer } from './layout/measure';
import type { GuideRect } from './layout/types';
import { toLegacyConfig, type LegacyIssue } from './legacy/to-legacy-config';
import type { LegacyRuntime } from './legacy/from-legacy-config';
import type { NodeRunInfo } from './run-state';
import type { FlowGraph } from './schema';

export type GenerateResult =
  | { ok: true; image: string; source: 'gemini' | 'placeholder'; placeholderError?: string }
  | { ok: false; error: string };

export type BackgroundResult = { ok: true; image: string } | { ok: false; error: string };

export interface ExecutorDeps {
  generate: (request: GenerationRequest) => Promise<GenerateResult>;
  onRunInfo: (nodeId: string, info: NodeRunInfo) => void;
  /** Composed: gọi /api/flow/generate-background. */
  generateBackground?: (request: BackgroundRequest) => Promise<BackgroundResult>;
  /** Composed: vẽ layout guide image (PNG data URL) – UI dùng Canvas 2D. */
  renderGuide?: (canvas: CanvasConfig, guide: GuideRect[]) => string | Promise<string>;
  /** Measurer cho layout (T4.4 truyền Canvas 2D); mặc định ước lượng. */
  measurer?: TextMeasurer;
}

export interface RatioResult {
  ratioId: string;
  canvasConfig: CanvasConfig;
  image: string;
}

export interface RunIssue {
  message: string;
  nodeId?: string;
}

export type RunOutcome =
  | { ok: true; results: RatioResult[]; warnings: RunIssue[] }
  | { ok: false; errors: RunIssue[]; results: RatioResult[] };

export async function runAll(graph: FlowGraph, runtime: LegacyRuntime, deps: ExecutorDeps): Promise<RunOutcome> {
  const compiled = compileGraph(graph);
  if (!compiled.ok) {
    return fail(deps, compiled.errors.map((e) => ({ message: e.message, nodeId: e.nodeId })));
  }

  if (compiled.job.renderMode === 'composed') {
    return runComposed(graph, compiled.job, runtime, deps, compiled.warnings.map((w) => ({ message: w.message, nodeId: w.nodeId })));
  }

  const exportNode = graph.nodes.find((n) => n.type === 'export')!;
  const execNode = graph.nodes.find((n) => n.id === graph.edges.find((e) => e.target === exportNode.id)!.source)!;

  const legacy = toLegacyConfig(compiled.job, runtime);
  if (!legacy.ok) {
    return fail(deps, [{ message: composedMessage(legacy.error), nodeId: execNode.id }]);
  }

  // Ảnh thiếu dữ liệu: server bỏ qua im lặng → chặn chạy, báo trên từng node asset.
  const missing = legacy.warnings.find((w) => w.code === 'missing-asset-data');
  if (missing) {
    const assetNodes = graph.nodes.filter((n) =>
      (n.type === 'product-asset' || n.type === 'reference-image') &&
      missing.refs!.includes((n.params as { assetId: string }).assetId));
    return fail(deps, assetNodes.map((n) => ({
      nodeId: n.id,
      message: (n.params as { fileName: string }).fileName ? 'Cần tải lại ảnh trước khi chạy.' : 'Chưa có ảnh.',
    })));
  }

  // Q9A: text không map được → vẫn chạy, chỉ cảnh báo.
  const warnings: RunIssue[] = [
    ...compiled.warnings.map((w) => ({ message: w.message, nodeId: w.nodeId })),
    ...legacy.warnings.filter((w) => w.code === 'unmapped-text').flatMap((w) => textWarnings(graph, w)),
  ];

  deps.onRunInfo(execNode.id, { state: 'running' });
  deps.onRunInfo(exportNode.id, { state: 'queued' });

  const results: RatioResult[] = [];
  for (const [i, { ratioId, request }] of legacy.requests.entries()) {
    const first = results[0];
    const res = await deps.generate(first ? { ...request, layoutAdaptationFromBanner: first.image } : request);
    const error = !res.ok ? res.error
      : res.source === 'placeholder' ? (res.placeholderError ?? 'AI không trả ảnh, server dùng ảnh tạm.')
      : null;
    if (error || !res.ok) {
      const message = `${legacy.requests.length > 1 ? `Kích thước ${i + 1}/${legacy.requests.length}: ` : ''}${error}`;
      deps.onRunInfo(execNode.id, { state: 'error', message, previewUrl: first?.image });
      deps.onRunInfo(exportNode.id, { state: 'idle' });
      return { ok: false, errors: [{ message, nodeId: execNode.id }], results };
    }
    results.push({ ratioId, canvasConfig: request.canvasConfig, image: res.image });
    deps.onRunInfo(execNode.id, { state: 'running', previewUrl: results[0]!.image });
  }

  deps.onRunInfo(execNode.id, { state: 'done', previewUrl: results[0]!.image });
  deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image });
  return { ok: true, results, warnings };
}

/* ── Composed (T4.2) ────────────────────────────────────────── */

async function runComposed(
  graph: FlowGraph, job: CompiledJob, runtime: LegacyRuntime, deps: ExecutorDeps, warnings: RunIssue[],
): Promise<RunOutcome> {
  const byType = (t: string) => graph.nodes.find((n) => n.type === t)!;
  const layoutNode = byType('auto-layout');
  const genNode = byType('generate-background');
  const composeNode = byType('compose');
  const exportNode = byType('export');

  if (!deps.generateBackground || !deps.renderGuide) {
    return fail(deps, [{ nodeId: genNode.id, message: 'Môi trường hiện tại chưa hỗ trợ sinh nền.' }]);
  }

  const layout = planLayoutForJob(job, { measurer: deps.measurer });
  if (!layout.ok) return fail(deps, [{ nodeId: layoutNode.id, message: layout.message }]);
  deps.onRunInfo(layoutNode.id, { state: 'done' });

  const drafts = toBackgroundRequests(job, layout.plan, runtime);
  if (!drafts.ok) return fail(deps, [{ nodeId: genNode.id, message: drafts.message }]);
  if (drafts.missingAssetIds.length) {
    const refNodes = graph.nodes.filter((n) => n.type === 'reference-image'
      && drafts.missingAssetIds.includes((n.params as { assetId: string }).assetId));
    return fail(deps, refNodes.map((n) => ({
      nodeId: n.id,
      message: (n.params as { fileName: string }).fileName ? 'Cần tải lại ảnh trước khi chạy.' : 'Chưa có ảnh.',
    })));
  }

  deps.onRunInfo(genNode.id, { state: 'running' });
  deps.onRunInfo(composeNode.id, { state: 'queued' });
  const results: RatioResult[] = [];
  for (const [i, { ratioId, request }] of drafts.drafts.entries()) {
    const prefix = drafts.drafts.length > 1 ? `Kích thước ${i + 1}/${drafts.drafts.length}: ` : '';
    let res: BackgroundResult;
    try {
      const guideImage = await deps.renderGuide(request.canvasConfig, request.guide);
      res = await deps.generateBackground({ ...request, guideImage });
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) {
      const message = prefix + res.error;
      deps.onRunInfo(genNode.id, { state: 'error', message, previewUrl: results[0]?.image });
      deps.onRunInfo(composeNode.id, { state: 'idle' });
      return { ok: false, errors: [{ message, nodeId: genNode.id }], results };
    }
    results.push({ ratioId, canvasConfig: request.canvasConfig, image: res.image });
    deps.onRunInfo(genNode.id, { state: 'running', previewUrl: results[0]!.image });
  }

  deps.onRunInfo(genNode.id, { state: 'done', previewUrl: results[0]!.image });
  // T4.3 chưa có: Ghép layer chưa chạy, kết quả là ảnh nền.
  deps.onRunInfo(composeNode.id, { state: 'idle' });
  deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image });
  return {
    ok: true,
    results,
    warnings: [...warnings, { nodeId: composeNode.id, message: 'Ghép layer chưa có (T4.3): kết quả hiện là ảnh nền.' }],
  };
}

function fail(deps: ExecutorDeps, errors: RunIssue[]): RunOutcome {
  for (const e of errors) if (e.nodeId) deps.onRunInfo(e.nodeId, { state: 'error', message: e.message });
  return { ok: false, errors, results: [] };
}

function composedMessage(issue: LegacyIssue): string {
  return issue.code === 'composed-not-supported'
    ? 'Chế độ composed chưa chạy được (cần route sinh nền mới, T4.2). Dùng Sinh banner (flat).'
    : issue.message;
}

function textWarnings(graph: FlowGraph, w: LegacyIssue): RunIssue[] {
  return graph.nodes
    .filter((n) => n.type === 'text-layer' && w.refs!.includes((n.params as { layerId: string }).layerId))
    .map((n) => ({ nodeId: n.id, message: 'Text này không được gửi: form cũ chỉ có 1 tiêu đề chính, 1 tiêu đề phụ, 1 CTA.' }));
}
