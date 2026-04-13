const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ASSETS = 10;

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);

const ALLOWED_EXT = /\.(png|jpe?g|svg|webp)$/i;

export function isAllowedAssetType(file: File): boolean {
  if (file.type && ALLOWED_MIMES.has(file.type)) return true;
  if (!file.type && ALLOWED_EXT.test(file.name)) return true;
  return false;
}

export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_BYTES;
}

export { MAX_ASSETS, MAX_BYTES };

export function loadImageDimensions(
  objectUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("No window"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      resolve({ width: w, height: h });
    };
    img.onerror = () => reject(new Error("Could not read image dimensions"));
    img.src = objectUrl;
  });
}

export function guessHasAlpha(file: File): boolean {
  const t = file.type;
  return t === "image/png" || t === "image/webp" || t === "image/svg+xml";
}
