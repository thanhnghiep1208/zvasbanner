/**
 * Executor tối thiểu (T2.6): Run all → compile → toLegacyConfig → gọi API hiện có → kết quả theo ratio.
 *
 * Domain thuần: không gọi fetch trực tiếp. UI truyền `generate` (bọc requestGenerationWithPayload
 * trong lib/client-generation.ts) và `onRunInfo` để cập nhật trạng thái node.
 *
 * Nhiều ratio: ratio đầu sinh từ đầu; các ratio sau gửi kèm `layoutAdaptationFromBanner` = ảnh ratio đầu,
 * giống "Biến thể kích thước" của form (AdditionalCanvasSizesPanel). Chạy tuần tự, tôn trọng rate limit.
 * Composed: layout → guide image → POST /api/flow/generate-background (T4.2) → Ghép layer Canvas 2D (T4.3),
 *   1 lần gọi AI / ratio. Pixel sản phẩm chỉ dùng ở bước ghép trên client, không gửi model.
 * Chưa có (T4.7): cache, stale, Run từ node.
 */
import type { CanvasConfig, GenerationRequest } from '@/lib/types';
import type { CompiledJob } from './compiled-job';
import { compileGraph } from './compiler';
import { toBackgroundRequests, type BackgroundRequest, type GuideStyle } from './background/request';
import { planLayoutForJob } from './layout/engine';
import type { TextMeasurer } from './layout/measure';
import type { GuideRect, LayoutPlan } from './layout/types';
import { adaptationRetryPrompt, toLegacyConfig, type LegacyIssue } from './legacy/to-legacy-config';
import { exportedRatios } from './compiled-job';
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
  /** Composed: cách truyền vùng trống (Q11). 'natural' không cần renderGuide. Mặc định 'hatched'. */
  guideStyle?: GuideStyle;
  /** Composed: vẽ layout guide image (PNG data URL) – UI dùng Canvas 2D. */
  renderGuide?: (canvas: CanvasConfig, guide: GuideRect[]) => string | Promise<string>;
  /** Nghỉ giữa các kích thước (form nghỉ 600ms); test truyền hàm rỗng. */
  sleep?: (ms: number) => Promise<void>;
  /** Measurer cho layout – UI truyền measurer Canvas 2D để khớp với lúc vẽ; mặc định ước lượng. */
  measurer?: TextMeasurer;
  /** Composed: ghép nền + sản phẩm + chữ cho 1 ratio (UI dùng Canvas 2D). Không có → trả ảnh nền. */
  composeRatio?: (args: {
    job: CompiledJob; plan: LayoutPlan; ratioId: string; background: string; dataUrls: Record<string, string>;
  }) => Promise<string>;
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

  // Chỉ sinh kích thước được xuất (T4.6), giữ thứ tự node Kích thước.
  const exported = new Set(exportedRatios(compiled.job).map((r) => r.id));
  const requests = legacy.requests.filter((r) => exported.has(r.ratioId));

  // Body quá giới hạn server → 413 sau khi đã chờ; chặn sớm, báo trên các node ảnh.
  const tooBig = oversizeIssues(graph, requests.map((r) => r.request));
  if (tooBig) return fail(deps, tooBig);

  // Q9A: text không map được → vẫn chạy, chỉ cảnh báo.
  const warnings: RunIssue[] = [
    ...compiled.warnings.map((w) => ({ message: w.message, nodeId: w.nodeId })),
    ...legacy.warnings.filter((w) => w.code === 'unmapped-text').flatMap((w) => textWarnings(graph, w)),
  ];

  deps.onRunInfo(execNode.id, { state: 'running' });
  deps.onRunInfo(exportNode.id, { state: 'queued' });

  const results: RatioResult[] = [];
  const retryPrompt = adaptationRetryPrompt(compiled.job);
  for (const [i, { ratioId, request }] of requests.entries()) {
    const first = results[0];
    if (i > 0) await pause(deps);
    let res: GenerateResult;
    if (!first) {
      res = await deps.generate(request);
    } else {
      // Kích thước phụ: giống "Biến thể kích thước" của form (AdditionalCanvasSizesPanel) – thích nghi từ ảnh đầu,
      // ép Nano Banana 2 + giữ nguyên chủ thể; lỗi/placeholder thì thử lại 1 lần với prompt "layout translation".
      const adapted: GenerationRequest = {
        ...request,
        imageModel: 'nano-banana-2',
        styleControls: { ...request.styleControls, strictPreserveMode: true },
        layoutAdaptationFromBanner: first.image,
      };
      res = await deps.generate(adapted);
      if (!res.ok || res.source === 'placeholder') res = await deps.generate({ ...adapted, userPrompt: retryPrompt });
    }
    const error = !res.ok ? res.error
      : res.source === 'placeholder' ? (res.placeholderError ?? 'AI không trả ảnh, server dùng ảnh tạm.')
      : null;
    if (error || !res.ok) {
      const message = `${requests.length > 1 ? `Kích thước ${i + 1}/${requests.length}: ` : ''}${error}`;
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

  const guideStyle = deps.guideStyle ?? 'hatched';
  if (!deps.generateBackground || (guideStyle === 'hatched' && !deps.renderGuide)) {
    return fail(deps, [{ nodeId: genNode.id, message: 'Môi trường hiện tại chưa hỗ trợ sinh nền.' }]);
  }

  const layout = planLayoutForJob(job, { measurer: deps.measurer });
  if (!layout.ok) return fail(deps, [{ nodeId: layoutNode.id, message: layout.message }]);
  deps.onRunInfo(layoutNode.id, { state: 'done' });

  const drafts = toBackgroundRequests({ ...job, ratios: exportedRatios(job) }, layout.plan, runtime);
  if (!drafts.ok) return fail(deps, [{ nodeId: genNode.id, message: drafts.message }]);
  // Ảnh tham chiếu (gửi model) + ảnh sản phẩm (ghép ở client) đều phải có dữ liệu trước khi tốn lượt AI.
  const missingProducts = deps.composeRatio
    ? job.products.filter((p) => !runtime.dataUrls[p.assetId]).map((p) => p.assetId) : [];
  const missing = [...drafts.missingAssetIds, ...missingProducts];
  if (missing.length) {
    const assetNodes = graph.nodes.filter((n) => (n.type === 'reference-image' || n.type === 'product-asset')
      && missing.includes((n.params as { assetId: string }).assetId));
    return fail(deps, assetNodes.map((n) => ({
      nodeId: n.id,
      message: (n.params as { fileName: string }).fileName ? 'Cần tải lại ảnh trước khi chạy.' : 'Chưa có ảnh.',
    })));
  }

  // Ảnh tham chiếu đi trong body sinh nền; guide (~20–60KB) cộng thêm lúc gửi – chừa biên trong ngưỡng.
  const tooBig = oversizeIssues(graph, drafts.drafts.map((d) => d.request));
  if (tooBig) return fail(deps, tooBig);

  deps.onRunInfo(genNode.id, { state: 'running' });
  deps.onRunInfo(composeNode.id, { state: 'queued' });
  const results: RatioResult[] = [];
  const backgrounds: string[] = [];
  for (const [i, { ratioId, request }] of drafts.drafts.entries()) {
    const prefix = drafts.drafts.length > 1 ? `Kích thước ${i + 1}/${drafts.drafts.length}: ` : '';
    let res: BackgroundResult;
    try {
      res = await deps.generateBackground(guideStyle === 'natural'
        ? { ...request, guideStyle }
        : { ...request, guideStyle, guideImage: await deps.renderGuide!(request.canvasConfig, request.guide) });
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) {
      const message = prefix + res.error;
      deps.onRunInfo(genNode.id, { state: 'error', message, previewUrl: backgrounds[0] });
      deps.onRunInfo(composeNode.id, { state: 'idle' });
      return { ok: false, errors: [{ message, nodeId: genNode.id }], results };
    }
    backgrounds.push(res.image);
    deps.onRunInfo(genNode.id, { state: 'running', previewUrl: backgrounds[0] });

    if (!deps.composeRatio) {
      results.push({ ratioId, canvasConfig: request.canvasConfig, image: res.image });
      continue;
    }
    deps.onRunInfo(composeNode.id, { state: 'running', previewUrl: results[0]?.image });
    try {
      const image = await deps.composeRatio({ job, plan: layout.plan, ratioId, background: res.image, dataUrls: runtime.dataUrls });
      results.push({ ratioId, canvasConfig: request.canvasConfig, image });
    } catch (e) {
      const message = prefix + (e instanceof Error ? e.message : 'Ghép layer thất bại.');
      deps.onRunInfo(genNode.id, { state: 'done', previewUrl: backgrounds[0] });
      deps.onRunInfo(composeNode.id, { state: 'error', message, previewUrl: results[0]?.image });
      return { ok: false, errors: [{ message, nodeId: composeNode.id }], results };
    }
  }

  deps.onRunInfo(genNode.id, { state: 'done', previewUrl: backgrounds[0] });
  if (!deps.composeRatio) {
    deps.onRunInfo(composeNode.id, { state: 'idle' });
    deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image });
    return { ok: true, results, warnings: [...warnings, { nodeId: composeNode.id, message: 'Môi trường hiện tại chưa ghép layer: kết quả là ảnh nền.' }] };
  }
  deps.onRunInfo(composeNode.id, { state: 'done', previewUrl: results[0]!.image });
  deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image });
  return { ok: true, results, warnings };
}

/**
 * Giới hạn body của /api/generate và /api/flow/generate-background (MAX_REQUEST_BODY_BYTES = 30MB ở route).
 * Chừa 1MB cho guide image + JSON khác. Base64 là ASCII nên độ dài chuỗi ≈ số byte.
 */
export const REQUEST_BODY_BUDGET_BYTES = 29 * 1024 * 1024;

function oversizeIssues(graph: FlowGraph, requests: unknown[]): RunIssue[] | null {
  const biggest = Math.max(0, ...requests.map((r) => JSON.stringify(r).length));
  if (biggest <= REQUEST_BODY_BUDGET_BYTES) return null;
  const mb = (biggest / 1024 / 1024).toFixed(1);
  const message = `Tổng dung lượng ảnh gửi đi ${mb}MB vượt giới hạn 29MB của server. Bỏ bớt ảnh tham chiếu hoặc dùng ảnh nhẹ hơn.`;
  const imageNodes = graph.nodes.filter((n) => n.type === 'reference-image' || n.type === 'product-asset');
  return imageNodes.length ? imageNodes.map((n) => ({ nodeId: n.id, message })) : [{ message }];
}

/** Form nghỉ 600ms giữa các kích thước phụ để đỡ dồn request lên Gemini. */
const BETWEEN_RATIOS_MS = 600;
function pause(deps: ExecutorDeps): Promise<void> {
  return (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(BETWEEN_RATIOS_MS);
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
