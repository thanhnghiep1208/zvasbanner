import type { StyleControls } from "@/lib/types";

export const STYLE_OPTIONS: {
  value: StyleControls["style"];
  label: string;
}[] = [
  { value: "minimalist", label: "Tối giản" },
  { value: "bold", label: "Nổi bật" },
  { value: "luxury", label: "Sang trọng" },
  { value: "playful", label: "Vui tươi" },
  { value: "corporate", label: "Doanh nghiệp" },
];

export const MOOD_OPTIONS: {
  value: StyleControls["mood"];
  label: string;
}[] = [
  { value: "energetic", label: "Năng động" },
  { value: "calm", label: "Nhẹ nhàng" },
  { value: "festive", label: "Lễ hội" },
  { value: "professional", label: "Chuyên nghiệp" },
];

export const PALETTE_OPTIONS: {
  value: StyleControls["colorPalette"];
  label: string;
}[] = [
  { value: "auto", label: "Tự động" },
  { value: "brand", label: "Màu thương hiệu" },
  { value: "monochrome", label: "Đơn sắc" },
  { value: "warm", label: "Tông ấm" },
  { value: "cool", label: "Tông lạnh" },
];

export const FONT_STYLE_OPTIONS: {
  value: StyleControls["fontStyle"];
  label: string;
}[] = [
  { value: "sans", label: "Sans (không chân)" },
  { value: "serif", label: "Serif (có chân)" },
  { value: "display", label: "Display (tiêu đề)" },
  { value: "handwritten", label: "Viết tay" },
  { value: "modern", label: "Hiện đại" },
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
export const FONT_STYLE_SELECT_ITEMS = Object.fromEntries(
  FONT_STYLE_OPTIONS.map((o) => [o.value, o.label])
);
