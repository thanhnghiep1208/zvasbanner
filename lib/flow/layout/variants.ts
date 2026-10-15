/**
 * Variant layout theo ratio class (T4.1): 2 variant / class, thử theo thứ tự.
 * Mỗi variant là hàm của `s` = productScale ∈ [MIN_PRODUCT_SCALE, 1]: co sản phẩm → phần dư dồn cho chữ.
 * Mọi slot nằm trong vùng an toàn ~4–6% mép (lib/prompt-builder.ts yêu cầu 5–8%) và không chồng nhau (có test).
 */
import type { LayoutVariant, RatioClass, Rect, SlotKind } from './types';

/** Sản phẩm co tối đa còn 60% vùng gốc trước khi co chữ. */
export const MIN_PRODUCT_SCALE = 0.6;

/** w/h > 2.5 ultra-wide · > 1.2 landscape · 0.8–1.2 square · < 0.8 portrait. */
export function classifyRatio(width: number, height: number): RatioClass {
  const r = width / height;
  if (r > 2.5) return 'ultra-wide';
  if (r > 1.2) return 'landscape';
  if (r >= 0.8) return 'square';
  return 'portrait';
}

type Slots = Record<SlotKind, Rect>;

/** Cột chữ xếp dọc: logo trên, headline, subheadline, CTA (CTA hẹp hơn, căn theo `ctaAlign`). */
function textColumn(x: number, w: number, top: number, logoW: number, ctaW: number): Omit<Slots, 'product'> {
  return {
    logo: { x, y: top, w: Math.min(logoW, w), h: 0.1 },
    headline: { x, y: top + 0.14, w, h: 0.3 },
    subheadline: { x, y: top + 0.46, w, h: 0.18 },
    cta: { x, y: top + 0.66, w: Math.min(ctaW, w), h: 0.14 },
  };
}

const M = 0.06; // lề an toàn

export const LAYOUT_VARIANTS: Record<RatioClass, LayoutVariant[]> = {
  landscape: [
    {
      // Chữ trái, sản phẩm phải – banner ngang (Zalo OA, FB cover…)
      id: 'landscape-text-left',
      ratioClass: 'landscape',
      slots: (s) => {
        const pw = 0.42 * s;
        const textW = 1 - M - pw - 0.04 - M;
        return { ...textColumn(M, textW, 0.06, 0.14, 0.24), product: { x: 1 - M - pw, y: 0.08, w: pw, h: 0.84 } };
      },
    },
    {
      // Sản phẩm trái, chữ phải
      id: 'landscape-text-right',
      ratioClass: 'landscape',
      slots: (s) => {
        const pw = 0.42 * s;
        const textX = M + pw + 0.04;
        return { ...textColumn(textX, 1 - M - textX, 0.06, 0.14, 0.24), product: { x: M, y: 0.08, w: pw, h: 0.84 } };
      },
    },
  ],
  'ultra-wide': [
    {
      // Logo trái, chữ giữa, sản phẩm phải – leaderboard rất dẹt
      id: 'ultra-wide-row',
      ratioClass: 'ultra-wide',
      slots: (s) => {
        const pw = 0.3 * s;
        const textX = 0.2;
        const textW = 1 - 0.04 - pw - 0.04 - textX;
        return {
          logo: { x: 0.04, y: 0.25, w: 0.12, h: 0.5 },
          headline: { x: textX, y: 0.1, w: textW, h: 0.38 },
          subheadline: { x: textX, y: 0.52, w: textW, h: 0.18 },
          cta: { x: textX, y: 0.74, w: Math.min(0.16, textW), h: 0.18 },
          product: { x: 1 - 0.04 - pw, y: 0.08, w: pw, h: 0.84 },
        };
      },
    },
    {
      // Sản phẩm trái, chữ giữa, logo phải
      id: 'ultra-wide-product-left',
      ratioClass: 'ultra-wide',
      slots: (s) => {
        const pw = 0.3 * s;
        const textX = 0.04 + pw + 0.04;
        const textW = 0.82 - textX;
        return {
          product: { x: 0.04, y: 0.08, w: pw, h: 0.84 },
          headline: { x: textX, y: 0.1, w: textW, h: 0.38 },
          subheadline: { x: textX, y: 0.52, w: textW, h: 0.18 },
          cta: { x: textX, y: 0.74, w: Math.min(0.16, textW), h: 0.18 },
          logo: { x: 0.84, y: 0.25, w: 0.12, h: 0.5 },
        };
      },
    },
  ],
  square: [
    {
      // Chữ trên, sản phẩm giữa, CTA dưới
      id: 'square-text-top',
      ratioClass: 'square',
      slots: (s) => {
        const e = 0.4 * (1 - s); // chiều cao sản phẩm nhường cho chữ
        return {
          logo: { x: M, y: 0.05, w: 0.16, h: 0.08 },
          headline: { x: 0.08, y: 0.15, w: 0.84, h: 0.16 + e * 0.6 },
          subheadline: { x: 0.12, y: 0.32 + e * 0.6, w: 0.76, h: 0.08 + e * 0.4 },
          product: { x: 0.5 - 0.35 * s, y: 0.42 + e, w: 0.7 * s, h: 0.4 * s },
          cta: { x: 0.35, y: 0.85, w: 0.3, h: 0.09 },
        };
      },
    },
    {
      // Sản phẩm trên, chữ dưới
      id: 'square-product-top',
      ratioClass: 'square',
      slots: (s) => {
        const e = 0.4 * (1 - s);
        const headY = 0.14 + 0.4 * s + 0.02;
        const headH = 0.14 + e * 0.6;
        return {
          logo: { x: M, y: 0.05, w: 0.16, h: 0.08 },
          product: { x: 0.5 - 0.35 * s, y: 0.14, w: 0.7 * s, h: 0.4 * s },
          headline: { x: 0.08, y: headY, w: 0.84, h: headH },
          subheadline: { x: 0.12, y: headY + headH + 0.01, w: 0.76, h: 0.08 + e * 0.4 },
          cta: { x: 0.35, y: 0.85, w: 0.3, h: 0.09 },
        };
      },
    },
  ],
  portrait: [
    {
      // Story/dọc: chữ trên, sản phẩm giữa, CTA dưới
      id: 'portrait-text-top',
      ratioClass: 'portrait',
      slots: (s) => {
        const e = 0.44 * (1 - s);
        return {
          logo: { x: M, y: 0.04, w: 0.2, h: 0.06 },
          headline: { x: 0.08, y: 0.12, w: 0.84, h: 0.14 + e * 0.6 },
          subheadline: { x: 0.1, y: 0.27 + e * 0.6, w: 0.8, h: 0.07 + e * 0.4 },
          product: { x: 0.5 - 0.4 * s, y: 0.37 + e, w: 0.8 * s, h: 0.44 * s },
          cta: { x: 0.3, y: 0.85, w: 0.4, h: 0.08 },
        };
      },
    },
    {
      // Sản phẩm trên, chữ dưới
      id: 'portrait-product-top',
      ratioClass: 'portrait',
      slots: (s) => {
        const e = 0.44 * (1 - s);
        const headY = 0.12 + 0.44 * s + 0.03;
        const headH = 0.14 + e * 0.6;
        return {
          logo: { x: M, y: 0.04, w: 0.2, h: 0.06 },
          product: { x: 0.5 - 0.4 * s, y: 0.12, w: 0.8 * s, h: 0.44 * s },
          headline: { x: 0.08, y: headY, w: 0.84, h: headH },
          subheadline: { x: 0.1, y: headY + headH + 0.01, w: 0.8, h: 0.07 + e * 0.4 },
          cta: { x: 0.3, y: 0.85, w: 0.4, h: 0.08 },
        };
      },
    },
  ],
};
