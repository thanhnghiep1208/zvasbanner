/**
 * Layout engine – kiểu dữ liệu (SPEC 5.2).
 * Toạ độ chuẩn hoá 0–1 theo canvas của từng ratio.
 */
import type { CompiledJob } from '../compiled-job';
import type { Transform } from '../schema';

export type RatioClass = 'ultra-wide' | 'landscape' | 'square' | 'portrait';

export type SlotKind = 'product' | 'logo' | 'headline' | 'subheadline' | 'cta';

/** Hình chữ nhật chuẩn hoá, gốc ở góc trên trái. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutVariant {
  id: string;
  ratioClass: RatioClass;
  slots: Record<SlotKind, Rect>;
}

/** Vùng vẽ lên layout guide image cho Generate BG (khối xám = "giữ sạch vùng này"). */
export interface GuideRect extends Rect {
  elementId: string;
  kind: 'product' | 'logo' | 'text';
}

export interface LayoutPlan {
  /** Variant đã dùng theo ratio. */
  variantId: Record<string, string>;
  /** transforms[ratioId][elementId]; elementId = assetId (asset) | layerId (text). */
  transforms: Record<string, Record<string, Transform>>;
  guide: Record<string, GuideRect[]>;
}

export type LayoutResult =
  | { ok: true; plan: LayoutPlan }
  | { ok: false; reason: 'invalid-ratio'; ratioId: string; message: string };

export type LayoutInput = Pick<CompiledJob, 'ratios' | 'products' | 'textLayers'> & {
  overrides: Record<string, Record<string, Transform>>;
};
