/**
 * Giá Gemini image (Paid tier, Standard, USD / 1M token) – https://ai.google.dev/gemini-api/docs/pricing (10/2026).
 * Ảnh output tính theo token: 1K = 1120 token cho cả 2.1 và Pro (≈ $0.0336 / $0.134 mỗi ảnh),
 * xem https://ai.google.dev/gemini-api/docs/image-generation. Text + thinking output tính giá text.
 * Không import server-only để test được; gemini-server và flow-server dùng chung.
 */

type ModelPricing = { input: number; textOutput: number; imageOutput: number };

const NANO_BANANA_2_1: ModelPricing = { input: 1.5, textOutput: 7.5, imageOutput: 30 };
const NANO_BANANA_PRO: ModelPricing = { input: 2, textOutput: 12, imageOutput: 120 };
const FLASH_IMAGE_3_1: ModelPricing = { input: 0.5, textOutput: 3, imageOutput: 60 };

const PRICING: Record<string, ModelPricing> = {
  "gemini-nano-banana-2.1": NANO_BANANA_2_1,
  "gemini-3-pro-image": NANO_BANANA_PRO,
  "gemini-3-pro-image-preview": NANO_BANANA_PRO,
  "gemini-3.1-flash-image": FLASH_IMAGE_3_1,
  "gemini-3.1-flash-image-preview": FLASH_IMAGE_3_1,
};

/** `usageMetadata` Gemini trả về (SDK để nguyên JSON, có thể thiếu field). */
export type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
};

export type UsageMeta = {
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd: number;
};

function pricingFor(modelId: string): ModelPricing {
  return PRICING[modelId] ?? (modelId.includes("pro") ? NANO_BANANA_PRO : NANO_BANANA_2_1);
}

/** Token output dạng ảnh; thiếu chi tiết modality thì coi toàn bộ candidates là ảnh (model ảnh chủ yếu trả ảnh). */
function imageOutputTokens(usage: GeminiUsage): number {
  const candidates = usage.candidatesTokenCount ?? 0;
  const details = usage.candidatesTokensDetails;
  if (!details?.length) return candidates;
  const image = details
    .filter((d) => d.modality === "IMAGE")
    .reduce((sum, d) => sum + (d.tokenCount ?? 0), 0);
  return Math.min(image, candidates);
}

export function estimateImageCallCostUsd(modelId: string, usage: GeminiUsage | undefined): number {
  if (!usage) return 0;
  const p = pricingFor(modelId);
  const image = imageOutputTokens(usage);
  const text = (usage.candidatesTokenCount ?? 0) - image + (usage.thoughtsTokenCount ?? 0);
  const cost =
    ((usage.promptTokenCount ?? 0) * p.input + text * p.textOutput + image * p.imageOutput) / 1_000_000;
  return Number(cost.toFixed(6));
}

/** usageMetadata → field meta (output gồm cả thinking, để prompt + output = total). */
export function usageToMeta(modelId: string, usage: GeminiUsage | undefined): UsageMeta {
  const output =
    usage?.candidatesTokenCount === undefined && usage?.thoughtsTokenCount === undefined
      ? undefined
      : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return {
    promptTokens: usage?.promptTokenCount,
    outputTokens: output,
    totalTokens: usage?.totalTokenCount,
    costUsd: estimateImageCallCostUsd(modelId, usage),
  };
}

const add = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));

/** Cộng 2 lượt gọi (vd. ảnh chính + harmony pass) thành 1 bản ghi chi phí. */
export function sumUsageMeta(a: UsageMeta, b: UsageMeta): UsageMeta {
  return {
    promptTokens: add(a.promptTokens, b.promptTokens),
    outputTokens: add(a.outputTokens, b.outputTokens),
    totalTokens: add(a.totalTokens, b.totalTokens),
    costUsd: Number((a.costUsd + b.costUsd).toFixed(6)),
  };
}
