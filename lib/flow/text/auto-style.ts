/**
 * Kiểu chữ tự động cho text layer (`autoStyle`): chữ hợp với banner mà user không phải tự chỉnh font/cỡ/màu.
 *
 * 2 bước, vì màu chỉ biết được khi đã có nền thật:
 * 1. `autoTypography` – font, độ đậm, cỡ, IN HOA, giãn chữ, khung nút CTA theo node Phong cách + Brand kit.
 *    Chạy trước layout (ảnh hưởng đo chữ) – compiler, validate và Inspector dùng chung nên đo/vẽ khớp nhau.
 * 2. `autoTextColors` – màu chữ, bóng chữ, màu nút theo vùng nền ngay dưới chữ (đo lúc ghép, compose-render.ts):
 *    ưu tiên màu thương hiệu nếu đủ tương phản, không thì trắng/đen; nền rối hoặc tương phản thấp thì thêm bóng.
 * Thuần, không DOM.
 */
import type { BrandKit } from '@/lib/types';
import { fontIdFromLabel, isHexColor } from '../brand';
import type { FlowStyle, NodeParamsMap, TextRole } from '../schema';
import { DEFAULT_STYLE } from '../schema';
import { FONT_FOR_STYLE, TEXT_ROLE_DEFAULTS, type FontId, type HexColor, type TextStyle } from './text-style';

type TextLayer = NodeParamsMap['text-layer'];

export interface AutoStyleContext {
  style?: FlowStyle;
  brandKit?: BrandKit;
}

/** Cỡ tiêu đề (px tại cạnh ngắn 1080) theo phong cách: nổi bật → to, tối giản/sang trọng → vừa. */
const HEADLINE_SIZE: Record<FlowStyle['style'], number> = {
  bold: 104, playful: 92, minimalist: 76, luxury: 80, corporate: 80,
};
/** Bo góc nút CTA theo phong cách. */
const CTA_RADIUS: Record<FlowStyle['style'], number> = {
  bold: 999, playful: 999, minimalist: 999, luxury: 4, corporate: 10,
};

export function autoTypography(layer: TextLayer, ctx: AutoStyleContext): TextLayer {
  if (!layer.autoStyle || layer.renderSource === 'ai') return layer;
  const st = ctx.style ?? DEFAULT_STYLE;
  const brandFont = fontIdFromLabel(ctx.brandKit?.fontPreference);
  const displayFont: FontId = brandFont ?? FONT_FOR_STYLE[st.fontStyle];
  // Chữ viết tay chỉ hợp tiêu đề; chữ nhỏ và nút dùng sans dễ đọc.
  const bodyFont: FontId = displayFont === 'dancing-script' ? 'be-vietnam-pro' : displayFont;
  const loud = st.style === 'bold' || (st.mood === 'energetic' && st.style !== 'luxury');
  const headline = HEADLINE_SIZE[st.style];
  const base = TEXT_ROLE_DEFAULTS[layer.role].style;

  const byRole: Record<TextRole, Partial<TextStyle>> = {
    headline: {
      fontFamily: displayFont, fontWeight: st.style === 'luxury' ? 600 : 700, fontSizePx: headline, lineHeight: 1.1,
      textTransform: loud ? 'uppercase' : 'none', letterSpacingEm: loud ? 0.02 : st.style === 'luxury' ? 0.03 : 0,
      maxLines: 2,
    },
    subheadline: {
      fontFamily: bodyFont, fontWeight: st.style === 'luxury' ? 400 : 500, fontSizePx: Math.round(headline * 0.42),
      lineHeight: 1.25, textTransform: 'none', letterSpacingEm: 0, maxLines: 2,
    },
    cta: {
      fontFamily: bodyFont, fontWeight: loud ? 700 : 600, fontSizePx: Math.round(headline * 0.36), lineHeight: 1,
      textTransform: loud ? 'uppercase' : 'none', letterSpacingEm: loud ? 0.04 : 0.01, maxLines: 1,
      plate: { color: '#111111', paddingX: 40, paddingY: 18, radiusPx: CTA_RADIUS[st.style] },
    },
    custom: {
      fontFamily: bodyFont, fontWeight: 500, fontSizePx: Math.round(headline * 0.36), lineHeight: 1.25,
      textTransform: 'none', letterSpacingEm: 0,
    },
  };
  const style: TextStyle = {
    ...base,
    ...byRole[layer.role],
    italic: false,
    // Căn lề giữ của layer (layout/biến thể quyết định); màu tạm – vẽ thật thì autoTextColors thay theo nền.
    align: layer.style.align,
    fill: { kind: 'solid', color: layer.role === 'cta' ? '#FFFFFF' : '#111111' },
  };
  if (layer.role !== 'cta') delete style.plate;
  delete style.stroke;
  delete style.shadow;
  return { ...layer, style, minFontSizePx: Math.min(layer.minFontSizePx, style.fontSizePx) };
}

/** Phong cách + brand trong graph (node đầu tiên mỗi loại) – validate/Inspector dùng khi chưa có job. */
export function autoStyleContextFromGraph(graph: { nodes: { type: string; params: unknown }[] }): AutoStyleContext {
  return {
    style: graph.nodes.find((n) => n.type === 'style')?.params as FlowStyle | undefined,
    brandKit: graph.nodes.find((n) => n.type === 'brand-kit')?.params as BrandKit | undefined,
  };
}

/* ── Màu theo nền ───────────────────────────────────────────── */

/** Đo vùng nền dưới chữ: màu trung bình + độ rối (độ lệch chuẩn độ sáng 0–1). */
export interface BackgroundSample {
  r: number;
  g: number;
  b: number;
  /** Độ lệch chuẩn của độ sáng tương đối trong vùng (0 = phẳng, > ~0.15 = rối). */
  spread: number;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const relativeLuminance = (r: number, g: number, b: number) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

function hexToRgb(hex: HexColor): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(...a);
  const lb = relativeLuminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: HexColor = '#FFFFFF';
const INK: HexColor = '#141414';
/** Tiêu đề to: 3:1 đã đọc tốt; chữ nhỏ cần 4.5:1 (WCAG AA). */
const MIN_CONTRAST: Record<TextRole, number> = { headline: 3, subheadline: 4.5, cta: 4.5, custom: 4.5 };
const BUSY_SPREAD = 0.14;

function best(cands: HexColor[], against: [number, number, number]): { color: HexColor; contrast: number } {
  return cands
    .map((color) => ({ color, contrast: contrastRatio(hexToRgb(color), against) }))
    .reduce((a, b) => (b.contrast > a.contrast ? b : a));
}

export interface AutoColors {
  fill: HexColor;
  shadow?: TextStyle['shadow'];
  plateColor?: HexColor;
}

/**
 * Màu cho 1 text layer trên vùng nền `bg`. `fontSizePx` = cỡ thật (px ratio) để bóng to theo chữ.
 * - Tiêu đề: màu thương hiệu đầu tiên đủ tương phản; không có thì trắng/đen (cái tương phản hơn).
 * - Tiêu đề phụ / text khác: trắng/đen – chữ nhỏ cần dễ đọc trước.
 * - CTA: nút màu thương hiệu (hoặc trắng/đen) nổi trên nền, chữ trên nút trắng/đen theo màu nút.
 * - Nền rối hoặc tương phản sát ngưỡng → thêm bóng mềm màu ngược với chữ.
 */
export function autoTextColors(role: TextRole, bg: BackgroundSample, palette: HexColor[], fontSizePx: number): AutoColors {
  const bgRgb: [number, number, number] = [bg.r, bg.g, bg.b];
  const brand = palette.filter(isHexColor).map((c) => c.slice(0, 7).toUpperCase());

  if (role === 'cta') {
    const plate = brand.find((c) => contrastRatio(hexToRgb(c), bgRgb) >= 3) ?? best([WHITE, INK], bgRgb).color;
    return { fill: best([WHITE, INK], hexToRgb(plate)).color, plateColor: plate };
  }

  const need = MIN_CONTRAST[role];
  const brandPick = role === 'headline' ? brand.find((c) => contrastRatio(hexToRgb(c), bgRgb) >= Math.max(need, 3.5)) : undefined;
  const pick = brandPick ? { color: brandPick, contrast: contrastRatio(hexToRgb(brandPick), bgRgb) } : best([WHITE, INK], bgRgb);
  const darkText = relativeLuminance(...hexToRgb(pick.color)) < 0.4;
  const needsShadow = bg.spread > BUSY_SPREAD || pick.contrast < need + 1.5;
  return {
    fill: pick.color,
    ...(needsShadow ? {
      shadow: {
        color: darkText ? '#FFFFFFB3' : '#000000A6',
        blurPx: Math.max(4, fontSizePx * 0.18),
        offsetX: 0,
        offsetY: darkText ? 0 : Math.max(1, fontSizePx * 0.04),
      },
    } : {}),
  };
}
