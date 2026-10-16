import {
  guessHasAlpha, isAllowedAssetType, isWithinSizeLimit, loadImageDimensions, MAX_BYTES,
} from '@/lib/asset-upload';
import type { FlowAsset } from '@/lib/flow/schema';

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
 */
export async function readAssetFile(file: File): Promise<AssetFileResult> {
  if (!isAllowedAssetType(file)) return { ok: false, message: `${file.name}: định dạng không được hỗ trợ (PNG, JPG, SVG, WebP).` };
  if (!isWithinSizeLimit(file)) return { ok: false, message: `${file.name}: dung lượng vượt quá ${MAX_BYTES / (1024 * 1024)}MB.` };
  const url = URL.createObjectURL(file);
  try {
    const [originalDims, dataUrl] = await Promise.all([loadImageDimensions(url), fileToDataUrl(file)]);
    return {
      ok: true,
      dataUrl,
      patch: { assetId: crypto.randomUUID(), url, fileName: file.name, hasAlpha: guessHasAlpha(file), originalDims },
    };
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, message: `${file.name}: không đọc được ảnh.` };
  }
}
