/**
 * Bảng màu chung (Nghiệp 2026-10-19): nền, chữ, nút CTA phải hợp với sản phẩm/logo đặt lên trên.
 * - `dominantColors`: màu chủ đạo của ảnh (pixel đọc ở client lúc tải ảnh – lib/flow-ui/asset-colors.ts), lưu vào
 *   params node ảnh (`dominantColors`). Prompt nền chỉ nhận MÃ MÀU, không nhận pixel sản phẩm (asset fidelity, SPEC 2.1).
 * - `harmonyPromptLines`: dặn model nền làm nổi sản phẩm (không phủ nền cùng tông màu chính của sản phẩm).
 * - `textPalette`: màu ưu tiên cho tiêu đề/nút CTA tự động: Brand kit, không có thì màu chính của sản phẩm.
 * Thuần, test được.
 */
import { isBrandish } from './brand-extract';

type Rgb = [number, number, number];

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const fromHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const HEX = /^#[0-9A-Fa-f]{6}$/;

export const MAX_DOMINANT = 4;

/**
 * Màu chủ đạo từ RGBA (ảnh thu nhỏ ~64px): bỏ pixel trong suốt (alpha < 128), gom về lưới 16 mức/kênh, gộp màu
 * gần nhau (RGB < 56), giữ màu chiếm ≥ 6% diện tích, nhiều trước. Trả hex `#RRGGBB`.
 */
export function dominantColors(rgba: ArrayLike<number>, max = MAX_DOMINANT): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    s.n++; s.r += r; s.g += g; s.b += b;
    buckets.set(key, s);
    total++;
  }
  if (!total) return [];
  const clusters: { rgb: Rgb; n: number }[] = [];
  for (const s of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb: Rgb = [Math.round(s.r / s.n), Math.round(s.g / s.n), Math.round(s.b / s.n)];
    const near = clusters.find((c) => dist(c.rgb, rgb) < 56);
    if (near) near.n += s.n;
    else clusters.push({ rgb, n: s.n });
  }
  return clusters.filter((c) => c.n / total >= 0.06).sort((a, b) => b.n - a.n).slice(0, max).map((c) => toHex(c.rgb));
}

/** Màu "chính" để làm điểm nhấn: màu có sắc (không xám/trắng/đen) chiếm nhiều nhất. */
export function mainColor(colors: string[]): string | undefined {
  return colors.filter((c) => HEX.test(c)).find((c) => isBrandish(fromHex(c)));
}

/** Gộp màu của nhiều ảnh (sản phẩm trước, logo/trang trí sau), bỏ trùng gần nhau, tối đa `max`. */
export function elementColors(lists: (string[] | undefined)[], max = 5): string[] {
  const out: Rgb[] = [];
  for (const list of lists) for (const c of list ?? []) {
    if (!HEX.test(c)) continue;
    const rgb = fromHex(c);
    if (!out.some((o) => dist(o, rgb) < 40)) out.push(rgb);
    if (out.length === max) return out.map(toHex);
  }
  return out.map(toHex);
}

/** Dòng prompt (tiếng Anh) để nền làm nổi sản phẩm/logo. */
export function harmonyPromptLines(colors: string[] | undefined): string[] {
  if (!colors?.length) return [];
  const main = mainColor(colors);
  return [
    `The product/logo placed on top later has these colours: ${colors.join(', ')}${main ? ` (main colour ${main})` : ''}.`,
    main
      ? `Make the background complement them so the product clearly stands out: do NOT fill large areas, especially behind the product, with ${main} or a near hue. If the brief or style asks for a similar colour, use a clearly deeper, darker or lighter variant with strong contrast around the product.`
      : 'Make the background complement them so the product clearly stands out (enough tonal contrast behind it).',
    ...(main ? [`Echo ${main} only in small accents (light reflections, small props) to tie the scene together.`] : []),
  ];
}

/**
 * Màu ưu tiên cho chữ/nút tự động (autoTextColors): Brand kit trước; không có Brand kit thì màu chính của sản phẩm,
 * để tiêu đề/CTA lặp lại màu sản phẩm thay vì chỉ trắng/đen.
 */
export function textPalette(brandColors: string[], productColors: string[] | undefined): string[] {
  if (brandColors.length) return brandColors;
  const main = mainColor(productColors ?? []);
  return main ? [main] : [];
}
