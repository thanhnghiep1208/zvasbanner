import type { StyleControls } from "@/lib/types";

export const STYLE_OPTIONS: {
  value: StyleControls["style"];
  label: string;
}[] = [
  { value: "minimalist", label: "Minimalist" },
  { value: "bold", label: "Bold" },
  { value: "luxury", label: "Luxury" },
  { value: "playful", label: "Playful" },
  { value: "corporate", label: "Corporate" },
];

export const MOOD_OPTIONS: {
  value: StyleControls["mood"];
  label: string;
}[] = [
  { value: "energetic", label: "Energetic" },
  { value: "calm", label: "Calm" },
  { value: "festive", label: "Festive" },
  { value: "professional", label: "Professional" },
];

export const PALETTE_OPTIONS: {
  value: StyleControls["colorPalette"];
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "brand", label: "Brand colors" },
  { value: "monochrome", label: "Monochrome" },
  { value: "warm", label: "Warm tones" },
  { value: "cool", label: "Cool tones" },
];

export const STYLE_SELECT_ITEMS = Object.fromEntries(
  STYLE_OPTIONS.map((o) => [o.value, o.label])
);
export const MOOD_SELECT_ITEMS = Object.fromEntries(
  MOOD_OPTIONS.map((o) => [o.value, o.label])
);
export const PALETTE_SELECT_ITEMS = Object.fromEntries(
  PALETTE_OPTIONS.map((o) => [o.value, o.label])
);
