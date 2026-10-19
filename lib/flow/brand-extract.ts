/**
 * Lấy gợi ý Brand kit từ website (Nghiệp yêu cầu 2026-10-19). Thuần: nhận HTML/CSS/JS dạng chuỗi, không fetch –
 * phần tải nằm ở lib/flow-server/brand-fetch.ts. Không dùng AI.
 *
 * Nhiều trang là SPA (Vite/React): HTML gần như trống, `theme-color` để mặc định #000000, logo chỉ nằm trong JS
 * bundle. Nên tín hiệu lấy từ cả HTML, CSS và JS:
 * - Màu: đếm mọi màu trong CSS, bỏ màu xám/quá sáng/quá tối, gộp màu gần nhau, cộng điểm cho theme-color và màu
 *   tô trong logo SVG.
 * - Font: họ font đầu tiên của mỗi `font-family`, bỏ font hệ thống; link Google Fonts được cộng điểm.
 * - Logo: URL ảnh có "logo" hoặc tên thương hiệu trong tên file, icon khai báo trong <head>.
 */
import { fontIdFromLabel } from './brand';
import type { FontId } from './text/text-style';

export interface HtmlSignals {
  title?: string;
  siteName?: string;
  description?: string;
  themeColor?: string;
  stylesheets: string[];
  scripts: string[];
  /** CSS viết thẳng trong <style>. */
  inlineCss: string;
  /** Ảnh khai báo trong HTML, kèm nguồn để chấm điểm. */
  images: { url: string; source: 'icon' | 'img' | 'preload' | 'og' }[];
}

export interface LogoCandidate {
  url: string;
  score: number;
}

export interface BrandSuggestion {
  name?: string;
  description?: string;
  colors: string[];
  /** Họ font tìm thấy trên trang (VD "Google Sans"). */
  fontFamily?: string;
  /** Font tương ứng trong canvas; undefined = canvas chưa có font này. */
  fontId?: FontId;
  logos: LogoCandidate[];
}

/* ── HTML ────────────────────────────────────────────────────── */

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  const v = m?.[1] ?? m?.[2] ?? m?.[3];
  return v === undefined ? undefined : decodeEntities(v.trim());
};

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** URL tuyệt đối http(s); bỏ data:, javascript:… */
export function resolveUrl(raw: string | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseHtml(html: string, baseUrl: string): HtmlSignals {
  const tags = (name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
  const metas = tags('meta');
  const meta = (key: string) => {
    const t = metas.find((m) => (attr(m, 'property') ?? attr(m, 'name'))?.toLowerCase() === key);
    return t ? attr(t, 'content') : undefined;
  };

  const out: HtmlSignals = {
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined,
    siteName: meta('og:site_name'),
    description: meta('og:description') ?? meta('description'),
    themeColor: meta('theme-color'),
    stylesheets: [],
    scripts: [],
    inlineCss: (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []).map((s) => s.replace(/<\/?style[^>]*>/gi, '')).join('\n'),
    images: [],
  };
  if (out.title) out.title = decodeEntities(out.title);

  for (const l of tags('link')) {
    const rel = (attr(l, 'rel') ?? '').toLowerCase();
    const href = resolveUrl(attr(l, 'href'), baseUrl);
    if (!href) continue;
    if (rel.split(/\s+/).includes('stylesheet')) out.stylesheets.push(href);
    else if (rel.includes('icon')) out.images.push({ url: href, source: 'icon' });
    else if (rel === 'preload' && attr(l, 'as') === 'image') out.images.push({ url: href, source: 'preload' });
  }
  for (const s of tags('script')) {
    const src = resolveUrl(attr(s, 'src'), baseUrl);
    if (src && attr(s, 'type') === 'module') out.scripts.push(src);
  }
  for (const i of tags('img')) {
    const src = resolveUrl(attr(i, 'src'), baseUrl);
    if (src) out.images.push({ url: src, source: 'img' });
  }
  const og = resolveUrl(meta('og:image'), baseUrl);
  if (og) out.images.push({ url: og, source: 'og' });
  return out;
}

/* ── Màu ─────────────────────────────────────────────────────── */

type Rgb = [number, number, number];

function parseColor(raw: string): Rgb | undefined {
  const s = raw.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.split('').map((c) => c + c).join('') : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    if (a < 0.6) return undefined; // màu mờ (bóng, lớp phủ) không phải màu thương hiệu
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((v) => Math.min(255, v)) as Rgb;
  }
  return undefined;
}

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function hsl([r, g, b]: Rgb): { s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Màu có "sắc" rõ: đủ bão hoà, không gần trắng/đen. Xám, chữ, nền bị loại. */
export function isBrandish(c: Rgb): boolean {
  const { s, l } = hsl(c);
  return s >= 0.4 && l >= 0.2 && l <= 0.8;
}

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Đếm màu trong CSS (hex, rgb/rgba). */
export function countCssColors(css: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of css.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g) ?? []) {
    const c = parseColor(m);
    if (!c) continue;
    const key = toHex(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Màu tô trong SVG (logo) – `fill="#..."`, `stop-color`, style. */
export function svgColors(svg: string): string[] {
  const out = new Set<string>();
  for (const m of svg.match(/(?:fill|stop-color|stroke)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\))/gi) ?? []) {
    const c = parseColor(m.replace(/^[^#r]*(?=#|rgb)/i, ''));
    if (c) out.add(toHex(c));
  }
  return [...out];
}

/**
 * Xếp hạng màu thương hiệu. `boost`: màu có tín hiệu mạnh (theme-color, màu logo) được cộng điểm.
 * Màu gần nhau (khoảng cách RGB < 48) gộp làm 1, giữ màu xuất hiện nhiều nhất.
 */
export function rankColors(counts: Map<string, number>, boost: Record<string, number> = {}, max = 4): string[] {
  const all = new Map(counts);
  for (const [c, b] of Object.entries(boost)) {
    const key = parseColor(c);
    if (key) all.set(toHex(key), (all.get(toHex(key)) ?? 0) + b);
  }
  const items = [...all]
    .map(([hex, n]) => ({ hex, rgb: parseColor(hex)!, n }))
    .filter((x) => isBrandish(x.rgb))
    .sort((a, b) => b.n - a.n);
  const clusters: { hex: string; rgb: Rgb; n: number }[] = [];
  for (const it of items) {
    const near = clusters.find((c) => dist(c.rgb, it.rgb) < 48);
    if (near) near.n += it.n;
    else clusters.push({ ...it });
  }
  clusters.sort((a, b) => b.n - a.n);
  // Màu xuất hiện lẻ tẻ (1 lần, hoặc < 8% màu đứng đầu) thường là màu trạng thái/minh hoạ, không phải thương hiệu.
  const floor = Math.max(2, (clusters[0]?.n ?? 0) * 0.08);
  return clusters.filter((c) => c.n >= floor).slice(0, max).map((c) => c.hex);
}

/* ── Font ────────────────────────────────────────────────────── */

const SYSTEM_FONTS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
  'helvetica', 'helvetica neue', 'arial', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol',
  'noto color emoji', 'menlo', 'monaco', 'consolas', 'courier new', 'courier', 'times new roman', 'var',
]);

/** Họ font hay dùng nhất (bỏ font hệ thống). `googleFamilies` (từ link Google Fonts) được cộng điểm. */
export function pickFontFamily(css: string, googleFamilies: string[] = []): string | undefined {
  const counts = new Map<string, number>();
  const add = (f: string, n: number) => {
    const name = f.trim().replace(/^["']|["']$/g, '').trim();
    if (!name || SYSTEM_FONTS.has(name.toLowerCase()) || name.startsWith('var(')) return;
    counts.set(name, (counts.get(name) ?? 0) + n);
  };
  for (const m of css.matchAll(/font-family\s*:\s*([^;}!]+)/gi)) {
    // Họ font đầu tiên không phải font hệ thống = font trang thật sự dùng.
    const first = m[1]!.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '')).find((f) => f && !SYSTEM_FONTS.has(f.toLowerCase()));
    if (first) add(first, 1);
  }
  for (const g of googleFamilies) add(g, 3);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400` → ["Be Vietnam Pro"]. */
export function googleFontFamilies(urls: string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (!u.includes('fonts.googleapis.com')) continue;
    try {
      for (const f of new URL(u).searchParams.getAll('family')) for (const part of f.split('|')) out.push(part.split(':')[0]!.replace(/\+/g, ' '));
    } catch { /* bỏ URL hỏng */ }
  }
  return out;
}

/* ── Logo ────────────────────────────────────────────────────── */

/** Tên thương hiệu dạng token để so tên file: "zBusiness - Kinh doanh…" → "zbusiness". */
export function brandTokens(signals: Pick<HtmlSignals, 'title' | 'siteName'>, pageUrl: string): string[] {
  const tokens = new Set<string>();
  const add = (s: string | undefined) => {
    const t = s?.split(/\s[-|–—:]\s/)[0]?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t && t.length >= 3) tokens.add(t);
  };
  add(signals.siteName);
  add(signals.title);
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '').split('.');
    // business.zbox.vn → "zbox" (tên miền chính); "business" quá chung nên không dùng.
    add(host.length >= 2 ? host[host.length - 2] : host[0]);
  } catch { /* bỏ */ }
  return [...tokens];
}

/** URL ảnh xuất hiện trong text bất kỳ (JS bundle, CSS, HTML). */
export function findImageUrls(text: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:https?:)?\/\/[^\s"'`()<>\\]+?\.(?:svg|png|webp)(?=[?#"'`)\s\\]|$)|\/[A-Za-z0-9._~\/-]*logo[A-Za-z0-9._~-]*\.(?:svg|png|webp)/gi)) {
    const u = resolveUrl(m[0], baseUrl);
    if (u) out.add(u);
  }
  return [...out];
}

const LOGO_PENALTIES: [RegExp, number][] = [
  [/footer/i, -2], [/favicon/i, -1], [/(?:^|[_/-])icon[_-]/i, -4], [/card[_-]/i, -5], [/banner|hero|thumb|og[_-]?image|bg[_-]|background/i, -4],
  [/sprite|placeholder|avatar|flag|payment|ministry|badge/i, -4],
];

/**
 * Chấm điểm ứng viên logo; trả các ảnh điểm ≥ 2, cao trước. Logo thật thường: tên file có "logo" hoặc tên
 * thương hiệu, là SVG, hoặc là icon khai báo trong <head>.
 */
export function rankLogos(
  images: HtmlSignals['images'],
  textUrls: string[],
  tokens: string[],
  max = 3,
): LogoCandidate[] {
  const scores = new Map<string, number>();
  const bump = (url: string, n: number) => scores.set(url, (scores.get(url) ?? 0) + n);
  const all = new Map<string, Set<string>>();
  for (const i of images) (all.get(i.url) ?? all.set(i.url, new Set()).get(i.url)!).add(i.source);
  for (const u of textUrls) if (!all.has(u)) all.set(u, new Set(['text']));

  for (const [url, sources] of all) {
    const file = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').toLowerCase();
    if (sources.has('og')) continue; // ảnh chia sẻ là banner, không phải logo
    let s = 0;
    if (/logo/.test(file)) s += 5;
    if (tokens.some((t) => file.replace(/[^a-z0-9]/g, '').includes(t))) s += 6;
    if (sources.has('icon')) s += 3;
    if (sources.has('preload')) s += 1;
    if (/\.svg$/.test(file)) s += 2;
    for (const [re, p] of LOGO_PENALTIES) if (re.test(file)) s += p;
    if (s >= 2) bump(url, s);
  }
  return [...scores].sort((a, b) => b[1] - a[1]).slice(0, max).map(([url, score]) => ({ url, score }));
}

/* ── Gộp ─────────────────────────────────────────────────────── */

export interface BrandSources {
  pageUrl: string;
  html: string;
  /** Nội dung các file CSS đã tải (theo thứ tự). */
  css: string[];
  /** Nội dung các JS bundle đã tải. */
  js: string[];
  /** SVG của logo đứng đầu (nếu là SVG) – để lấy màu logo. */
  logoSvg?: string;
}

export function suggestBrand(src: BrandSources, signals = parseHtml(src.html, src.pageUrl)): BrandSuggestion {
  const css = [signals.inlineCss, ...src.css].join('\n');
  const boost: Record<string, number> = {};
  const theme = signals.themeColor && parseColor(signals.themeColor);
  if (theme && isBrandish(theme)) boost[toHex(theme)] = 10;
  for (const c of src.logoSvg ? svgColors(src.logoSvg) : []) boost[c] = (boost[c] ?? 0) + 8;

  const fontFamily = pickFontFamily(css, googleFontFamilies(signals.stylesheets));
  const tokens = brandTokens(signals, src.pageUrl);
  const textUrls = findImageUrls([src.html, ...src.js, ...src.css].join('\n'), src.pageUrl);
  return {
    name: signals.siteName ?? signals.title?.split(/\s[-|–—]\s/)[0]?.trim(),
    description: signals.description,
    colors: rankColors(countCssColors(css), boost),
    fontFamily,
    fontId: fontIdFromLabel(fontFamily),
    logos: rankLogos(signals.images, textUrls, tokens),
  };
}
