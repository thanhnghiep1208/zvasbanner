/**
 * Vẽ layout guide image (T4.2, SPEC 3 quyết định 1): nền trắng + khối xám cho vùng product/logo/text.
 * Chỉ toạ độ – không có pixel sản phẩm. Gửi kèm request sinh nền làm "bản đồ vùng trống".
 * Chạy trên trình duyệt (Canvas 2D).
 */
import type { CanvasConfig } from '@/lib/types';
import type { GuideRect } from '@/lib/flow/layout/types';

/** Cạnh dài tối đa của guide – đủ để model đọc vị trí, nhỏ để body request gọn. */
const MAX_SIDE = 1024;

/** Product đậm nhất (vùng quan trọng nhất), text nhạt hơn. */
export const GUIDE_FILL: Record<GuideRect['kind'], string> = {
  product: '#8a8a8a',
  logo: '#a3a3a3',
  text: '#bdbdbd',
};

export function guideImageSize(canvas: Pick<CanvasConfig, 'width' | 'height'>): { width: number; height: number } {
  const k = Math.min(1, MAX_SIDE / Math.max(canvas.width, canvas.height));
  return { width: Math.max(1, Math.round(canvas.width * k)), height: Math.max(1, Math.round(canvas.height * k)) };
}

export function renderGuideImage(
  canvas: Pick<CanvasConfig, 'width' | 'height'>, guide: GuideRect[],
): string {
  const { width, height } = guideImageSize(canvas);
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas 2D để vẽ layout guide.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  // Khung viền + gạch chéo nhạt thay vì khối đặc: model ít "vẽ lại" mảng xám thành panel trong cảnh.
  const hatch = Math.max(8, Math.round(Math.min(width, height) / 40));
  for (const g of guide) {
    const x = Math.round(g.x * width);
    const y = Math.round(g.y * height);
    const w = Math.round(g.w * width);
    const h = Math.round(g.h * height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = GUIDE_FILL[g.kind];
    ctx.lineWidth = 1;
    for (let d = -h; d < w; d += hatch) {
      ctx.beginPath();
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = Math.max(2, Math.round(hatch / 4));
    ctx.strokeRect(x, y, w, h);
  }
  return el.toDataURL('image/png');
}
