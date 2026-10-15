/**
 * Executor tối thiểu (T2.6): Run all → compile → toLegacyConfig → gọi API hiện có → kết quả theo ratio.
 *
 * Domain thuần: không gọi fetch trực tiếp. UI truyền `generate` (bọc requestGenerationWithPayload
 * trong lib/client-generation.ts) và `onRunInfo` để cập nhật trạng thái node.
 *
 * Nhiều ratio: ratio đầu sinh từ đầu; các ratio sau gửi kèm `layoutAdaptationFromBanner` = ảnh ratio đầu,
 * giống "Biến thể kích thước" của form (AdditionalCanvasSizesPanel). Chạy tuần tự, tôn trọng rate limit.
 * Chưa có (T4.7): cache, stale, Run từ node.
 */
import type { CanvasConfig, GenerationRequest } from '@/lib/types';
import { compileGraph } from './compiler';
import { toLegacyConfig, type LegacyIssue } from './legacy/to-legacy-config';
import type { LegacyRuntime } from './legacy/from-legacy-config';
import type { NodeRunInfo } from './run-state';
import type { FlowGraph } from './schema';

export type GenerateResult =
  | { ok: true; image: string; source: 'gemini' | 'placeholder'; placeholderError?: string }
  | { ok: false; error: string };

export interface ExecutorDeps {
  generate: (request: GenerationRequest) => Promise<GenerateResult>;
  onRunInfo: (nodeId: string, info: NodeRunInfo) => void;
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
