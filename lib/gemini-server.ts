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

/** Locked image model. */
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

export type ImageGenerationMeta = {
  model: string;
  elapsedMs: number;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

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
 * Image generation via locked Gemini model.
 */
export async function geminiGenerateOneImage(
  apiKey: string,
  prompt: string,
  assets: UploadedAsset[] = []
): Promise<{ image: string; meta: ImageGenerationMeta }> {
  const startedAt = Date.now();
  const genAI = new GoogleGenerativeAI(apiKey);
  const visualParts = buildAssetInlineParts(assets);
  const model = genAI.getGenerativeModel({ model: GEMINI_IMAGE_MODEL });
  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `${prompt}\n\nOutput requirement: Return one final rendered image result. Prioritize image output.`,
            },
            ...visualParts,
          ],
        },
      ],
    }),
    GEMINI_TIMEOUT_MS,
    `Gemini image ${GEMINI_IMAGE_MODEL}`
  );
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const b64 = imagePart?.inlineData?.data;
  if (!b64) {
    throw new Error(`No image data in response from ${GEMINI_IMAGE_MODEL}`);
  }
  const mime = imagePart.inlineData?.mimeType ?? "image/png";
  const usage = result.response.usageMetadata as
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;
  return {
    image: `data:${mime};base64,${b64}`,
    meta: {
      model: GEMINI_IMAGE_MODEL,
      elapsedMs: Date.now() - startedAt,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
    },
  };
}

function buildAssetInlineParts(assets: UploadedAsset[]) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  const styleRefs = assets.filter((a) => a.role === "style-reference");
  const others = assets.filter((a) => a.role !== "style-reference");
  const ordered = [...styleRefs, ...others];

  for (const asset of ordered) {
    const p = parseDataUrl(asset.dataUrl);
    if (!p) continue;
    const roleInstruction =
      asset.role === "style-reference"
        ? "Use this as a strict style reference: match its color palette, gradient treatment, lighting mood, and graphic element language (shapes, lines, texture/noise, decorative motifs). Keep the same visual DNA and styling direction. Do not copy brand marks, faces, or exact text/content."
        : "Preserve this uploaded item as-is: keep its identity, proportions, silhouette, and key details. Do not redesign, replace, or heavily alter it; only harmonize lighting/color grading to match the new background and effects.";
    parts.push({
      text: `Reference asset (${asset.role}): ${asset.fileName}. ${roleInstruction}`,
    });
    parts.push({
      inlineData: {
        mimeType: p.mimeType,
        data: p.base64,
      },
    });
    if (asset.role === "style-reference") {
      // Repeat style anchor once to increase conditioning strength.
      parts.push({
        text: `Style anchor reinforcement for ${asset.fileName}: preserve palette, gradients, texture grain, and graphic motif language.`,
      });
      parts.push({
        inlineData: {
          mimeType: p.mimeType,
          data: p.base64,
        },
      });
    }
  }
  return parts;
}

function parseDataUrl(dataUrl: string | undefined): { mimeType: string; base64: string } | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
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
