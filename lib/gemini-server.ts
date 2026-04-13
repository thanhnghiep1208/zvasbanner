/**
 * Server-only helpers for Gemini (text) + Imagen (REST predict).
 * @google/generative-ai does not expose Imagen; we call :predict with the same API key.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

import type { CanvasConfig, UploadedAsset } from "@/lib/types";

export const GEMINI_TIMEOUT_MS = 30_000;

const ENHANCE_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash",
] as const;

/** Imagen via Gemini API REST (same key as Generative AI). */
const IMAGEN_MODELS = [
  "imagen-4.0-generate-001",
  "imagen-3.0-generate-002",
  "imagen-3.0-generate-001",
] as const;

const IMAGEN_PROMPT_MAX_CHARS = 1800;

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return key;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

function escapeForMeta(s: string): string {
  return s.replace(/'/g, "’");
}

/**
 * Builds the meta-prompt for prompt enhancement (Layer 0).
 */
export function buildEnhanceMetaPrompt(
  userPrompt: string,
  canvasConfig: CanvasConfig,
  assets: UploadedAsset[]
): string {
  const { platform, width, height } = canvasConfig;
  const assetNote =
    assets.length > 0
      ? ` The user has attached ${assets.length} reference image(s) with roles: ${assets.map((a) => a.role).join(", ")}.`
      : "";
  return (
    "You are a prompt engineering specialist for AI banner generation. " +
    `The user wants to create a ${platform} banner (${width}×${height}px). ` +
    `Their current prompt is: '${escapeForMeta(userPrompt)}'.` +
    assetNote +
    " Rewrite it to be more effective for image generation. " +
    "Add specific visual design language (composition, lighting, typography style, color treatment). " +
    "Keep ALL original intent. Be 150-250 words. " +
    "Return ONLY the improved prompt text, no preamble."
  );
}

/**
 * Calls Gemini text models until one succeeds.
 */
export async function runGeminiEnhance(
  apiKey: string,
  metaPrompt: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const deadline = Date.now() + GEMINI_TIMEOUT_MS;

  let lastErr: unknown;
  for (const modelName of ENHANCE_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 500) {
      break;
    }
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await withTimeout(
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: metaPrompt }] }],
        }),
        remaining,
        `Gemini ${modelName}`
      );
      const text = result.response.text()?.trim() ?? "";
      if (text.length > 0) return text;
    } catch (e) {
      lastErr = e;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  if (Date.now() >= deadline) {
    throw new Error(
      `Gemini enhancement timed out after ${GEMINI_TIMEOUT_MS}ms: ${msg}`
    );
  }
  throw new Error(`Gemini enhancement failed: ${msg}`);
}

/**
 * Maps canvas dimensions to the closest Imagen-supported aspect ratio.
 */
export function inferImagenAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "1:1";
  const r = width / height;
  const options: { id: string; ratio: number }[] = [
    { id: "1:1", ratio: 1 },
    { id: "4:3", ratio: 4 / 3 },
    { id: "3:4", ratio: 3 / 4 },
    { id: "16:9", ratio: 16 / 9 },
    { id: "9:16", ratio: 9 / 16 },
  ];
  let best = options[0];
  let bestDiff = Math.abs(r - best.ratio);
  for (const o of options) {
    const d = Math.abs(r - o.ratio);
    if (d < bestDiff) {
      best = o;
      bestDiff = d;
    }
  }
  return best.id;
}

type ImagenPredictResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
  error?: { message?: string };
};

/**
 * Imagen image generation via REST `:predict` (generateImages-equivalent).
 */
export async function imagenGenerateOne(
  apiKey: string,
  prompt: string,
  aspectRatio: string
): Promise<string> {
  const safePrompt =
    prompt.length > IMAGEN_PROMPT_MAX_CHARS
      ? `${prompt.slice(0, IMAGEN_PROMPT_MAX_CHARS - 1)}…`
      : prompt;

  let lastStatus = 0;
  let lastBody = "";

  for (const model of IMAGEN_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          instances: [{ prompt: safePrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
          },
        }),
        signal: controller.signal,
      });
      lastStatus = res.status;
      const data = (await res.json()) as ImagenPredictResponse;
      if (!res.ok) {
        lastBody = JSON.stringify(data).slice(0, 500);
        continue;
      }
      const first = data.predictions?.[0];
      const b64 = first?.bytesBase64Encoded;
      if (b64) {
        const mime = first.mimeType ?? "image/png";
        return `data:${mime};base64,${b64}`;
      }
    } catch {
      /* try next model */
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Imagen predict failed (last HTTP ${lastStatus}): ${lastBody || "no body"}`
  );
}

/**
 * Solid-color placeholder as SVG data URL (no native deps).
 */
export function buildPlaceholderDataUrl(width: number, height: number): string {
  const w = Math.max(1, Math.min(Math.round(width), 4096));
  const h = Math.max(1, Math.min(Math.round(height), 4096));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#6366f1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="${Math.max(12, Math.min(w, h) / 18)}">Placeholder ${w}×${h}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
