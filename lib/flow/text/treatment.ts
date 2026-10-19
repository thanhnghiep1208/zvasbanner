/**
 * Hiệu ứng chữ / nút / logo "tự động theo banner" (Nghiệp 2026-10-19: chữ, nút, logo như ghép đè layer phẳng).
 * Bước sau `autoTextColors` (màu đã chọn theo nền): thêm chiều sâu theo phong cách, tính lúc ghép (cần nền thật),
 * KHÔNG lưu vào graph – chuyển sang "Chỉnh tay" thì quay về style tay.
 *
 * - Tiêu đề: bold/năng động → gradient sáng + bóng khối lệch (đổ màu đậm) + glow nhẹ; vui tươi → viền kiểu sticker
 *   + bóng khối; sang trọng → gradient champagne + glow ấm; tối giản / doanh nghiệp → giữ sạch.
 * - Nút CTA: nền gradient cùng họ màu, bóng đổ mềm, dải sáng trên; sang trọng thêm viền mảnh; năng động thêm glow.
 * - Vầng làm rõ (scrim): nền rối / tương phản sát ngưỡng → 1 vầng tối (hoặc sáng) mềm sau cả cụm chữ.
 * - Logo: tương phản thấp với nền → quầng mảnh quanh logo.
 * Thuần, không DOM – renderer (lib/flow-ui/compose-render.ts) vẽ.
 */
import type { FlowStyle, TextRole } from '../schema';
import { contrastRatio, relativeLuminance, type AutoColors, type BackgroundSample } from './auto-style';
import type { HexColor } from './text-style';

export interface Look {
  style: FlowStyle['style'];
  mood: FlowStyle['mood'];
}

export interface Glow {
  color: string;
  blurPx: number;
}

/** Bóng khối: bản sao chữ lệch, không nhoè – tạo cảm giác nổi khối. */
export interface ExtrudeShadow {
  color: string;
  offsetX: number;
  offsetY: number;
}

export interface TextTreatment {
  /** Tô chữ: 1 màu hoặc gradient dọc (trên → dưới). */
  fill: { from: HexColor; to?: HexColor };
  glow?: Glow;
  extrude?: ExtrudeShadow;
  stroke?: { color: HexColor; widthPx: number };
  softShadow?: { color: string; blurPx: number; offsetY: number };
}

export interface PlateTreatment {
  from: HexColor;
  to: HexColor;
  shadow: { color: string; blurPx: number; offsetY: number };
  /** Dải sáng mảnh ở mép trên nút. */
  highlight: boolean;
  border?: { color: string; widthPx: number };
  glow?: Glow;
}

type Rgb = [number, number, number];

const hexToRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** Pha `a` về `b` theo t (0 = a, 1 = b). */
export const mix = (a: HexColor, b: HexColor, t: number): HexColor => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
};
const rgba = (hex: HexColor, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const lum = (hex: HexColor) => relativeLuminance(...hexToRgb(hex));
const isLight = (hex: HexColor) => lum(hex) > 0.45;

const loud = (l: Look) => l.style === 'bold' || (l.mood === 'energetic' && l.style !== 'luxury');

/** Màu nhấn để đổ khối / glow: màu đầu bảng màu, không có thì nền tối hơn. */
function accentOf(palette: string[], bg: BackgroundSample): HexColor {
  const c = palette.find((p) => /^#[0-9A-Fa-f]{6}/.test(p));
  return c ? c.slice(0, 7).toUpperCase() : mix(toHex([bg.r, bg.g, bg.b]), '#000000', 0.55);
}

/** Hiệu ứng chữ theo phong cách. `colors` = kết quả autoTextColors (màu chữ đã đủ tương phản với nền). */
export function textTreatment(
  role: TextRole, look: Look, bg: BackgroundSample, colors: AutoColors, palette: string[], fontSizePx: number,
): TextTreatment {
  const fill = colors.fill.slice(0, 7).toUpperCase();
  const light = isLight(fill);
  const accent = accentOf(palette, bg);
  const soft = colors.shadow
    ? { color: colors.shadow.color, blurPx: colors.shadow.blurPx, offsetY: colors.shadow.offsetY }
    : undefined;

  if (role !== 'headline') return { fill: { from: fill }, ...(soft ? { softShadow: soft } : {}) };

  const fs = fontSizePx;
  if (look.style === 'playful') {
    // Sticker: viền dày tương phản + bóng khối màu nhấn.
    const edge = light ? mix(accent, '#000000', 0.45) : '#FFFFFF';
    return {
      fill: { from: fill },
      stroke: { color: edge, widthPx: Math.max(2, fs * 0.06) },
      extrude: { color: mix(accent, '#000000', 0.35), offsetX: fs * 0.03, offsetY: fs * 0.05 },
    };
  }
  if (look.style === 'luxury') {
    // Champagne: gradient sáng → ánh vàng nhạt khi chữ sáng; glow ấm rất nhẹ.
    return light
      ? { fill: { from: '#FFFDF6', to: '#E6D3A3' }, glow: { color: 'rgba(255, 220, 160, 0.35)', blurPx: fs * 0.45 } }
      : { fill: { from: fill }, ...(soft ? { softShadow: soft } : {}) };
  }
  if (loud(look)) {
    // Nổi khối: gradient từ màu chữ sang ánh màu nhấn, bóng khối đậm lệch xuống phải, glow màu nhấn.
    const deep = mix(light ? accent : '#FFFFFF', light ? '#000000' : accent, light ? 0.55 : 0.2);
    return {
      fill: light ? { from: fill, to: mix(fill, accent, 0.18) } : { from: fill },
      extrude: { color: deep, offsetX: fs * 0.035, offsetY: fs * 0.05 },
      ...(light ? { glow: { color: rgba(accent, 0.45), blurPx: fs * 0.6 } } : {}),
    };
  }
  // Tối giản / doanh nghiệp: sạch, chỉ bóng mềm khi cần đọc rõ.
  return { fill: { from: fill }, ...(soft ? { softShadow: soft } : {}) };
}

/** Nút CTA: gradient cùng họ màu, bóng mềm, dải sáng; sang trọng có viền, năng động có glow. */
export function plateTreatment(look: Look, plate: HexColor, heightPx: number): PlateTreatment {
  const base = plate.slice(0, 7).toUpperCase();
  const t: PlateTreatment = {
    from: mix(base, '#FFFFFF', 0.14),
    to: mix(base, '#000000', 0.16),
    shadow: { color: 'rgba(0, 0, 0, 0.35)', blurPx: heightPx * 0.45, offsetY: heightPx * 0.14 },
    highlight: look.style !== 'minimalist',
  };
  if (look.style === 'luxury') t.border = { color: rgba(mix(base, '#FFFFFF', 0.55), 0.9), widthPx: Math.max(1, heightPx * 0.03) };
  if (loud(look)) t.glow = { color: rgba(base, 0.55), blurPx: heightPx * 0.7 };
  if (look.style === 'minimalist') {
    t.from = base;
    t.to = base;
    t.shadow = { color: 'rgba(0, 0, 0, 0.18)', blurPx: heightPx * 0.3, offsetY: heightPx * 0.08 };
  }
  return t;
}

/* ── Vầng làm rõ chữ ────────────────────────────────────────── */

/** Nền dưới cụm chữ rối hơn mức này, hoặc tương phản thấp hơn `MIN + 2` → cần vầng. */
const SCRIM_SPREAD = 0.12;

export interface Scrim {
  /** Màu vầng: tối khi chữ sáng, sáng khi chữ tối. */
  color: HexColor;
  /** Độ đậm ở tâm (0–1); viền mờ dần về 0. */
  alpha: number;
}

/**
 * Cần vầng sau cụm chữ không. `samples` = nền dưới từng text layer, `fills` = màu chữ đã chọn.
 * Không dùng cho minimalist (giữ nền sạch) trừ khi tương phản thật sự thấp.
 */
export function scrimFor(look: Look, samples: BackgroundSample[], fills: HexColor[]): Scrim | undefined {
  if (!samples.length) return undefined;
  const light = fills.filter((f) => isLight(f)).length >= fills.length / 2;
  const worstContrast = Math.min(...samples.map((s, i) => contrastRatio(hexToRgb(fills[i] ?? fills[0]!), [s.r, s.g, s.b])));
  const busy = Math.max(...samples.map((s) => s.spread));
  const need = busy > SCRIM_SPREAD || worstContrast < 6.5;
  if (!need || (look.style === 'minimalist' && worstContrast >= 4.5)) return undefined;
  const strength = Math.min(0.6, 0.25 + Math.max(0, busy - 0.08) * 1.2 + Math.max(0, 6.5 - worstContrast) * 0.05);
  return { color: light ? '#000000' : '#FFFFFF', alpha: Math.round(strength * 100) / 100 };
}

/* ── Logo ───────────────────────────────────────────────────── */

/** Logo chìm vào nền (tương phản < 2.2) → quầng mảnh ngược màu quanh logo. */
export function logoHalo(logoLuminance: number, bg: BackgroundSample, heightPx: number): Glow | undefined {
  const bgLum = relativeLuminance(bg.r, bg.g, bg.b);
  const contrast = (Math.max(logoLuminance, bgLum) + 0.05) / (Math.min(logoLuminance, bgLum) + 0.05);
  if (contrast >= 2.2) return undefined;
  const dark = logoLuminance > 0.4;
  return { color: dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.75)', blurPx: Math.max(4, heightPx * 0.12) };
}
