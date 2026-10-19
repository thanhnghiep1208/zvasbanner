import {
  guessHasAlpha, isAllowedAssetType, isWithinSizeLimit, loadImageDimensions, MAX_BYTES,
} from '@/lib/asset-upload';
import { isReferenceRole, REFERENCE_MAX_BYTES, referenceTooBigMessage } from '@/lib/flow/asset-limits';
import type { FlowAsset } from '@/lib/flow/schema';
import { readDominantColors } from '@/lib/flow-ui/asset-colors';
import type { AssetRole } from '@/lib/types';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

export type AssetFileResult =
  | { ok: true; patch: Omit<FlowAsset, 'role'>; dataUrl: string }
  | { ok: false; message: string };

/**
 * Đọc file ảnh user chọn/thả vào (Inspector, kéo thả lên canvas). Kiểm định dạng, dung lượng giống form.
 * `patch` ghi thẳng vào params node ảnh (giữ role); `dataUrl` vào `assetData` (chỉ có lúc chạy).
 * `role` = vai trò ảnh sẽ nhận: ảnh tham chiếu có giới hạn nhỏ hơn (asset-limits.ts).
 */
export async function readAssetFile(file: File, role?: AssetRole): Promise<AssetFileResult> {
  if (!isAllowedAssetType(file)) return { ok: false, message: `${file.name}: định dạng không được hỗ trợ (PNG, JPG, SVG, WebP).` };
  if (!isWithinSizeLimit(file)) return { ok: false, message: `${file.name}: dung lượng vượt quá ${MAX_BYTES / (1024 * 1024)}MB.` };
  if (role && isReferenceRole(role) && file.size > REFERENCE_MAX_BYTES) return { ok: false, message: referenceTooBigMessage(file.name) };
  const url = URL.createObjectURL(file);
  try {
    const [originalDims, dataUrl, dominantColors] = await Promise.all([loadImageDimensions(url), fileToDataUrl(file), readDominantColors(url)]);
    return {
      ok: true,
      dataUrl,
      patch: {
        assetId: crypto.randomUUID(), url, fileName: file.name, hasAlpha: guessHasAlpha(file), originalDims,
        // Bảng màu chung (palette.ts): nền tránh trùng màu sản phẩm, chữ/CTA lặp lại màu sản phẩm.
        ...(dominantColors.length ? { dominantColors } : {}),
      },
    };
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, message: `${file.name}: không đọc được ảnh.` };
  }
}
