"use client";

import type { CanvasConfig } from "@/lib/types";

function loadImageFromSrc(src: string, useCrossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCrossOrigin) {
      img.crossOrigin = "anonymous";
    }
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

/**
 * Loads an image for canvas use. Remote http(s) URLs go through `/api/proxy-image` to avoid CORS tainting.
 * Returns a loaded HTMLImageElement.
 */
export async function proxyImageToBlob(url: string): Promise<HTMLImageElement> {
  const isRemoteHttp =
    url.startsWith("http://") || url.startsWith("https://");

  if (isRemoteHttp) {
    const proxy = `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    if (!res.ok) {
      throw new Error(`Proxy fetch failed: ${res.status}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImageFromSrc(objectUrl, true);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return loadImageFromSrc(url, false);
}

function slugPlatform(platform: string): string {
  const s = platform
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 48) || "banner";
}

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(href);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetW: number,
  targetH: number
): void {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW <= 0 || srcH <= 0) return;

  const scale = Math.max(targetW / srcW, targetH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (targetW - drawW) / 2;
  const dy = (targetH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

export async function exportBanner(options: {
  imageUrl: string;
  canvasConfig: CanvasConfig;
  format: "png" | "jpg";
  quality: number;
  scale: 1 | 2;
}): Promise<void> {
  const { imageUrl, canvasConfig, format, quality, scale } = options;
  const { width, height, platform } = canvasConfig;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const banner = await proxyImageToBlob(imageUrl);
  // Fill the selected canvas size without distortion (center-crop if needed).
  drawImageCover(ctx, banner, width, height);

  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  const ext = format === "png" ? "png" : "jpg";
  const q = Math.min(1, Math.max(0.6, quality));
  const slug = slugPlatform(platform);
  const filename = `banner-${slug}-${width}x${height}-${Date.now()}.${ext}`;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Export failed: empty image"));
        else resolve(b);
      },
      mimeType,
      format === "jpg" ? q : undefined
    );
  });

  triggerDownload(blob, filename);
}
