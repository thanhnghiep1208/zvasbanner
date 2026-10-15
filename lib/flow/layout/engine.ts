/**
 * Layout engine (T4.1, SPEC 5.2). Pure function, deterministic.
 *
 * Mỗi ratio, thử lần lượt các variant của ratio class. Trong một variant, khi chữ không vừa:
 *   1. co vùng sản phẩm từ 100% xuống MIN_PRODUCT_SCALE (phần dư dồn cho chữ);
 *   2. co chữ từng bước, layer priority thấp (số lớn) co trước, không nhỏ hơn minFontSizePx;
 *   3. vẫn không vừa → variant kế tiếp;
 *   4. hết variant → { ok: false, reason: 'no-fit' } kèm id phần tử không vừa. KHÔNG tự bỏ phần tử.
 *
 * - Asset `logo` → slot logo; `image`/`decoration` → slot product (nhiều asset chia đều, giữ tỉ lệ ảnh gốc).
 * - Text theo role vào slot cùng tên, `custom` dùng chung slot subheadline; nhiều layer cùng slot xếp chồng dọc.
 *   Kích thước chữ px trong TextStyle tính trên cạnh ngắn 1080 → scale theo cạnh ngắn của ratio.
 * - Override tay (`overrides[ratioId][elementId]`) luôn thắng; phần tử bị override không tham gia xếp/đo.
 */
import type { CompiledJob } from '../compiled-job';
import type { FlowAsset, NodeParamsMap, PixelAssetRole, RatioSpec, TextRole, Transform } from '../schema';
import { approxMeasurer, layoutText, type TextBox, type TextMeasurer } from './measure';
import type {
  GuideRect, LayoutInput, LayoutPlan, LayoutResult, LayoutVariant, PlacedText, RatioClass, Rect, SlotKind,
} from './types';
import { classifyRatio, LAYOUT_VARIANTS, MIN_PRODUCT_SCALE } from './variants';

/** Khoảng cách giữa các ô khi chia slot, theo tỉ lệ kích thước slot. */
const GAP = 0.04;
/** Các bước co vùng sản phẩm. */
const PRODUCT_STEPS = [1, 0.9, 0.8, 0.7, MIN_PRODUCT_SCALE];
/** Mỗi bước co chữ giảm 6% cỡ hiện tại (tối thiểu 1px). */
const FONT_STEP = 0.94;

type TextLayer = NodeParamsMap['text-layer'];

const TEXT_SLOT: Record<TextRole, SlotKind> = {
  headline: 'headline',
  subheadline: 'subheadline',
  cta: 'cta',
  custom: 'subheadline',
};

export interface LayoutOptions {
  /** Mặc định approxMeasurer; T4.4 truyền measurer Canvas 2D thật. */
  measurer?: TextMeasurer;
  /** Mặc định LAYOUT_VARIANTS; truyền vào để test thứ tự thử variant. */
  variants?: Record<RatioClass, LayoutVariant[]>;
}

export function planLayout(input: LayoutInput, options: LayoutOptions = {}): LayoutResult {
  const measurer = options.measurer ?? approxMeasurer;
  const plan: LayoutPlan = { variantId: {}, productScale: {}, transforms: {}, text: {}, guide: {} };

  for (const ratio of input.ratios) {
    if (!(ratio.width > 0 && ratio.height > 0)) {
      return { ok: false, reason: 'invalid-ratio', ratioId: ratio.id,
        message: `Kích thước ${ratio.name} không hợp lệ (${ratio.width}×${ratio.height}).` };
    }
    const overrides = input.overrides[ratio.id] ?? {};
    const res = layoutRatio(ratio, input, overrides, measurer, options.variants ?? LAYOUT_VARIANTS);
    if (!res.ok) {
      const names = res.elementIds.map((id) => `"${input.textLayers.find((l) => l.layerId === id)?.content ?? id}"`);
      return {
        ok: false, reason: 'no-fit', ratioId: ratio.id, elementIds: res.elementIds,
        message: `${ratio.name} (${ratio.width}×${ratio.height}): không đủ chỗ cho ${names.join(', ')}. `
          + 'Rút gọn nội dung, tăng số dòng tối đa hoặc giảm cỡ chữ tối thiểu.',
      };
    }
    const transforms = res.transforms;
    for (const [id, t] of Object.entries(overrides)) if (isElement(id, input)) transforms[id] = t;

    plan.variantId[ratio.id] = res.variantId;
    plan.productScale[ratio.id] = res.productScale;
    plan.transforms[ratio.id] = transforms;
    plan.text[ratio.id] = res.text;
    plan.guide[ratio.id] = buildGuide(transforms, input);
  }
  return { ok: true, plan };
}

/* ── Một ratio ──────────────────────────────────────────────── */

type RatioOk = {
  ok: true; variantId: string; productScale: number;
  transforms: Record<string, Transform>; text: Record<string, PlacedText>;
};
type RatioFail = { ok: false; elementIds: string[] };

function layoutRatio(
  ratio: RatioSpec,
  input: LayoutInput,
  overrides: Record<string, Transform>,
  measurer: TextMeasurer,
  variants: Record<RatioClass, LayoutVariant[]>,
): RatioOk | RatioFail {
  const scale = Math.min(ratio.width, ratio.height) / 1080;
  const free = (id: string) => !(id in overrides);
  const products = input.products.filter((a) => a.role !== 'logo' && free(a.assetId));
  const logos = input.products.filter((a) => a.role === 'logo' && free(a.assetId));
  const texts = sortByPriority(input.textLayers.filter((l) => free(l.layerId)));

  let lastFail: string[] = [];
  for (const variant of variants[classifyRatio(ratio.width, ratio.height)]) {
    const fit = fitVariant(variant, ratio, texts, scale, measurer);
    if (!fit.ok) {
      lastFail = fit.elementIds;
      continue;
    }
    const slots = variant.slots(fit.productScale);
    const transforms: Record<string, Transform> = {};
    placeAssets(slots.product, products, ratio, transforms);
    placeAssets(slots.logo, logos, ratio, transforms);
    for (const [slot, placed] of fit.bySlot) placeTextStack(slots[slot], placed, ratio, transforms);
    if (variant.packText) packTextColumn(slots, fit.bySlot, ratio, transforms);
    const text = Object.fromEntries(
      [...fit.bySlot.values()].flat().map((p) => [p.layer.layerId, { fontSizePx: p.fontSizePx, lines: p.box.lines }]),
    );
    return { ok: true, variantId: variant.id, productScale: fit.productScale, transforms, text };
  }
  return { ok: false, elementIds: lastFail };
}

type Placed = { layer: TextLayer; fontSizePx: number; box: TextBox };

/** Thử co sản phẩm, rồi co chữ theo priority; trả cỡ chữ cuối cùng của từng layer. */
function fitVariant(
  variant: LayoutVariant, ratio: RatioSpec, texts: TextLayer[], scale: number, measurer: TextMeasurer,
): { ok: true; productScale: number; bySlot: Map<SlotKind, Placed[]> } | RatioFail {
  const size = new Map(texts.map((l) => [l.layerId, l.style.fontSizePx * scale]));
  const min = new Map(texts.map((l) => [l.layerId, Math.min(l.minFontSizePx, l.style.fontSizePx) * scale]));

  const attempt = (s: number) => {
    const slots = variant.slots(s);
    const bySlot = new Map<SlotKind, Placed[]>();
    for (const layer of texts) {
      const slot = TEXT_SLOT[layer.role];
      const rect = slots[slot];
      const fontSizePx = size.get(layer.layerId)!;
      const box = layoutText(layer.content, layer.style, fontSizePx, rect.w * ratio.width, scale, measurer);
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), { layer, fontSizePx, box }]);
    }
    // Slot vừa khi không layer nào tràn và tổng chiều cao (kèm khoảng cách) ≤ chiều cao slot.
    const failing = [...bySlot].filter(([slot, placed]) =>
      placed.some((p) => p.box.overflow) || stackHeight(placed, slots[slot], ratio) > slots[slot].h * ratio.height);
    return { bySlot, failing };
  };

  // 1. Co sản phẩm.
  for (const s of PRODUCT_STEPS) {
    const r = attempt(s);
    if (!r.failing.length) return { ok: true, productScale: s, bySlot: r.bySlot };
  }

  // 2. Ở scale nhỏ nhất, co chữ: trong các slot còn tràn, co layer priority thấp nhất còn co được.
  const s = MIN_PRODUCT_SCALE;
  for (;;) {
    const r = attempt(s);
    if (!r.failing.length) return { ok: true, productScale: s, bySlot: r.bySlot };
    const candidates = r.failing.flatMap(([, placed]) => placed)
      .filter((p) => size.get(p.layer.layerId)! > min.get(p.layer.layerId)! + 1e-6);
    if (!candidates.length) {
      return { ok: false, elementIds: r.failing.flatMap(([, placed]) => placed.map((p) => p.layer.layerId)) };
    }
    // Priority số lớn = ưu tiên thấp → co trước; cùng priority: layer sau co trước.
    const target = candidates.reduce((a, b) => (b.layer.priority >= a.layer.priority ? b : a));
    const id = target.layer.layerId;
    const next = Math.min(size.get(id)! * FONT_STEP, size.get(id)! - 1);
    size.set(id, Math.max(next, min.get(id)!));
  }
}

const COLUMN_ORDER: SlotKind[] = ['headline', 'subheadline', 'cta'];

/**
 * Dồn các khối chữ của cột thành 1 nhóm liền, khoảng cách đều (≤ 3% chiều cao canvas), nhóm căn giữa
 * trong khoảng [đỉnh slot headline, đáy slot CTA]. Chỉ dịch dọc – ngang giữ theo `align` của từng layer.
 * Mỗi khối đã vừa slot của nó nên tổng chiều cao luôn ≤ khoảng cột.
 */
function packTextColumn(
  slots: Record<SlotKind, Rect>, bySlot: Map<SlotKind, Placed[]>, ratio: RatioSpec, out: Record<string, Transform>,
) {
  const H = ratio.height;
  const ids = COLUMN_ORDER.flatMap((s) => (bySlot.get(s) ?? []).map((p) => p.layer.layerId));
  if (ids.length < 2) return;
  const top = slots.headline.y * H;
  const bottom = (slots.cta.y + slots.cta.h) * H;
  const heights = ids.map((id) => out[id]!.h * H);
  const total = heights.reduce((a, b) => a + b, 0);
  const gap = Math.max(0, Math.min(0.03 * H, (bottom - top - total) / (ids.length - 1)));
  let y = top + (bottom - top - total - gap * (ids.length - 1)) / 2;
  ids.forEach((id, i) => {
    out[id] = { ...out[id]!, cy: (y + heights[i]! / 2) / H };
    y += heights[i]! + gap;
  });
}

function stackGap(slot: Rect, ratio: RatioSpec): number {
  return slot.h * ratio.height * GAP;
}

function stackHeight(placed: Placed[], slot: Rect, ratio: RatioSpec): number {
  return placed.reduce((h, p) => h + p.box.height, 0) + stackGap(slot, ratio) * (placed.length - 1);
}

/** Xếp chồng các layer trong slot, cả khối căn giữa dọc; ngang theo `style.align`. */
function placeTextStack(slot: Rect, placed: Placed[], ratio: RatioSpec, out: Record<string, Transform>) {
  const W = ratio.width;
  const H = ratio.height;
  const gap = stackGap(slot, ratio);
  let y = slot.y * H + (slot.h * H - stackHeight(placed, slot, ratio)) / 2;
  for (const p of placed) {
    const left = slot.x * W;
    const right = (slot.x + slot.w) * W;
    const x = p.layer.style.align === 'left' ? left
      : p.layer.style.align === 'right' ? right - p.box.width
      : (left + right - p.box.width) / 2;
    out[p.layer.layerId] = {
      cx: (x + p.box.width / 2) / W,
      cy: (y + p.box.height / 2) / H,
      w: p.box.width / W,
      h: p.box.height / H,
      rotationDeg: 0,
    };
    y += p.box.height + gap;
  }
}

function placeAssets(slot: Rect, assets: FlowAsset<PixelAssetRole>[], ratio: RatioSpec, out: Record<string, Transform>) {
  if (!assets.length) return;
  const cells = splitRect(slot, assets.length, longerAxis(slot, ratio));
  assets.forEach((a, i) => { out[a.assetId] = fitAsset(cells[i]!, a.originalDims, ratio); });
}

function sortByPriority(layers: TextLayer[]): TextLayer[] {
  return layers.map((layer, i) => ({ layer, i }))
    .sort((a, b) => a.layer.priority - b.layer.priority || a.i - b.i)
    .map(({ layer }) => layer);
}

function isElement(id: string, input: LayoutInput): boolean {
  return input.products.some((a) => a.assetId === id) || input.textLayers.some((l) => l.layerId === id);
}

/* ── Hình học ───────────────────────────────────────────────── */

/** Chiều dài hơn của slot tính theo pixel thật của ratio. */
function longerAxis(r: Rect, ratio: RatioSpec): 'horizontal' | 'vertical' {
  return r.w * ratio.width >= r.h * ratio.height ? 'horizontal' : 'vertical';
}

export function splitRect(r: Rect, n: number, axis: 'horizontal' | 'vertical'): Rect[] {
  if (n <= 1) return [r];
  const total = axis === 'horizontal' ? r.w : r.h;
  const gap = total * GAP;
  const size = (total - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) =>
    axis === 'horizontal'
      ? { x: r.x + i * (size + gap), y: r.y, w: size, h: r.h }
      : { x: r.x, y: r.y + i * (size + gap), w: r.w, h: size });
}

/** Contain: giữ tỉ lệ ảnh gốc, lớn nhất có thể trong ô, căn giữa. */
export function fitAsset(cell: Rect, dims: { width: number; height: number }, ratio: RatioSpec): Transform {
  const cellW = cell.w * ratio.width;
  const cellH = cell.h * ratio.height;
  const aspect = dims.width > 0 && dims.height > 0 ? dims.width / dims.height : 1;
  const [pw, ph] = aspect > cellW / cellH ? [cellW, cellW / aspect] : [cellH * aspect, cellH];
  return {
    cx: cell.x + cell.w / 2,
    cy: cell.y + cell.h / 2,
    w: pw / ratio.width,
    h: ph / ratio.height,
    rotationDeg: 0,
  };
}

export function rectToTransform(r: Rect): Transform {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, rotationDeg: 0 };
}

export function transformToRect(t: Transform): Rect {
  return { x: t.cx - t.w / 2, y: t.cy - t.h / 2, w: t.w, h: t.h };
}

function buildGuide(transforms: Record<string, Transform>, input: LayoutInput): GuideRect[] {
  const kindOf = new Map<string, GuideRect['kind']>([
    ...input.products.map((a) => [a.assetId, a.role === 'logo' ? 'logo' : 'product'] as const),
    ...input.textLayers.map((l) => [l.layerId, 'text'] as const),
  ]);
  return Object.entries(transforms).map(([elementId, t]) => ({
    elementId, kind: kindOf.get(elementId)!, ...transformToRect(t),
  }));
}

/** Layout cho job composed: overrides lấy từ node Auto Layout (`composed.layoutOverrides`). */
export function planLayoutForJob(job: CompiledJob, options?: LayoutOptions): LayoutResult {
  return planLayout({
    ratios: job.ratios,
    products: job.products,
    textLayers: job.textLayers,
    overrides: job.composed?.layoutOverrides ?? {},
  }, options);
}
