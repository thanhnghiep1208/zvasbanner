export interface CanvasConfig {
  width: number;
  height: number;
  platform: string;
  name: string;
}

export interface UploadedAsset {
  id: string;
  url: string;
  role: "logo" | "image" | "background";
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
