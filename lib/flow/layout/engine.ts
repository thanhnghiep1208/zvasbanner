/**
 * Layout engine – bản tối thiểu (T2.5). Pure function, deterministic.
 *
 * - Mỗi ratio: chọn variant đầu tiên của ratio class.
 * - Asset role `logo` → slot logo; `image`/`decoration` → slot product (nhiều asset chia đều theo chiều dài hơn).
 *   Asset giữ đúng tỉ lệ ảnh gốc, căn giữa ô.
 * - Text theo role vào slot cùng tên; `custom` dùng chung slot subheadline. Nhiều layer cùng slot chia đều theo chiều dọc.
 *   Chưa đo chữ: transform text = cả ô (đo + co chữ ở T4.1 khi có text renderer, T4.4).
 * - Override tay (`overrides[ratioId][elementId]`) luôn thắng.
 * Chưa có (T4.1): nhiều variant, co sản phẩm/chữ khi không vừa, báo lỗi không vừa.
 */
import type { CompiledJob } from '../compiled-job';
import type { FlowAsset, NodeParamsMap, PixelAssetRole, RatioSpec, TextRole, Transform } from '../schema';
import type {
  GuideRect, LayoutInput, LayoutPlan, LayoutResult, LayoutVariant, Rect, SlotKind,
} from './types';
import { classifyRatio, LAYOUT_VARIANTS } from './variants';

/** Khoảng cách giữa các ô khi chia slot, theo tỉ lệ kích thước slot. */
const GAP = 0.04;

type Element =
  | { id: string; kind: 'product' | 'logo'; asset: FlowAsset<PixelAssetRole> }
  | { id: string; kind: 'text'; layer: NodeParamsMap['text-layer'] };

const TEXT_SLOT: Record<TextRole, SlotKind> = {
  headline: 'headline',
  subheadline: 'subheadline',
  cta: 'cta',
  custom: 'subheadline',
};

export function planLayout(input: LayoutInput): LayoutResult {
  const plan: LayoutPlan = { variantId: {}, transforms: {}, guide: {} };

  for (const ratio of input.ratios) {
    if (!(ratio.width > 0 && ratio.height > 0)) {
      return { ok: false, reason: 'invalid-ratio', ratioId: ratio.id,
        message: `Kích thước ${ratio.name} không hợp lệ (${ratio.width}×${ratio.height}).` };
    }
    const variant = LAYOUT_VARIANTS[classifyRatio(ratio.width, ratio.height)][0]!;
    const transforms = layoutRatio(variant, ratio, input);
    const overrides = input.overrides[ratio.id] ?? {};
    for (const [id, t] of Object.entries(overrides)) if (id in transforms) transforms[id] = t;

    plan.variantId[ratio.id] = variant.id;
    plan.transforms[ratio.id] = transforms;
    plan.guide[ratio.id] = buildGuide(transforms, input);
  }
  return { ok: true, plan };
}

function layoutRatio(variant: LayoutVariant, ratio: RatioSpec, input: LayoutInput): Record<string, Transform> {
  const bySlot = new Map<SlotKind, Element[]>();
  const push = (slot: SlotKind, el: Element) => bySlot.set(slot, [...(bySlot.get(slot) ?? []), el]);

  for (const asset of input.products) {
    if (asset.role === 'logo') push('logo', { id: asset.assetId, kind: 'logo', asset });
    else push('product', { id: asset.assetId, kind: 'product', asset });
  }
  // Ổn định thứ tự text theo priority (số nhỏ trước), cùng priority giữ thứ tự gốc.
  const texts = input.textLayers.map((layer, i) => ({ layer, i }))
    .sort((a, b) => a.layer.priority - b.layer.priority || a.i - b.i);
  for (const { layer } of texts) push(TEXT_SLOT[layer.role], { id: layer.layerId, kind: 'text', layer });

  const out: Record<string, Transform> = {};
  for (const [slot, elements] of bySlot) {
    const rect = variant.slots[slot];
    const axis = elements[0]!.kind === 'text' ? 'vertical' : longerAxis(rect, ratio);
    const cells = splitRect(rect, elements.length, axis);
    elements.forEach((el, i) => {
      const cell = cells[i]!;
      out[el.id] = el.kind === 'text' ? rectToTransform(cell) : fitAsset(cell, el.asset.originalDims, ratio);
    });
  }
  return out;
}

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
export function planLayoutForJob(job: CompiledJob): LayoutResult {
  return planLayout({
    ratios: job.ratios,
    products: job.products,
    textLayers: job.textLayers,
    overrides: job.composed?.layoutOverrides ?? {},
  });
}
