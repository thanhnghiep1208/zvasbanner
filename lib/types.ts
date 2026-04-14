export interface CanvasConfig {
  width: number;
  height: number;
  platform: string;
  name: string;
}

export type AssetRole =
  | "logo"
  | "image"
  | "background"
  | "decoration"
  | "style-reference";

export const ASSET_ROLE_OPTIONS: { value: AssetRole; label: string }[] = [
  { value: "logo", label: "Logo" },
  { value: "image", label: "Ảnh sản phẩm" },
  { value: "background", label: "Nền ảnh" },
  { value: "decoration", label: "Trang trí" },
  { value: "style-reference", label: "Banner tham chiếu style" },
];

export interface UploadedAsset {
  id: string;
  url: string;
  /** Optional in-memory data URL for server-side multimodal generation. */
  dataUrl?: string;
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

export type BackgroundToneOption =
  | "warm-sunset"
  | "ocean-breeze"
  | "deep-twilight"
  | "pastel-dream"
  | "nordic-forest"
  | "desert-sand"
  | "volcanic-ash"
  | "spring-blossom"
  | "cyberpunk-neon"
  | "midnight-luxury"
  | "industrial-grey"
  | "synthwave-night"
  | "lavender-haze"
  | "vintage-film"
  | "monochrome-mist"
  | "ethereal-glow";

export type BackgroundGrainOption =
  | "subtle-grain"
  | "classic-film"
  | "heavy-retro";

export type BackgroundShapeOption =
  | "blurry-organic"
  | "abstract-blobs"
  | "liquid-flow"
  | "central-glow";

export type BackgroundEffectOption =
  | "minimalist"
  | "dreamy-ethereal"
  | "lofi-vintage"
  | "high-contrast";

export interface BackgroundConfig {
  tones: BackgroundToneOption[];
  grains: BackgroundGrainOption[];
  shapes: BackgroundShapeOption[];
  effects: BackgroundEffectOption[];
}

export interface StyleControls {
  style: "minimalist" | "bold" | "luxury" | "playful" | "corporate";
  mood: "energetic" | "calm" | "festive" | "professional";
  colorPalette: "brand" | "auto" | "monochrome" | "warm" | "cool";
  fontStyle: "sans" | "serif" | "display" | "handwritten" | "modern";
  strictPreserveMode: boolean;
  backgroundConfig: BackgroundConfig;
}

export interface GenerationRequest {
  canvasConfig: CanvasConfig;
  assets: UploadedAsset[];
  brandKit: BrandKit;
  userPrompt: string;
  styleControls: StyleControls;
}
