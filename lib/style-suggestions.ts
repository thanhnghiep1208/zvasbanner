import type { CampaignIntent, StyleControls } from "@/lib/types";

const INTENT_SUGGESTIONS: Record<
  CampaignIntent,
  Partial<Pick<StyleControls, "mood" | "style">>
> = {
  "flash-sale":      { mood: "energetic", style: "bold" },
  "product-launch":  { mood: "professional", style: "luxury" },
  "brand-awareness": { mood: "calm", style: "minimalist" },
  "event":           { mood: "festive", style: "playful" },
};

export function getStyleSuggestions(
  intents: CampaignIntent[]
): Partial<Pick<StyleControls, "mood" | "style">> {
  if (!intents.length) return {};
  return INTENT_SUGGESTIONS[intents[0]] ?? {};
}
