/**
 * Giới hạn dung lượng ảnh tham chiếu (style, nền): ảnh này đi nguyên trong body request lên server, nên giữ nhỏ để
 * request không vượt giới hạn body của hosting. Ảnh giữ pixel (sản phẩm, logo, trang trí) vẫn theo MAX_BYTES của form.
 */
import type { AssetRole } from '@/lib/types';

export const REFERENCE_MAX_BYTES = 4 * 1024 * 1024;
export const REFERENCE_MAX_LABEL = `${REFERENCE_MAX_BYTES / (1024 * 1024)}MB`;

export function isReferenceRole(role: AssetRole): boolean {
  return role === 'style-reference' || role === 'background';
}

/** Số byte của file gốc từ data URL base64 (không tính phần header `data:…;base64,`). */
export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function referenceTooBigMessage(fileName: string): string {
  return `${fileName}: ảnh tham chiếu tối đa ${REFERENCE_MAX_LABEL}. Hãy dùng ảnh nhẹ hơn.`;
}
