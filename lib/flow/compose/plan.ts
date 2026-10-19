/**
 * Bản ghép (composition) cho composed mode – T4.3, SPEC 5.4. Pure, deterministic, test được.
 *
 * CompiledJob + LayoutPlan + ảnh nền 1 ratio → danh sách layer toạ độ PIXEL của canvas ratio.
 * Renderer Canvas 2D (lib/flow-ui/compose-render.ts) chỉ việc vẽ đúng thứ tự:
 *   nền → bóng sản phẩm → sản phẩm/trang trí → logo → chữ.
 * Headline `renderSource: 'ai'` không vẽ lại (Gemini đã vẽ trong nền, T4.2).
 */
import type { Look } from '../text/treatment';
import { elementColors, textPalette } from '../palette';
import type { CompiledJob } from '../compiled-job';
import type { LayoutPlan } from '../layout/types';
import type { FlowAsset, PixelAssetRole, RatioSpec, ShadowConfig, TextRole, Transform } from '../schema';
import { DEFAULT_STYLE } from '../schema';
import type { TextStyle } from '../text/text-style';

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Vùng có alpha của ảnh, tính theo tỉ lệ 0–1 của ảnh (renderer quét pixel). */
export interface AlphaBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShadowLayer {
  kind: 'shadow';
  assetId: string;
  /** Elip bóng tiếp xúc (px). */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  blurPx: number;
  opacity: number;
}

export interface ImageLayer {
  kind: 'image';
  assetId: string;
  role: PixelAssetRole;
  rect: PxRect;
  rotationDeg: number;
}

export interface TextLayerDraw {
  kind: 'text';
  layerId: string;
  rect: PxRect;
  /** Dòng đã xuống từ layout. Không có = layer bị override tay → renderer tự xuống dòng trong `rect`. */
  lines?: string[];
  content: string;
  fontSizePx: number;
  /** Style đã scale sang px của ratio (plate, stroke, shadow, letter spacing). */
  style: TextStyle;
  /** Chữ "tự động theo banner": renderer đo vùng nền dưới chữ rồi chọn màu (auto-style.ts `autoTextColors`). */
  auto?: { role: TextRole; palette: string[]; look?: Look };
}

export interface Composition {
  ratioId: string;
  width: number;
  height: number;
  background: string;
  layers: (ShadowLayer | ImageLayer | TextLayerDraw)[];
}

const toPx = (t: Transform, r: RatioSpec): PxRect => ({
  x: (t.cx - t.w / 2) * r.width,
  y: (t.cy - t.h / 2) * r.height,
  w: t.w * r.width,
  h: t.h * r.height,
});

/**
 * Ảnh luôn giữ đúng tỉ lệ gốc: khung từ layout (kể cả override tay) lệch tỉ lệ thì thu ảnh vào giữa khung
 * (contain) thay vì kéo giãn. Ảnh chưa rõ kích thước gốc → giữ khung.
 */
export function fitAspect(rect: PxRect, dims: { width: number; height: number }): PxRect {
  if (!(dims.width > 0 && dims.height > 0 && rect.w > 0 && rect.h > 0)) return rect;
  const k = Math.min(rect.w / dims.width, rect.h / dims.height);
  const w = dims.width * k;
  const h = dims.height * k;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

/** Hướng sáng → vector đơn vị trỏ TỚI nguồn sáng (0 = trên, theo chiều kim đồng hồ; trục y hướng xuống). */
export function lightVector(deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

/**
 * Bóng tiếp xúc dưới đáy vùng alpha của sản phẩm (SPEC 5.4).
 * - auto: elip mềm ở đáy, lệch ngược hướng sáng; độ đậm lấy từ config, độ nhoè theo kích thước sản phẩm.
 * - custom: opacity/blurPx/offsetX/offsetY từ config (px tại cạnh ngắn 1080 → scale theo ratio).
 * - off, hoặc ảnh không có alpha: không có bóng (validate đã cảnh báo product-no-alpha).
 */
export function contactShadow(
  asset: FlowAsset<PixelAssetRole>,
  rect: PxRect,
  alphaBox: AlphaBox | undefined,
  shadow: ShadowConfig,
  lightDirectionDeg: number,
  scale: number,
): ShadowLayer | null {
  if (shadow.mode === 'off' || !asset.hasAlpha) return null;
  const box = alphaBox ?? { x: 0, y: 0, w: 1, h: 1 };
  const left = rect.x + box.x * rect.w;
  const width = box.w * rect.w;
  const bottom = rect.y + (box.y + box.h) * rect.h;
  const height = box.h * rect.h;

  const rx = width * 0.46;
  const ry = Math.max(3 * scale, Math.min(height * 0.07, rx * 0.22));
  if (shadow.mode === 'custom') {
    return {
      kind: 'shadow', assetId: asset.assetId,
      cx: left + width / 2 + shadow.offsetX * scale,
      cy: bottom - ry * 0.35 + shadow.offsetY * scale,
      rx, ry,
      blurPx: shadow.blurPx * scale,
      opacity: shadow.opacity,
    };
  }
  // Ánh sáng từ phía nào thì bóng đổ sang phía đối diện (theo phương ngang trên mặt phẳng).
  const light = lightVector(lightDirectionDeg);
  return {
    kind: 'shadow', assetId: asset.assetId,
    cx: left + width / 2 - light.x * rx * 0.35,
    cy: bottom - ry * 0.35,
    rx, ry,
    blurPx: Math.max(4 * scale, ry * 1.6),
    opacity: shadow.opacity,
  };
}

function scaleStyle(style: TextStyle, scale: number): TextStyle {
  return {
    ...style,
    ...(style.stroke ? { stroke: { ...style.stroke, widthPx: style.stroke.widthPx * scale } } : {}),
    ...(style.shadow ? {
      shadow: {
        ...style.shadow,
        blurPx: style.shadow.blurPx * scale,
        offsetX: style.shadow.offsetX * scale,
        offsetY: style.shadow.offsetY * scale,
      },
    } : {}),
    ...(style.plate ? {
      plate: {
        ...style.plate,
        paddingX: style.plate.paddingX * scale,
        paddingY: style.plate.paddingY * scale,
        radiusPx: style.plate.radiusPx * scale,
      },
    } : {}),
  };
}

export function buildComposition(
  job: CompiledJob,
  plan: LayoutPlan,
  ratioId: string,
  background: string,
  alphaBoxes: Record<string, AlphaBox> = {},
): Composition {
  const ratio = job.ratios.find((r) => r.id === ratioId);
  if (!ratio) throw new Error(`Không có kích thước ${ratioId} trong job.`);
  const transforms = plan.transforms[ratioId] ?? {};
  const scale = Math.min(ratio.width, ratio.height) / 1080;
  const shadow = job.composed?.shadow ?? { mode: 'off', opacity: 0, blurPx: 0, offsetX: 0, offsetY: 0 };
  const light = job.composed?.lightDirectionDeg ?? 315;

  const shadows: ShadowLayer[] = [];
  const products: ImageLayer[] = [];
  const logos: ImageLayer[] = [];
  for (const asset of job.products) {
    const t = transforms[asset.assetId];
    if (!t) continue;
    const rect = fitAspect(toPx(t, ratio), asset.originalDims);
    const layer: ImageLayer = { kind: 'image', assetId: asset.assetId, role: asset.role, rect, rotationDeg: t.rotationDeg };
    if (asset.role === 'logo') {
      logos.push(layer);
      continue;
    }
    products.push(layer);
    // Bóng chỉ cho sản phẩm không xoay (P1); xoay tay thì bỏ bóng để khỏi lệch.
    if (t.rotationDeg === 0) {
      const s = contactShadow(asset, rect, alphaBoxes[asset.assetId], shadow, light, scale);
      if (s) shadows.push(s);
    }
  }

  const texts: TextLayerDraw[] = [];
  // Chữ/nút tự động lặp lại màu Brand kit; không có Brand kit thì màu chính của sản phẩm (bảng màu chung, palette.ts).
  const look: Look = { style: (job.style ?? DEFAULT_STYLE).style, mood: (job.style ?? DEFAULT_STYLE).mood };
  const textColors = textPalette(job.brandKit?.colors ?? [], elementColors(job.products.filter((p) => p.role === 'image').map((p) => p.dominantColors)));
  for (const layer of job.textLayers) {
    if (layer.role === 'headline' && layer.renderSource === 'ai') continue;
    const t = transforms[layer.layerId];
    const placed = plan.text[ratioId]?.[layer.layerId];
    if (!t) continue;
    texts.push({
      kind: 'text',
      layerId: layer.layerId,
      rect: toPx(t, ratio),
      // Override tay: không có dòng đã đo → renderer tự xuống dòng ở cỡ gốc. Không bỏ layer.
      ...(placed ? { lines: placed.lines } : {}),
      content: layer.content,
      fontSizePx: placed?.fontSizePx ?? layer.style.fontSizePx * scale,
      style: scaleStyle(layer.style, scale),
      ...(layer.autoStyle ? { auto: { role: layer.role, palette: textColors, look } } : {}),
    });
  }

  return {
    ratioId,
    width: ratio.width,
    height: ratio.height,
    background,
    layers: [...shadows, ...products, ...logos, ...texts],
  };
}
