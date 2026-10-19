/**
 * Đo màu chủ đạo của ảnh vừa tải (DOM): thu về ≤ 64px trên canvas rồi đếm màu (lib/flow/palette.ts).
 * Chỉ mã màu được lưu/gửi đi – pixel ảnh không rời máy user. Lỗi (ảnh hỏng, SVG không vẽ được) → [].
 */
import { dominantColors } from '@/lib/flow/palette';

/** Không để việc đo màu chặn tải ảnh: quá thời gian thì bỏ qua (ảnh vẫn dùng được, chỉ thiếu bảng màu). */
const TIMEOUT_MS = 3000;

function loadImage(url: string): Promise<HTMLImageElement> {
  // Dùng onload thay img.decode(): decode() có lúc không bao giờ resolve (đo trong pane app, 2026-10-19).
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error('load')); };
    img.src = url;
  });
}

export async function readDominantColors(url: string): Promise<string[]> {
  try {
    const img = await loadImage(url);
    const w0 = img.naturalWidth || 64, h0 = img.naturalHeight || 64;
    const scale = Math.min(1, 64 / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);
    return dominantColors(ctx.getImageData(0, 0, w, h).data);
  } catch {
    return [];
  }
}
