/**
 * Text layer style (Q2A). Từng dùng cho renderer Canvas 2D của chế độ Ghép layer (đã gỡ 2026-10-20); nay chỉ còn là
 * dữ liệu mặc định của node Text (project cũ vẫn đọc được) + danh sách font cho Brand kit.
 * Đơn vị px tính trên canvas tham chiếu có cạnh ngắn = 1080.
 */
import type { TextRole } from '../schema';

/**
 * Font gợi ý cho Brand kit (Q10B): Google Fonts có subset tiếng Việt. Nhãn gửi vào prompt để AI vẽ chữ theo font đó.
 * `fallback`, `weights`: dữ liệu từ renderer Ghép layer cũ, giữ để không đổi kiểu `TextStyle` đã lưu.
 */
export const FLOW_FONTS = {
  'inter': { label: 'Inter', fallback: 'sans-serif', weights: [400, 500, 600, 700] },
  'be-vietnam-pro': { label: 'Be Vietnam Pro', fallback: 'sans-serif', weights: [400, 500, 600, 700] },
  'noto-serif': { label: 'Noto Serif', fallback: 'serif', weights: [400, 500, 600, 700] },
  'montserrat': { label: 'Montserrat', fallback: 'sans-serif', weights: [400, 500, 600, 700] },
  'dancing-script': { label: 'Dancing Script', fallback: 'cursive', weights: [400, 500, 600, 700] },
  'playfair-display': { label: 'Playfair Display', fallback: 'serif', weights: [400, 500, 600, 700] },
  'barlow': { label: 'Barlow', fallback: 'sans-serif', weights: [400, 500, 600, 700] },
  'merriweather': { label: 'Merriweather', fallback: 'serif', weights: [400, 500, 600, 700] },
  'prompt': { label: 'Prompt', fallback: 'sans-serif', weights: [400, 500, 600, 700] },
  'philosopher': { label: 'Philosopher', fallback: 'sans-serif', weights: [400, 700] },
  'paytone-one': { label: 'Paytone One', fallback: 'sans-serif', weights: [400] },
} as const;

export type FontId = keyof typeof FLOW_FONTS;
export type FontWeight = 400 | 500 | 600 | 700;

/** Màu hex `#RRGGBB` hoặc `#RRGGBBAA`. */
export type HexColor = string;

/** P1 chỉ có màu đơn; `kind` để mở rộng gradient sau. */
export interface TextFill {
  kind: 'solid';
  color: HexColor;
}

export interface TextStroke {
  color: HexColor;
  widthPx: number;
}

export interface TextShadow {
  color: HexColor;
  blurPx: number;
  offsetX: number;
  offsetY: number;
}

/** Khối nền sau chữ (vd. nút CTA). */
export interface TextPlate {
  color: HexColor;
  paddingX: number;
  paddingY: number;
  radiusPx: number;
}

export interface TextStyle {
  fontFamily: FontId;
  fontWeight: FontWeight;
  italic: boolean;
  /** Cỡ chữ mong muốn. */
  fontSizePx: number;
  /** Bội số của fontSizePx. */
  lineHeight: number;
  letterSpacingEm: number;
  textTransform: 'none' | 'uppercase';
  align: 'left' | 'center' | 'right';
  /** Số dòng tối đa khi xuống dòng; 0 = không giới hạn. */
  maxLines: number;
  fill: TextFill;
  stroke?: TextStroke;
  shadow?: TextShadow;
  plate?: TextPlate;
}

const BASE: TextStyle = {
  fontFamily: 'inter',
  fontWeight: 400,
  italic: false,
  fontSizePx: 28,
  lineHeight: 1.25,
  letterSpacingEm: 0,
  textTransform: 'none',
  align: 'center',
  maxLines: 0,
  fill: { kind: 'solid', color: '#111111' },
};

/** Style + cỡ tối thiểu mặc định theo role. */
export const TEXT_ROLE_DEFAULTS: Record<TextRole, { style: TextStyle; minFontSizePx: number }> = {
  headline: {
    style: { ...BASE, fontWeight: 700, fontSizePx: 72, lineHeight: 1.1, maxLines: 2 },
    minFontSizePx: 32,
  },
  subheadline: {
    style: { ...BASE, fontWeight: 500, fontSizePx: 36, maxLines: 2 },
    minFontSizePx: 18,
  },
  cta: {
    style: {
      ...BASE, fontWeight: 600, fontSizePx: 32, lineHeight: 1, maxLines: 1,
      fill: { kind: 'solid', color: '#FFFFFF' },
      plate: { color: '#111111', paddingX: 32, paddingY: 16, radiusPx: 12 },
    },
    minFontSizePx: 18,
  },
  custom: {
    style: { ...BASE },
    minFontSizePx: 14,
  },
};

export function defaultTextStyle(role: TextRole): TextStyle {
  return structuredClone(TEXT_ROLE_DEFAULTS[role].style);
}
