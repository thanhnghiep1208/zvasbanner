import { describe, expect, it } from "vitest";

import { estimateImageCallCostUsd, sumUsageMeta, usageToMeta } from "@/lib/image-model-pricing";

describe("estimateImageCallCostUsd", () => {
  it("1K image output matches Google's per-image price", () => {
    // pricing page: 1120 token = $0.0336 (2.1), $0.134 (Pro).
    expect(estimateImageCallCostUsd("gemini-nano-banana-2.1", { candidatesTokenCount: 1120 })).toBeCloseTo(0.0336, 6);
    expect(estimateImageCallCostUsd("gemini-3-pro-image", { candidatesTokenCount: 1120 })).toBeCloseTo(0.1344, 6);
  });

  it("prices input, text output and thinking separately from image output", () => {
    const cost = estimateImageCallCostUsd("gemini-3-pro-image", {
      promptTokenCount: 1000,
      candidatesTokenCount: 1220,
      thoughtsTokenCount: 300,
      candidatesTokensDetails: [
        { modality: "IMAGE", tokenCount: 1120 },
        { modality: "TEXT", tokenCount: 100 },
      ],
    });
    // 1000×$2 + (100+300)×$12 + 1120×$120, per 1M
    expect(cost).toBeCloseTo((1000 * 2 + 400 * 12 + 1120 * 120) / 1e6, 6);
  });

  it("returns 0 without usage", () => {
    expect(estimateImageCallCostUsd("gemini-nano-banana-2.1", undefined)).toBe(0);
  });
});

describe("usageToMeta / sumUsageMeta", () => {
  it("output tokens include thinking and sum across calls", () => {
    const a = usageToMeta("gemini-nano-banana-2.1", {
      promptTokenCount: 500, candidatesTokenCount: 1120, thoughtsTokenCount: 80, totalTokenCount: 1700,
    });
    expect(a.outputTokens).toBe(1200);
    const total = sumUsageMeta(a, a);
    expect(total.totalTokens).toBe(3400);
    expect(total.costUsd).toBeCloseTo(a.costUsd * 2, 6);
  });
});
