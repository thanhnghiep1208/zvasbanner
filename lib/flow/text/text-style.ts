/**
 * Text layer style (Q2A) – model mới, repo cũ không có TextLayer.
 * Data thuần, không phụ thuộc DOM. Renderer Canvas 2D (T4.4) đọc model này cho cả preview,
 * export và đo chữ trong layout engine, để WYSIWYG.
 *
 * Đơn vị px tính trên canvas tham chiếu có cạnh ngắn = 1080 (cùng quy ước với ShadowConfig);
 * renderer scale theo cạnh ngắn của từng ratio.
 */
import type { TextRole } from '../schema';

/** Font renderer tải được (self-host, hỗ trợ tiếng Việt). P1 mới có Inter – bộ font đầy đủ: Q10. */
export const FLOW_FONTS = {
  inter: { label: 'Inter', cssFamily: 'Inter', weights: [400, 500, 600, 700] },
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
  /** Cỡ chữ mong muốn. Auto Layout chỉ co xuống, tối thiểu `minFontSizePx` của layer. */
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

/* ── Validate ───────────────────────────────────────────────── */

const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Trả danh sách lỗi (tiếng Việt). Rỗng = hợp lệ. */
export function validateTextStyle(style: TextStyle, minFontSizePx: number): string[] {
  const errors: string[] = [];
  const font = FLOW_FONTS[style.fontFamily] as (typeof FLOW_FONTS)[FontId] | undefined;
  if (!font) errors.push(`Font không hỗ trợ: ${style.fontFamily}.`);
  else if (!(font.weights as readonly number[]).includes(style.fontWeight)) {
    errors.push(`${font.label} không có độ đậm ${style.fontWeight}.`);
  }
  if (!(style.fontSizePx > 0)) errors.push('Cỡ chữ phải lớn hơn 0.');
  if (!(minFontSizePx > 0)) errors.push('Cỡ chữ tối thiểu phải lớn hơn 0.');
  if (minFontSizePx > style.fontSizePx) errors.push('Cỡ chữ tối thiểu lớn hơn cỡ chữ.');
  if (!(style.lineHeight >= 0.8 && style.lineHeight <= 3)) errors.push('Giãn dòng phải trong khoảng 0.8–3.');
  if (!Number.isInteger(style.maxLines) || style.maxLines < 0) errors.push('Số dòng tối đa phải là số nguyên ≥ 0.');

  const colors: [string, HexColor | undefined][] = [
    ['Màu chữ', style.fill.color],
    ['Màu viền', style.stroke?.color],
    ['Màu bóng', style.shadow?.color],
    ['Màu nền chữ', style.plate?.color],
  ];
  for (const [label, c] of colors) {
    if (c !== undefined && !HEX.test(c)) errors.push(`${label} phải là mã hex #RRGGBB hoặc #RRGGBBAA.`);
  }
  if (style.stroke && !(style.stroke.widthPx > 0)) errors.push('Độ dày viền phải lớn hơn 0.');
  if (style.shadow && style.shadow.blurPx < 0) errors.push('Độ nhoè bóng không được âm.');
  if (style.plate && (style.plate.paddingX < 0 || style.plate.paddingY < 0 || style.plate.radiusPx < 0)) {
    errors.push('Padding và bo góc nền chữ không được âm.');
  }
  return errors;
}
