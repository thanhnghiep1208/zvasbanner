/**
 * Resolves a banner image URL to a data URL for multimodal API (layout adaptation).
 * Data URLs pass through; http(s) uses same-origin proxy as export.
 */
export async function resolveBannerImageToDataUrl(
  imageUrl: string
): Promise<string | null> {
  if (imageUrl.startsWith("data:image/")) {
    return imageUrl;
  }
  const isRemoteHttp =
    imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
  if (!isRemoteHttp) {
    return null;
  }
  try {
    const proxy = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const res = await fetch(proxy);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = reader.result;
        if (typeof r === "string") resolve(r);
        else reject(new Error("FileReader did not return data URL"));
      };
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
