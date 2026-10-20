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
import { compileAll } from './compiler';
import { toBackgroundRequests, type BackgroundRequest, type BackgroundRequestDraft, type GuideStyle } from './background/request';
import { planLayoutForJob } from './layout/engine';
import type { TextMeasurer } from './layout/measure';
import type { GuideRect, LayoutPlan } from './layout/types';
import { adaptationRetryPrompt, toLegacyConfig, type LegacyIssue } from './legacy/to-legacy-config';
import { exportedRatios } from './compiled-job';
import { hashParts, hashString, nodeKeys } from './cache-keys';
import { NODE_DEFINITIONS } from './node-definitions';
import type { LegacyRuntime } from './legacy/from-legacy-config';
import type { NodeRunInfo } from './run-state';
import type { FlowAsset, FlowGraph } from './schema';
import { dataUrlByteSize, REFERENCE_MAX_BYTES, referenceTooBigMessage } from './asset-limits';

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
  /** Cache ảnh theo step key (T4.7): trúng → không gọi API, 0 lượt AI. */
  cache?: ImageCache;
  /** "Chạy lại từ node này": các node (node + downstream) bỏ qua cache để lấy biến thể mới. */
  forceNodes?: ReadonlySet<string>;
}

export interface ImageCache {
  get(key: string): string | undefined;
  set(key: string, image: string): void;
}

/*
 * ── Step key (T4.7) ───────────────────────────────────────────────
 * Key cache của bước tốn AI = hash NỘI DUNG request gửi đi (ảnh lớn thay bằng hash của nó): kết quả chỉ phụ thuộc
 * request. Nhờ vậy đổi thứ không vào request (vd. màu chữ – chỉ ảnh hưởng bước ghép) vẫn trúng cache nền.
 * Key Merkle theo node (cache-keys.ts) chỉ dùng hiển thị "Cần chạy lại". Dùng chung executor & pendingAiCalls.
 */
const stripAssets = (r: GenerationRequest) => ({
  ...r,
  assets: r.assets.map(({ dataUrl, ...a }) => ({ ...a, data: dataUrl ? hashString(dataUrl) : null })),
  layoutAdaptationFromBanner: r.layoutAdaptationFromBanner ? hashString(r.layoutAdaptationFromBanner) : undefined,
});
/** Flat kích thước đầu. */
export const flatStepKey = (request: GenerationRequest) => hashParts('flat', stripAssets(request));
/** Flat kích thước phụ: request đã thích nghi (ảnh đầu nằm trong layoutAdaptationFromBanner → được hash). */
export const flatAdaptStepKey = (adapted: GenerationRequest) => hashParts('flat-adapt', stripAssets(adapted));
/** Composed: request sinh nền (không gồm guide image – vẽ từ `guide`) + cách truyền vùng trống. */
export const backgroundStepKey = (draft: BackgroundRequestDraft, guideStyle: GuideStyle) =>
  hashParts('bg', guideStyle, {
    ...draft,
    references: draft.references.map((r) => ({ ...r, dataUrl: hashString(r.dataUrl) })),
    ...(draft.sceneAnchor ? { sceneAnchor: hashString(draft.sceneAnchor) } : {}),
  });

/** Kích thước sau kích thước đầu nhận nền đầu làm SCENE ANCHOR (đồng bộ cảnh/màu giữa các kích thước). */
const withAnchor = (request: BackgroundRequestDraft, i: number, first: string | undefined): BackgroundRequestDraft =>
  i > 0 && first ? { ...request, sceneAnchor: first } : request;

/**
 * Flat: ảnh sản phẩm/logo/trang trí đi qua AI nên luôn bật "giữ nguyên chủ thể" (không đổi tỉ lệ, màu, hình dạng),
 * bất kể giá trị trong node hay payload form cũ. Chỉ composed mới giữ pixel tuyệt đối (ghép, không qua AI).
 */
function lockAssets(request: GenerationRequest): GenerationRequest {
  return request.styleControls.strictPreserveMode ? request
    : { ...request, styleControls: { ...request.styleControls, strictPreserveMode: true } };
}

/** Request kích thước phụ – giống "Biến thể kích thước" của form (AdditionalCanvasSizesPanel). */
function adaptRequest(request: GenerationRequest, firstImage: string): GenerationRequest {
  return {
    ...request,
    imageModel: 'nano-banana-2',
    styleControls: { ...request.styleControls, strictPreserveMode: true },
    layoutAdaptationFromBanner: firstImage,
  };
}

export interface RatioResult {
  ratioId: string;
  /** Xuất ảnh nối cả 2 nhánh: kết quả thuộc nhánh nào (tên file, nhãn). 1 nhánh → không có. */
  branch?: CompiledJob['renderMode'];
  canvasConfig: CanvasConfig;
  image: string;
}

export interface RunIssue {
  message: string;
  nodeId?: string;
}

export type RunOutcome =
  /** `reused` = số kích thước lấy từ cache (không tốn lượt AI). */
  | { ok: true; results: RatioResult[]; warnings: RunIssue[]; reused: number }
  | { ok: false; errors: RunIssue[]; results: RatioResult[] };

export async function runAll(graph: FlowGraph, runtime: LegacyRuntime, deps: ExecutorDeps): Promise<RunOutcome> {
  const compiled = compileAll(graph);
  if (!compiled.ok) {
    return fail(deps, compiled.errors.map((e) => ({ message: e.message, nodeId: e.nodeId })));
  }

  // Ảnh tham chiếu đi nguyên trong body request → giới hạn riêng (asset-limits.ts), chặn trước khi tốn lượt AI.
  const heavyRefs = graph.nodes.filter((n) => n.type === 'reference-image').filter((n) => {
    const data = runtime.dataUrls[(n.params as FlowAsset).assetId];
    return data !== undefined && dataUrlByteSize(data) > REFERENCE_MAX_BYTES;
  });
  if (heavyRefs.length) {
    return fail(deps, heavyRefs.map((n) => ({ nodeId: n.id, message: referenceTooBigMessage((n.params as FlowAsset).fileName) })));
  }

  // Key theo graph đầy đủ: node Xuất ảnh trong nhánh có ít input hơn → key khác, sẽ luôn hiện "Cần chạy lại".
  const keys = nodeKeys(graph);
  const warnings: RunIssue[] = compiled.warnings.map((w) => ({ message: w.message, nodeId: w.nodeId }));
  const { branches } = compiled;
  if (branches.length === 1) return runBranch(branches[0]!.graph, branches[0]!.job, warnings, runtime, deps, keys);

  // 2 nhánh: chạy lần lượt, nhánh lỗi không chặn nhánh còn lại; gộp kết quả.
  const results: RatioResult[] = [];
  const errors: RunIssue[] = [];
  const allWarnings = [...warnings];
  let reused = 0;
  for (const [i, b] of branches.entries()) {
    if (i > 0) await pause(deps);
    const out = await runBranch(b.graph, b.job, [], runtime, deps, keys);
    results.push(...out.results.map((r) => ({ ...r, branch: b.job.renderMode })));
    if (out.ok) { reused += out.reused; allWarnings.push(...out.warnings); } else errors.push(...out.errors);
  }
  const exportNode = graph.nodes.find((n) => n.type === 'export')!;
  if (results.length) deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image, key: errors.length ? undefined : keys[exportNode.id] });
  return errors.length ? { ok: false, errors, results } : { ok: true, results, warnings: allWarnings, reused };
}

async function runBranch(
  graph: FlowGraph, job: CompiledJob, compiledWarnings: RunIssue[], runtime: LegacyRuntime, deps: ExecutorDeps,
  keys: Record<string, string>,
): Promise<RunOutcome> {
  if (job.renderMode === 'composed') return runComposed(graph, job, runtime, deps, compiledWarnings, keys);

  const exportNode = graph.nodes.find((n) => n.type === 'export')!;
  const execNode = graph.nodes.find((n) => n.id === graph.edges.find((e) => e.target === exportNode.id)!.source)!;

  const legacy = toLegacyConfig(job, runtime);
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
      message: (n.params as { fileName: string }).fileName ? 'Cần tải lại ảnh trước khi chạy.' : 'Cần tải ảnh lên trước khi chạy.',
    })));
  }

  // Chỉ sinh kích thước được xuất (T4.6), giữ thứ tự node Kích thước.
  const exported = new Set(exportedRatios(job).map((r) => r.id));
  const requests = legacy.requests.filter((r) => exported.has(r.ratioId)).map((r) => ({ ...r, request: lockAssets(r.request) }));

  // Body quá giới hạn server → 413 sau khi đã chờ; chặn sớm, báo trên các node ảnh.
  const tooBig = oversizeIssues(graph, requests.map((r) => r.request));
  if (tooBig) return fail(deps, tooBig);

  // Q9A: text không map được → vẫn chạy, chỉ cảnh báo.
  const warnings: RunIssue[] = [
    ...compiledWarnings,
    ...legacy.warnings.filter((w) => w.code === 'unmapped-text').flatMap((w) => textWarnings(graph, w)),
  ];

  deps.onRunInfo(execNode.id, { state: 'running' });
  deps.onRunInfo(exportNode.id, { state: 'queued' });

  const force = deps.forceNodes?.has(execNode.id) ?? false;
  let reused = 0;
  let called = 0;
  const results: RatioResult[] = [];
  const retryPrompt = adaptationRetryPrompt(job);
  for (const [i, { ratioId, request }] of requests.entries()) {
    const first = results[0];
    const adapted = first ? adaptRequest(request, first.image) : undefined;
    const stepKey = adapted ? flatAdaptStepKey(adapted) : flatStepKey(request);
    const hit = force ? undefined : deps.cache?.get(stepKey);
    if (hit) {
      reused++;
      results.push({ ratioId, canvasConfig: request.canvasConfig, image: hit });
      deps.onRunInfo(execNode.id, { state: 'running', previewUrl: results[0]!.image });
      continue;
    }
    if (called++ > 0) await pause(deps);
    let res: GenerateResult;
    if (!first) {
      res = await deps.generate(request);
    } else {
      // Kích thước phụ: thích nghi từ ảnh đầu, ép Nano Banana 2.1 + giữ nguyên chủ thể; lỗi/placeholder thì thử lại
      // 1 lần với prompt "layout translation" (giống form).
      res = await deps.generate(adapted!);
      if (!res.ok || res.source === 'placeholder') res = await deps.generate({ ...adapted!, userPrompt: retryPrompt });
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
    deps.cache?.set(stepKey, res.image);
    results.push({ ratioId, canvasConfig: request.canvasConfig, image: res.image });
    deps.onRunInfo(execNode.id, { state: 'running', previewUrl: results[0]!.image });
  }

  deps.onRunInfo(execNode.id, { state: 'done', previewUrl: results[0]!.image, key: keys[execNode.id] });
  deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image, key: keys[exportNode.id] });
  return { ok: true, results, warnings, reused };
}

/* ── Composed (T4.2) ────────────────────────────────────────── */

async function runComposed(
  graph: FlowGraph, job: CompiledJob, runtime: LegacyRuntime, deps: ExecutorDeps, warnings: RunIssue[],
  keys: Record<string, string>,
): Promise<RunOutcome> {
  const byType = (t: string) => graph.nodes.find((n) => n.type === t)!;
  const layoutNode = byType('auto-layout');
  const genNode = byType('generate-background');
  const composeNode = byType('compose');
  const exportNode = byType('export');

  const guideStyle = deps.guideStyle ?? 'hatched';
  if (!deps.generateBackground || (guideStyle === 'hatched' && !deps.renderGuide)) {
    return fail(deps, [{ nodeId: genNode.id, message: 'Môi trường hiện tại chưa hỗ trợ tạo nền.' }]);
  }

  const layout = planLayoutForJob(job, { measurer: deps.measurer });
  if (!layout.ok) return fail(deps, [{ nodeId: layoutNode.id, message: layout.message }]);
  deps.onRunInfo(layoutNode.id, { state: 'done', key: keys[layoutNode.id] });

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
      message: (n.params as { fileName: string }).fileName ? 'Cần tải lại ảnh trước khi chạy.' : 'Cần tải ảnh lên trước khi chạy.',
    })));
  }

  // Ảnh tham chiếu đi trong body sinh nền; guide (~20–60KB) cộng thêm lúc gửi – chừa biên trong ngưỡng.
  const tooBig = oversizeIssues(graph, drafts.drafts.map((d) => d.request));
  if (tooBig) return fail(deps, tooBig);

  deps.onRunInfo(genNode.id, { state: 'running' });
  deps.onRunInfo(composeNode.id, { state: 'queued' });
  const results: RatioResult[] = [];
  const backgrounds: string[] = [];
  const force = deps.forceNodes?.has(genNode.id) ?? false;
  let reused = 0;
  for (const [i, { ratioId, request: draft }] of drafts.drafts.entries()) {
    const prefix = drafts.drafts.length > 1 ? `Kích thước ${i + 1}/${drafts.drafts.length}: ` : '';
    const request = withAnchor(draft, i, backgrounds[0]);
    const stepKey = backgroundStepKey(request, guideStyle);
    const hit = force ? undefined : deps.cache?.get(stepKey);
    let res: BackgroundResult;
    if (hit) {
      reused++;
      res = { ok: true, image: hit };
    } else {
      try {
        res = await deps.generateBackground(guideStyle === 'natural'
          ? { ...request, guideStyle }
          : { ...request, guideStyle, guideImage: await deps.renderGuide!(request.canvasConfig, request.guide) });
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (res.ok) deps.cache?.set(stepKey, res.image);
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

  deps.onRunInfo(genNode.id, { state: 'done', previewUrl: backgrounds[0], key: keys[genNode.id] });
  if (!deps.composeRatio) {
    deps.onRunInfo(composeNode.id, { state: 'idle' });
    deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image, key: keys[exportNode.id] });
    return { ok: true, reused, results, warnings: [...warnings, { nodeId: composeNode.id, message: 'Môi trường hiện tại chưa ghép layer: kết quả là ảnh nền.' }] };
  }
  deps.onRunInfo(composeNode.id, { state: 'done', previewUrl: results[0]!.image, key: keys[composeNode.id] });
  deps.onRunInfo(exportNode.id, { state: 'done', previewUrl: results[0]!.image, key: keys[exportNode.id] });
  return { ok: true, results, warnings, reused };
}

/**
 * Số lượt AI thực sự cần cho lần chạy tới (T4.7): như estimateAiCalls nhưng trừ kích thước đã có trong cache.
 * Cùng step key với executor. Flat: kích thước phụ chỉ biết key khi ảnh đầu có trong cache.
 * `null` = graph chưa chạy được (lỗi compile).
 */
export function pendingAiCalls(
  graph: FlowGraph,
  runtime: LegacyRuntime,
  cache: Pick<ImageCache, 'get'> | undefined,
  opts: { guideStyle?: GuideStyle; forceNodes?: ReadonlySet<string>; measurer?: TextMeasurer } = {},
): { calls: number; reused: number } | null {
  const compiled = compileAll(graph);
  if (!compiled.ok) return null;
  let calls = 0;
  let reused = 0;
  for (const b of compiled.branches) {
    const p = branchPendingAiCalls(b.graph, b.job, runtime, cache, opts);
    calls += p.calls;
    reused += p.reused;
  }
  return { calls, reused };
}

function branchPendingAiCalls(
  graph: FlowGraph, job: CompiledJob, runtime: LegacyRuntime, cache: Pick<ImageCache, 'get'> | undefined,
  opts: { guideStyle?: GuideStyle; forceNodes?: ReadonlySet<string>; measurer?: TextMeasurer },
): { calls: number; reused: number } {
  const exported = exportedRatios(job);
  const forced = (type: string) => graph.nodes.some((n) => n.type === type && opts.forceNodes?.has(n.id));

  if (job.renderMode === 'composed') {
    const per = NODE_DEFINITIONS['generate-background'].aiCallsPerRatio;
    const layout = planLayoutForJob(job, { measurer: opts.measurer });
    const drafts = layout.ok ? toBackgroundRequests({ ...job, ratios: exported }, layout.plan, runtime) : null;
    if (!drafts?.ok) return { calls: exported.length * per, reused: 0 };
    if (forced('generate-background')) return { calls: drafts.drafts.length * per, reused: 0 };
    // Kích thước sau phụ thuộc nền đầu (SCENE ANCHOR): chỉ tính được key khi nền đầu có trong cache.
    let hits = 0;
    let first: string | undefined;
    for (const [i, d] of drafts.drafts.entries()) {
      const img = i > 0 && !first ? undefined : cache?.get(backgroundStepKey(withAnchor(d.request, i, first), opts.guideStyle ?? 'hatched'));
      if (i === 0) first = img;
      if (img) hits++;
    }
    return { calls: (drafts.drafts.length - hits) * per, reused: hits };
  }
  const per = NODE_DEFINITIONS['generate-flat'].aiCallsPerRatio;
  const legacy = toLegacyConfig(job, runtime);
  if (!legacy.ok) return { calls: exported.length * per, reused: 0 };
  const ids = new Set(exported.map((r) => r.id));
  const requests = legacy.requests.filter((r) => ids.has(r.ratioId)).map((r) => ({ ...r, request: lockAssets(r.request) }));
  if (forced('generate-flat')) return { calls: requests.length * per, reused: 0 };
  let hits = 0;
  let first: string | undefined;
  for (const [i, { request }] of requests.entries()) {
    // Kích thước phụ chỉ tính được key khi đã có ảnh đầu (từ cache).
    const img = i === 0 ? cache?.get(flatStepKey(request))
      : first !== undefined ? cache?.get(flatAdaptStepKey(adaptRequest(request, first))) : undefined;
    if (i === 0) first = img;
    if (img) hits++;
  }
  return { calls: (requests.length - hits) * per, reused: hits };
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
    ? 'Chế độ composed chưa chạy được (cần route tạo nền mới, T4.2). Dùng Tạo banner (flat).'
    : issue.message;
}

function textWarnings(graph: FlowGraph, w: LegacyIssue): RunIssue[] {
  return graph.nodes
    .filter((n) => n.type === 'text-layer' && w.refs!.includes((n.params as { layerId: string }).layerId))
    .map((n) => ({ nodeId: n.id, message: 'Text này không được gửi: form cũ chỉ có 1 tiêu đề chính, 1 tiêu đề phụ, 1 CTA.' }));
}
