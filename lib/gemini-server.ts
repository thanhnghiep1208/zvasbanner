/**
 * Server-only helpers for Gemini (text) + Imagen (REST predict).
 * @google/generative-ai does not expose Imagen; we call :predict with the same API key.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

import type {
  CanvasConfig,
  ImageGenerationModel,
  UploadedAsset,
} from "@/lib/types";

export const GEMINI_ENHANCE_TIMEOUT_MS = 30_000;
export const GEMINI_IMAGE_TIMEOUT_MS = 55_000;
export const GEMINI_HARMONY_TIMEOUT_MS = 30_000;

export const HARMONY_EDIT_PROMPT = [
  "Refine this banner for visual cohesion only — do NOT change layout, composition, text, or subject positions.",
  "Tasks:",
  "1. Unify the light source direction across all elements and background — match shadows and highlights.",
  "2. Soften and feather all element edges so they blend naturally into the background (no hard cutout edges).",
  "3. Add subtle ambient occlusion shadows at contact points between elements and background.",
  "4. Apply a single unified color grade (temperature, contrast, saturation) across the entire image.",
  "5. Add a ground shadow beneath any product/object element touching a surface.",
  "6. Apply a very subtle vignette to unify the scene.",
  "Output the same canvas size, same content — only lighting, edge blending, and color harmony should change.",
].join("\n");

const ENHANCE_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash",
] as const;

const IMAGE_MODEL_MAP: Record<ImageGenerationModel, string> = {
  "nano-banana-pro": "gemini-3-pro-image-preview",
  "nano-banana-2": "gemini-3.1-flash-image-preview",
};

export type ImageGenerationMeta = {
  model: string;
  elapsedMs: number;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  harmonyApplied?: boolean;
};

const INPUT_COST_PER_1K_TOKENS_USD = 0.00015;
const OUTPUT_COST_PER_1K_TOKENS_USD = 0.0006;

function estimateGenerationCostUsd(params: {
  promptTokens?: number;
  outputTokens?: number;
}): number {
  const promptTokens = params.promptTokens ?? 0;
  const outputTokens = params.outputTokens ?? 0;
  const cost =
    (promptTokens / 1000) * INPUT_COST_PER_1K_TOKENS_USD +
    (outputTokens / 1000) * OUTPUT_COST_PER_1K_TOKENS_USD;
  return Number(cost.toFixed(6));
}

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
  const deadline = Date.now() + GEMINI_ENHANCE_TIMEOUT_MS;

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
      `Gemini enhancement timed out after ${GEMINI_ENHANCE_TIMEOUT_MS}ms: ${msg}`
    );
  }
  throw new Error(`Gemini enhancement failed: ${msg}`);
}

/**
 * Image generation via selected Gemini model profile.
 */
export async function geminiGenerateOneImage(
  apiKey: string,
  prompt: string,
  assets: UploadedAsset[] = [],
  options?: {
    referenceOutputBannerDataUrl?: string | null;
    imageModel?: ImageGenerationModel;
  }
): Promise<{ image: string; meta: ImageGenerationMeta }> {
  const startedAt = Date.now();
  const genAI = new GoogleGenerativeAI(apiKey);
  const imageModelId = IMAGE_MODEL_MAP[options?.imageModel ?? "nano-banana-pro"];
  const referenceParts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];
  const refUrl = options?.referenceOutputBannerDataUrl;
  if (refUrl) {
    const parsedRef = parseDataUrl(refUrl);
    if (parsedRef) {
      referenceParts.push({
        text:
          "REFERENCE OUTPUT (approved banner to adapt). Match this layout, hierarchy, palette, and typography roles as closely as the requested output dimensions allow. Translate; do not invent a new concept. Preserve major content blocks and CTA/headline hierarchy.",
      });
      referenceParts.push({
        inlineData: {
          mimeType: parsedRef.mimeType,
          data: parsedRef.base64,
        },
      });
    }
  }
  const visualParts = buildAssetInlineParts(assets);
  const model = genAI.getGenerativeModel({ model: imageModelId });
  const result = await withTimeout(
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            ...referenceParts,
            {
              text:
                `${prompt}\n\nOutput requirement: Return one final rendered image result. Prioritize image output.`,
            },
            ...visualParts,
          ],
        },
      ],
    }),
    GEMINI_IMAGE_TIMEOUT_MS,
    `Gemini image ${imageModelId}`
  );
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const b64 = imagePart?.inlineData?.data;
  if (!b64) {
    throw new Error(`No image data in response from ${imageModelId}`);
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
      model: imageModelId,
      elapsedMs: Date.now() - startedAt,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      costUsd: estimateGenerationCostUsd({
        promptTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      }),
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

function buildHarmonyImagePrompt(canvasConfig: CanvasConfig): string {
  const canvasText = `Target canvas: ${canvasConfig.width}x${canvasConfig.height} (${canvasConfig.platform} - ${canvasConfig.name}).`;
  return [
    "You are refining an existing generated banner image for visual cohesion only.",
    "Do NOT change layout, composition, text content, or subject positions.",
    "Preserve readability and production quality.",
    canvasText,
    "",
    HARMONY_EDIT_PROMPT,
  ].join("\n");
}

function buildEditImagePrompt(editPrompt: string, canvasConfig?: CanvasConfig): string {
  const canvasText = canvasConfig
    ? `Target canvas: ${canvasConfig.width}x${canvasConfig.height} (${canvasConfig.platform} - ${canvasConfig.name}).`
    : "Target canvas: keep original image ratio and framing.";
  return [
    "You are editing an existing generated banner image.",
    "IMPORTANT: Keep the same core subject, same overall composition, and same scene identity.",
    "Do NOT create a brand-new design from scratch.",
    "Only apply limited edits requested by the user, mainly:",
    "- adjust object position/layout subtly,",
    "- adjust rotation/angle subtly,",
    "- adjust basic colors, tone, or contrast.",
    "Preserve readability and production quality.",
    canvasText,
    "",
    `User edit request: ${editPrompt.trim()}`,
  ].join("\n");
}

/**
 * Edit an existing generated image (same model path as /api/edit-image).
 */
export async function geminiEditImage(
  apiKey: string,
  imageDataUrl: string,
  editPrompt: string,
  options?: {
    canvasConfig?: CanvasConfig;
    imageModel?: ImageGenerationModel;
  }
): Promise<{ image: string; meta: ImageGenerationMeta }> {
  const prompt = buildEditImagePrompt(editPrompt, options?.canvasConfig);
  const dims = options?.canvasConfig;
  return geminiGenerateOneImage(
    apiKey,
    prompt,
    [
      {
        id: "generated-base-image",
        url: "generated-base-image",
        dataUrl: imageDataUrl,
        fileName: "generated-base-image.png",
        role: "image",
        hasAlpha: false,
        originalDims: {
          width: dims?.width ?? 0,
          height: dims?.height ?? 0,
        },
      },
    ],
    { imageModel: options?.imageModel }
  );
}

/**
 * Best-effort post-generation harmony pass (lighting, edges, color grade).
 * Returns the original image when the pass fails or times out.
 */
function buildHarmonyBaseAsset(
  imageDataUrl: string,
  canvasConfig: CanvasConfig
): UploadedAsset {
  return {
    id: "generated-base-image",
    url: "generated-base-image",
    dataUrl: imageDataUrl,
    fileName: "generated-base-image.png",
    role: "image",
    hasAlpha: false,
    originalDims: {
      width: canvasConfig.width,
      height: canvasConfig.height,
    },
  };
}

export async function runHarmonyPass(
  apiKey: string,
  imageDataUrl: string,
  canvasConfig: CanvasConfig,
  imageModel?: ImageGenerationModel
): Promise<{ image: string; harmonyApplied: boolean }> {
  try {
    const result = await withTimeout(
      geminiGenerateOneImage(
        apiKey,
        buildHarmonyImagePrompt(canvasConfig),
        [buildHarmonyBaseAsset(imageDataUrl, canvasConfig)],
        { imageModel }
      ),
      GEMINI_HARMONY_TIMEOUT_MS,
      "Harmony pass"
    );
    return { image: result.image, harmonyApplied: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[harmony-pass] skipped: ${reason}`);
    return { image: imageDataUrl, harmonyApplied: false };
  }
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
