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

function drawText(ctx: CanvasRenderingContext2D, layer: TextLayerDraw) {
  const { style, rect, fontSizePx } = layer;
  const padX = style.plate?.paddingX ?? 0;
  const padY = style.plate?.paddingY ?? 0;
  const lines = layer.lines
    ?? layoutText(layer.content, style, fontSizePx, rect.w, 1, canvasMeasurer).lines;
  const shown = style.textTransform === 'uppercase' ? lines.map((l) => l.toUpperCase()) : lines;

  if (style.plate) {
    ctx.save();
    ctx.fillStyle = style.plate.color;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(style.plate.radiusPx, rect.h / 2));
    ctx.fill();
    ctx.restore();
  }

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

  shown.forEach((line, i) => {
    const y = top + lineH * (i + 0.5);
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowBlur = style.shadow.blurPx;
      ctx.shadowOffsetX = style.shadow.offsetX;
      ctx.shadowOffsetY = style.shadow.offsetY;
    }
    if (style.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = style.stroke.widthPx * 2; // nửa viền nằm dưới phần tô
      ctx.strokeStyle = style.stroke.color;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = style.fill.color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

export async function renderComposition(doc: Composition, images: Record<string, HTMLImageElement>): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.');

  drawCover(ctx, await loadImage(doc.background), doc.width, doc.height);

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
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((layer.rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      drawText(ctx, layer);
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
