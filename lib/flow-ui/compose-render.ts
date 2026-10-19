/**
 * Renderer Canvas 2D cho composed mode (T4.3, SPEC 5.4) + measurer chữ thật (phần đầu của T4.4).
 * Chạy trên trình duyệt. Vẽ đúng Composition do lib/flow/compose/plan.ts tính:
 *   nền (cover) → bóng tiếp xúc → sản phẩm → logo → chữ (plate, bóng chữ, viền, màu).
 * Layout và renderer dùng CHUNG `canvasMeasurer` để chữ vẽ ra khớp với khung đã xếp.
 */
import type { CompiledJob } from '@/lib/flow/compiled-job';
import { buildComposition, type AlphaBox, type Composition, type TextLayerDraw } from '@/lib/flow/compose/plan';
import type { LayoutPlan } from '@/lib/flow/layout/types';
import { layoutText, type TextMeasurer } from '@/lib/flow/layout/measure';
import { FLOW_FONTS, type FontId, type TextStyle } from '@/lib/flow/text/text-style';
import { autoTextColors, relativeLuminance, type BackgroundSample } from '@/lib/flow/text/auto-style';
import { logoHalo, plateTreatment, scrimFor, textTreatment, type PlateTreatment, type Scrim, type TextTreatment } from '@/lib/flow/text/treatment';

/* ── Font ───────────────────────────────────────────────────── */

/**
 * Biến CSS next/font khai báo cho từng font: Inter ở <body> (app/layout.tsx), các font còn lại ở khung /flow
 * (`[data-flow-fonts]`, components/flow/flow-fonts.ts).
 */
const FONT_CSS_VAR: Record<FontId, string> = {
  'inter': '--font-inter',
  'be-vietnam-pro': '--font-flow-be-vietnam-pro',
  'noto-serif': '--font-flow-noto-serif',
  'montserrat': '--font-flow-montserrat',
  'dancing-script': '--font-flow-dancing-script',
};

/** Tên font thật để Canvas dùng (next/font đổi tên thành `__Inter_xxx`…). */
export function resolveFontFamily(fontId: FontId): string {
  if (typeof document !== 'undefined') {
    const host = document.querySelector('[data-flow-fonts]') ?? document.body;
    const v = getComputedStyle(host).getPropertyValue(FONT_CSS_VAR[fontId]).trim();
    if (v) return v;
  }
  return `"${FLOW_FONTS[fontId].label}", ${FLOW_FONTS[fontId].fallback}`;
}

export function fontString(style: TextStyle, sizePx: number): string {
  return `${style.italic ? 'italic ' : ''}${style.fontWeight} ${sizePx}px ${resolveFontFamily(style.fontFamily)}`;
}

/** Tải trước mọi font/weight mà job dùng (kèm ký tự tiếng Việt) – gọi TRƯỚC khi đo/vẽ. */
export async function ensureFonts(styles: TextStyle[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const unique = new Set(styles.map((s) => fontString(s, 32)));
  await Promise.all([...unique].map((f) => document.fonts.load(f, 'Ảẩ Đđ Ưư 0123')));
}

/* ── Measurer thật (Canvas 2D) ──────────────────────────────── */

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx2d(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    measureCtx = c.getContext('2d');
    if (!measureCtx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');
  }
  return measureCtx;
}

/** Độ rộng 1 dòng: measureText + letter spacing cộng tay (giống cách vẽ bên dưới). */
export const canvasMeasurer: TextMeasurer = {
  width(text, style, fontSizePx) {
    const ctx = ctx2d();
    ctx.font = fontString(style, fontSizePx);
    const chars = [...text].length;
    return ctx.measureText(text).width + Math.max(0, chars - 1) * style.letterSpacingEm * fontSizePx;
  },
};

/* ── Ảnh ────────────────────────────────────────────────────── */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh.'));
    img.src = src;
  });
}

/** Vùng có pixel (alpha > ngưỡng) theo tỉ lệ 0–1; ảnh đặc hoàn toàn → undefined (dùng cả ảnh). */
export function alphaBox(img: HTMLImageElement): AlphaBox | undefined {
  const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1, transparent = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3]!;
      if (a <= 16) { transparent = true; continue; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!transparent || maxX < 0) return undefined;
  return { x: minX / w, y: minY / h, w: (maxX - minX + 1) / w, h: (maxY - minY + 1) / h };
}

/* ── Vẽ ─────────────────────────────────────────────────────── */

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

/** Hiệu ứng tính lúc ghép cho chữ "tự động theo banner" (lib/flow/text/treatment.ts). */
interface TextFx {
  text?: TextTreatment;
  plate?: PlateTreatment;
}

function plateFill(ctx: CanvasRenderingContext2D, rect: PxRectLike, from: string, to: string) {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

type PxRectLike = { x: number; y: number; w: number; h: number };

function drawPlate(ctx: CanvasRenderingContext2D, rect: PxRectLike, radius: number, color: string, fx?: PlateTreatment) {
  const path = () => { ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius); };
  ctx.save();
  if (!fx) {
    ctx.fillStyle = color;
    path();
    ctx.fill();
    ctx.restore();
    return;
  }
  const fill = plateFill(ctx, rect, fx.from, fx.to);
  if (fx.glow) {
    ctx.shadowColor = fx.glow.color;
    ctx.shadowBlur = fx.glow.blurPx;
    ctx.fillStyle = fill;
    path();
    ctx.fill();
  }
  ctx.shadowColor = fx.shadow.color;
  ctx.shadowBlur = fx.shadow.blurPx;
  ctx.shadowOffsetY = fx.shadow.offsetY;
  ctx.fillStyle = fill;
  path();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (fx.highlight) {
    // Dải sáng nửa trên nút: gợi khối bóng bẩy, không lệch màu nút.
    ctx.save();
    path();
    ctx.clip();
    const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.55);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h * 0.55);
    ctx.restore();
  }
  if (fx.border) {
    ctx.lineWidth = fx.border.widthPx;
    ctx.strokeStyle = fx.border.color;
    path();
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayerDraw, fx: TextFx = {}) {
  const { style, rect, fontSizePx } = layer;
  const padX = style.plate?.paddingX ?? 0;
  const padY = style.plate?.paddingY ?? 0;
  const lines = layer.lines
    ?? layoutText(layer.content, style, fontSizePx, rect.w, 1, canvasMeasurer).lines;
  const shown = style.textTransform === 'uppercase' ? lines.map((l) => l.toUpperCase()) : lines;

  if (style.plate) drawPlate(ctx, rect, Math.min(style.plate.radiusPx, rect.h / 2), style.plate.color, fx.plate);

  ctx.save();
  ctx.font = fontString(style, fontSizePx);
  ctx.textBaseline = 'middle';
  ctx.textAlign = style.align;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${style.letterSpacingEm * fontSizePx}px`;
  }
  const x = style.align === 'left' ? rect.x + padX : style.align === 'right' ? rect.x + rect.w - padX : rect.x + rect.w / 2;
  const lineH = fontSizePx * style.lineHeight;
  const top = rect.y + padY + (rect.h - padY * 2 - lineH * shown.length) / 2;
  const t = fx.text;
  const reset = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };

  shown.forEach((line, i) => {
    const y = top + lineH * (i + 0.5);
    const fillStyle = (() => {
      if (!t?.fill.to) return t?.fill.from ?? style.fill.color;
      const g = ctx.createLinearGradient(0, y - fontSizePx * 0.5, 0, y + fontSizePx * 0.5);
      g.addColorStop(0, t.fill.from);
      g.addColorStop(1, t.fill.to);
      return g;
    })();
    if (t?.glow) {
      ctx.shadowColor = t.glow.color;
      ctx.shadowBlur = t.glow.blurPx;
      ctx.fillStyle = t.fill.from;
      ctx.fillText(line, x, y);
      reset();
    }
    if (t?.extrude) {
      // Bóng khối: vài bản sao lệch dần, không nhoè.
      ctx.fillStyle = t.extrude.color;
      const steps = 4;
      for (let k = steps; k >= 1; k--) ctx.fillText(line, x + (t.extrude.offsetX * k) / steps, y + (t.extrude.offsetY * k) / steps);
    }
    const stroke = t?.stroke ?? style.stroke;
    if (!t && style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blurPx;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
    } else if (t?.softShadow) {
      ctx.shadowColor = t.softShadow.color;
      ctx.shadowBlur = t.softShadow.blurPx;
      ctx.shadowOffsetY = t.softShadow.offsetY;
    }
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.widthPx * 2; // nửa viền nằm dưới phần tô
      ctx.strokeStyle = stroke.color;
      ctx.strokeText(line, x, y);
      reset();
    }
    ctx.fillStyle = fillStyle;
    ctx.fillText(line, x, y);
    reset();
  });
  ctx.restore();
}

/** Đo vùng nền đã vẽ dưới chữ (lấy mẫu thưa ~2.000 điểm): màu trung bình + độ rối. */
function sampleRegion(ctx: CanvasRenderingContext2D, rect: TextLayerDraw['rect']): BackgroundSample {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.min(W - x, Math.ceil(rect.w)));
  const h = Math.max(1, Math.min(H - y, Math.ceil(rect.h)));
  const data = ctx.getImageData(x, y, w, h).data;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 2000)));
  let r = 0, g = 0, b = 0, n = 0;
  const lums: number[] = [];
  for (let yy = 0; yy < h; yy += step) {
    for (let xx = 0; xx < w; xx += step) {
      const i = (yy * w + xx) * 4;
      r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
      lums.push(relativeLuminance(data[i]!, data[i + 1]!, data[i + 2]!));
    }
  }
  const mean = lums.reduce((s, v) => s + v, 0) / lums.length;
  const spread = Math.sqrt(lums.reduce((s, v) => s + (v - mean) ** 2, 0) / lums.length);
  return { r: r / n, g: g / n, b: b / n, spread };
}

/** Chữ tự động: màu chữ/bóng/nút theo nền thật ngay dưới chữ + hiệu ứng theo phong cách (treatment.ts). */
function autoLayer(layer: TextLayerDraw, bg: BackgroundSample): { layer: TextLayerDraw; fx: TextFx } {
  if (!layer.auto) return { layer, fx: {} };
  const c = autoTextColors(layer.auto.role, bg, layer.auto.palette, layer.fontSizePx);
  const styled: TextLayerDraw = {
    ...layer,
    style: {
      ...layer.style,
      fill: { kind: 'solid', color: c.fill },
      ...(c.shadow ? { shadow: c.shadow } : {}),
      ...(c.plateColor && layer.style.plate ? { plate: { ...layer.style.plate, color: c.plateColor } } : {}),
    },
  };
  const look = layer.auto.look;
  if (!look) return { layer: styled, fx: {} };
  return {
    layer: styled,
    fx: {
      text: textTreatment(layer.auto.role, look, bg, c, layer.auto.palette, layer.fontSizePx),
      ...(styled.style.plate ? { plate: plateTreatment(look, styled.style.plate.color, layer.rect.h) } : {}),
    },
  };
}

/** Vầng tối/sáng mềm hình elip sau cụm chữ – làm rõ chữ mà không thành khung. */
function drawScrim(ctx: CanvasRenderingContext2D, rects: PxRectLike[], scrim: Scrim) {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = ((x1 - x0) / 2) * 1.45, ry = ((y1 - y0) / 2) * 1.6;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(scrim.color.slice(i, i + 2), 16));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${scrim.alpha})`);
  grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${scrim.alpha * 0.7})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Độ sáng trung bình phần có pixel của logo (bỏ vùng trong suốt). */
function opaqueLuminance(img: HTMLImageElement): number {
  const k = Math.min(1, 64 / Math.max(img.naturalWidth || 64, img.naturalHeight || 64));
  const w = Math.max(1, Math.round((img.naturalWidth || 64) * k)), h = Math.max(1, Math.round((img.naturalHeight || 64) * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  if (!cx) return 0.5;
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) continue;
    sum += relativeLuminance(d[i]!, d[i + 1]!, d[i + 2]!);
    n++;
  }
  return n ? sum / n : 0.5;
}

export async function renderComposition(doc: Composition, images: Record<string, HTMLImageElement>): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');

  drawCover(ctx, await loadImage(doc.background), doc.width, doc.height);

  // Chữ vẽ sau cùng: đo nền dưới TẤT CẢ chữ trước khi vẽ chữ nào (chữ trước không làm lệch màu chữ sau).
  const texts = doc.layers.filter((l): l is TextLayerDraw => l.kind === 'text');
  let textsReady = false;
  const drawTexts = () => {
    if (textsReady) return;
    textsReady = true;
    const prepared = texts.map((l) => {
      const bg = sampleRegion(ctx, l.rect);
      return { bg, ...autoLayer(l, bg) };
    });
    const auto = prepared.filter((p) => p.layer.auto?.look && p.layer.auto.role !== 'cta');
    const look = auto[0]?.layer.auto?.look;
    const scrim = look && scrimFor(look, auto.map((p) => p.bg), auto.map((p) => p.layer.style.fill.color));
    if (scrim) drawScrim(ctx, auto.map((p) => p.layer.rect), scrim);
    for (const p of prepared) {
      // Đã có vầng làm rõ thì bỏ bóng mềm từng chữ (đỡ nhoè, chữ sắc hơn).
      const fx = scrim && p.fx.text ? { ...p.fx, text: { ...p.fx.text, softShadow: undefined } } : p.fx;
      drawText(ctx, p.layer, fx);
    }
  };

  for (const layer of doc.layers) {
    if (layer.kind === 'shadow') {
      // Vẽ elip ngoài khung rồi dịch bóng vào: shadowBlur chạy trên mọi trình duyệt (ctx.filter thì không).
      const far = doc.width * 3;
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${layer.opacity})`;
      ctx.shadowBlur = layer.blurPx;
      ctx.shadowOffsetX = far;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(layer.cx - far, layer.cy, layer.rx, layer.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (layer.kind === 'image') {
      const img = images[layer.assetId];
      if (!img) throw new Error(`Thiếu ảnh ${layer.assetId}.`);
      const { x, y, w, h } = layer.rect;
      // Logo chìm vào nền → quầng mảnh ngược màu (treatment.ts logoHalo).
      const halo = layer.role === 'logo' && texts.some((t) => t.auto?.look)
        ? logoHalo(opaqueLuminance(img), sampleRegion(ctx, layer.rect), h) : undefined;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((layer.rotationDeg * Math.PI) / 180);
      if (halo) {
        ctx.shadowColor = halo.color;
        ctx.shadowBlur = halo.blurPx;
      }
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      drawTexts();
    }
  }
  return canvas.toDataURL('image/png');
}

/** 1 ratio: tải ảnh sản phẩm, quét alpha, dựng Composition rồi vẽ. */
export async function composeRatio(args: {
  job: CompiledJob;
  plan: LayoutPlan;
  ratioId: string;
  background: string;
  dataUrls: Record<string, string>;
}): Promise<string> {
  const images: Record<string, HTMLImageElement> = {};
  const boxes: Record<string, AlphaBox> = {};
  for (const asset of args.job.products) {
    const src = args.dataUrls[asset.assetId];
    if (!src) throw new Error(`Thiếu ảnh ${asset.fileName || asset.assetId}.`);
    const img = await loadImage(src);
    images[asset.assetId] = img;
    const box = asset.hasAlpha ? alphaBox(img) : undefined;
    if (box) boxes[asset.assetId] = box;
  }
  return renderComposition(buildComposition(args.job, args.plan, args.ratioId, args.background, boxes), images);
}

/**
 * Xem trước 1 text layer bằng CHÍNH hàm vẽ của Compose (Inspector, T4.4) – thấy gì xuất ra nấy.
 * `fontSizePx` là px thật (đã scale); `maxWidthPx` = bề rộng khung để xuống dòng.
 */
export async function renderTextPreview(
  canvas: HTMLCanvasElement, content: string, style: TextStyle, fontSizePx: number, maxWidthPx: number,
): Promise<{ width: number; height: number; lines: number; overflow: boolean }> {
  await ensureFonts([style]);
  const box = layoutText(content, style, fontSizePx, maxWidthPx, 1, canvasMeasurer);
  const pad = Math.ceil((style.shadow ? style.shadow.blurPx + Math.abs(style.shadow.offsetY) : 0) + (style.stroke?.widthPx ?? 0));
  const w = Math.ceil(maxWidthPx);
  const h = Math.ceil(box.height + pad * 2);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const x = style.align === 'left' ? 0 : style.align === 'right' ? w - box.width : (w - box.width) / 2;
  drawText(ctx, {
    kind: 'text', layerId: 'preview', content, lines: box.lines, fontSizePx, style,
    rect: { x, y: pad, w: box.width, h: box.height },
  });
  return { width: box.width, height: box.height, lines: box.lines.length, overflow: box.overflow };
}
