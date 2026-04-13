export interface CanvasConfig {
  width: number;
  height: number;
  platform: string;
  name: string;
}

export type AssetRole = "logo" | "image" | "background" | "decoration";

export const ASSET_ROLE_OPTIONS: { value: AssetRole; label: string }[] = [
  { value: "logo", label: "Logo" },
  { value: "image", label: "Product image" },
  { value: "background", label: "Background" },
  { value: "decoration", label: "Decoration" },
];

export interface UploadedAsset {
  id: string;
  url: string;
  /** Original file name for display */
  fileName: string;
  role: AssetRole;
  hasAlpha: boolean;
  originalDims: { width: number; height: number };
}

export interface BrandKit {
  colors: string[];
  fontPreference?: string;
  logoPosition?: string;
}

export interface StyleControls {
  style: "minimalist" | "bold" | "luxury" | "playful" | "corporate";
  mood: "energetic" | "calm" | "festive" | "professional";
  colorPalette: "brand" | "auto" | "monochrome" | "warm" | "cool";
}

export interface GenerationRequest {
  canvasConfig: CanvasConfig;
  assets: UploadedAsset[];
  brandKit: BrandKit;
  userPrompt: string;
  styleControls: StyleControls;
}
