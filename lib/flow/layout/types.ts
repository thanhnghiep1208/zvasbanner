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
  /**
   * Slot theo `productScale` ∈ [MIN_PRODUCT_SCALE, 1]: co vùng sản phẩm thì vùng chữ được nới ra.
   * Mọi giá trị scale đều phải cho slot nằm trong vùng an toàn và không chồng nhau (có test).
   */
  slots: (productScale: number) => Record<SlotKind, Rect>;
  /**
   * Cột chữ: sau khi đo, xếp headline → subheadline → CTA thành 1 khối liền (khoảng cách đều),
   * cả khối căn giữa dọc trong cột – thay vì mỗi chữ căn giữa trong ô riêng (để lại khoảng trống lớn).
   */
  packText?: boolean;
}

/** Vùng vẽ lên layout guide image cho Generate BG (khối xám = "giữ sạch vùng này"). */
export interface GuideRect extends Rect {
  elementId: string;
  kind: 'product' | 'logo' | 'text';
}

/** Chữ đã đặt: cỡ thật (px canvas của ratio) + các dòng sau khi xuống dòng – renderer vẽ đúng như vậy. */
export interface PlacedText {
  fontSizePx: number;
  lines: string[];
}

export interface LayoutPlan {
  /** Variant đã dùng theo ratio. */
  variantId: Record<string, string>;
  /** Tỉ lệ vùng sản phẩm đã dùng theo ratio (1 = không co). */
  productScale: Record<string, number>;
  /** transforms[ratioId][elementId]; elementId = assetId (asset) | layerId (text). */
  transforms: Record<string, Record<string, Transform>>;
  /** text[ratioId][layerId] – không có với layer bị override tay. */
  text: Record<string, Record<string, PlacedText>>;
  guide: Record<string, GuideRect[]>;
}

export type LayoutResult =
  | { ok: true; plan: LayoutPlan }
  | { ok: false; reason: 'invalid-ratio'; ratioId: string; message: string }
  /** Không variant nào chứa đủ chữ dù đã co sản phẩm + chữ tới tối thiểu. Không bao giờ tự bỏ phần tử. */
  | { ok: false; reason: 'no-fit'; ratioId: string; elementIds: string[]; message: string };

export type LayoutInput = Pick<CompiledJob, 'ratios' | 'products' | 'textLayers'> & {
  overrides: Record<string, Record<string, Transform>>;
};
