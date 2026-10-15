/**
 * Bản tối thiểu (T2.5): 1 variant / ratio class. Bản đầy đủ (T4.1): ≥2 variant / class, co giãn, báo lỗi không vừa.
 * Mọi slot nằm trong vùng an toàn ~5% mép (lib/prompt-builder.ts yêu cầu 5–8%) và không chồng nhau.
 */
import type { LayoutVariant, RatioClass } from './types';

/** w/h > 2.5 ultra-wide · > 1.2 landscape · 0.8–1.2 square · < 0.8 portrait. */
export function classifyRatio(width: number, height: number): RatioClass {
  const r = width / height;
  if (r > 2.5) return 'ultra-wide';
  if (r > 1.2) return 'landscape';
  if (r >= 0.8) return 'square';
  return 'portrait';
}

export const LAYOUT_VARIANTS: Record<RatioClass, LayoutVariant[]> = {
  // Chữ trái, sản phẩm phải – banner ngang (Zalo OA, FB cover…)
  'landscape': [{
    id: 'landscape-split',
    ratioClass: 'landscape',
    slots: {
      logo: { x: 0.06, y: 0.06, w: 0.14, h: 0.1 },
      headline: { x: 0.06, y: 0.2, w: 0.42, h: 0.28 },
      subheadline: { x: 0.06, y: 0.5, w: 0.42, h: 0.16 },
      cta: { x: 0.06, y: 0.7, w: 0.22, h: 0.13 },
      product: { x: 0.52, y: 0.08, w: 0.42, h: 0.84 },
    },
  }],
  // Logo trái, chữ giữa, sản phẩm phải – leaderboard rất dẹt
  'ultra-wide': [{
    id: 'ultra-wide-row',
    ratioClass: 'ultra-wide',
    slots: {
      logo: { x: 0.04, y: 0.25, w: 0.12, h: 0.5 },
      headline: { x: 0.2, y: 0.12, w: 0.42, h: 0.36 },
      subheadline: { x: 0.2, y: 0.52, w: 0.42, h: 0.18 },
      cta: { x: 0.2, y: 0.74, w: 0.16, h: 0.16 },
      product: { x: 0.66, y: 0.08, w: 0.3, h: 0.84 },
    },
  }],
  // Chữ trên, sản phẩm giữa, CTA dưới
  'square': [{
    id: 'square-stack',
    ratioClass: 'square',
    slots: {
      logo: { x: 0.06, y: 0.05, w: 0.16, h: 0.08 },
      headline: { x: 0.08, y: 0.15, w: 0.84, h: 0.16 },
      subheadline: { x: 0.12, y: 0.32, w: 0.76, h: 0.08 },
      product: { x: 0.15, y: 0.42, w: 0.7, h: 0.4 },
      cta: { x: 0.35, y: 0.85, w: 0.3, h: 0.09 },
    },
  }],
  // Story/dọc: như square nhưng cao hơn
  'portrait': [{
    id: 'portrait-stack',
    ratioClass: 'portrait',
    slots: {
      logo: { x: 0.06, y: 0.04, w: 0.2, h: 0.06 },
      headline: { x: 0.08, y: 0.12, w: 0.84, h: 0.14 },
      subheadline: { x: 0.1, y: 0.27, w: 0.8, h: 0.07 },
      product: { x: 0.1, y: 0.37, w: 0.8, h: 0.44 },
      cta: { x: 0.3, y: 0.85, w: 0.4, h: 0.08 },
    },
  }],
};
