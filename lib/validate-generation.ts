import type {
  AssetRole,
  BackgroundEffectOption,
  BackgroundGrainOption,
  BackgroundShapeOption,
  BackgroundToneOption,
  BrandKit,
  CanvasConfig,
  GenerationRequest,
  StyleControls,
  UploadedAsset,
} from "@/lib/types";

const ASSET_ROLES: AssetRole[] = [
  "logo",
  "image",
  "background",
  "decoration",
  "style-reference",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseCanvasConfig(v: unknown): CanvasConfig | null {
  if (!isRecord(v)) return null;
  const { width, height, platform, name } = v;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof platform !== "string" ||
    typeof name !== "string" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  return { width, height, platform, name };
}

export function parseUploadedAsset(v: unknown): UploadedAsset | null {
  if (!isRecord(v)) return null;
  const { id, url, fileName, role, hasAlpha, originalDims, dataUrl } = v;
  if (
    typeof id !== "string" ||
    typeof url !== "string" ||
    typeof fileName !== "string" ||
    typeof role !== "string" ||
    typeof hasAlpha !== "boolean" ||
    !isRecord(originalDims)
  ) {
    return null;
  }
  if (!ASSET_ROLES.includes(role as AssetRole)) return null;
  const w = originalDims.width;
  const h = originalDims.height;
  if (typeof w !== "number" || typeof h !== "number") return null;
  if (dataUrl !== undefined && typeof dataUrl !== "string") return null;
  return {
    id,
    url,
    dataUrl,
    fileName,
    role: role as AssetRole,
    hasAlpha,
    originalDims: { width: w, height: h },
  };
}

export function parseBrandKit(v: unknown): BrandKit | null {
  if (!isRecord(v)) return null;
  const { colors, fontPreference, logoPosition } = v;
  if (!Array.isArray(colors) || !colors.every((c) => typeof c === "string")) {
    return null;
  }
  const out: BrandKit = { colors };
  if (typeof fontPreference === "string") out.fontPreference = fontPreference;
  if (typeof logoPosition === "string") out.logoPosition = logoPosition;
  return out;
}

const STYLES: StyleControls["style"][] = [
  "minimalist",
  "bold",
  "luxury",
  "playful",
  "corporate",
];
const MOODS: StyleControls["mood"][] = [
  "energetic",
  "calm",
  "festive",
  "professional",
];
const PALETTES: StyleControls["colorPalette"][] = [
  "brand",
  "auto",
  "monochrome",
  "warm",
  "cool",
];
const FONT_STYLES: StyleControls["fontStyle"][] = [
  "sans",
  "serif",
  "display",
  "handwritten",
  "modern",
];
const BACKGROUND_TONES: BackgroundToneOption[] = [
  "warm-sunset",
  "ocean-breeze",
  "deep-twilight",
  "pastel-dream",
  "nordic-forest",
  "desert-sand",
  "volcanic-ash",
  "spring-blossom",
  "cyberpunk-neon",
  "midnight-luxury",
  "industrial-grey",
  "synthwave-night",
  "lavender-haze",
  "vintage-film",
  "monochrome-mist",
  "ethereal-glow",
];
const BACKGROUND_GRAINS: BackgroundGrainOption[] = [
  "subtle-grain",
  "classic-film",
  "heavy-retro",
];
const BACKGROUND_SHAPES: BackgroundShapeOption[] = [
  "blurry-organic",
  "abstract-blobs",
  "liquid-flow",
  "central-glow",
];
const BACKGROUND_EFFECTS: BackgroundEffectOption[] = [
  "minimalist",
  "dreamy-ethereal",
  "lofi-vintage",
  "high-contrast",
];

export function parseStyleControls(v: unknown): StyleControls | null {
  if (!isRecord(v)) return null;
  const { style, mood, colorPalette, fontStyle, strictPreserveMode, backgroundConfig } = v;
  if (
    typeof style !== "string" ||
    typeof mood !== "string" ||
    typeof colorPalette !== "string" ||
    typeof fontStyle !== "string" ||
    (strictPreserveMode !== undefined && typeof strictPreserveMode !== "boolean") ||
    !isRecord(backgroundConfig)
  ) {
    return null;
  }
  if (!STYLES.includes(style as StyleControls["style"])) return null;
  if (!MOODS.includes(mood as StyleControls["mood"])) return null;
  if (!PALETTES.includes(colorPalette as StyleControls["colorPalette"]))
    return null;
  if (!FONT_STYLES.includes(fontStyle as StyleControls["fontStyle"]))
    return null;
  const tones = backgroundConfig.tones;
  const grains = backgroundConfig.grains;
  const shapes = backgroundConfig.shapes;
  const effects = backgroundConfig.effects;
  if (!Array.isArray(tones) || !tones.every((x) => BACKGROUND_TONES.includes(x as BackgroundToneOption))) return null;
  if (!Array.isArray(grains) || !grains.every((x) => BACKGROUND_GRAINS.includes(x as BackgroundGrainOption))) return null;
  if (!Array.isArray(shapes) || !shapes.every((x) => BACKGROUND_SHAPES.includes(x as BackgroundShapeOption))) return null;
  if (!Array.isArray(effects) || !effects.every((x) => BACKGROUND_EFFECTS.includes(x as BackgroundEffectOption))) return null;
  return {
    style: style as StyleControls["style"],
    mood: mood as StyleControls["mood"],
    colorPalette: colorPalette as StyleControls["colorPalette"],
    fontStyle: fontStyle as StyleControls["fontStyle"],
    strictPreserveMode: strictPreserveMode ?? true,
    backgroundConfig: {
      tones: tones as BackgroundToneOption[],
      grains: grains as BackgroundGrainOption[],
      shapes: shapes as BackgroundShapeOption[],
      effects: effects as BackgroundEffectOption[],
    },
  };
}

export function parseGenerationRequest(v: unknown): GenerationRequest | null {
  if (!isRecord(v)) return null;
  const canvasConfig = parseCanvasConfig(v.canvasConfig);
  const brandKit = parseBrandKit(v.brandKit);
  const styleControls = parseStyleControls(v.styleControls);
  const userPrompt = v.userPrompt;
  if (!canvasConfig || !brandKit || !styleControls) return null;
  if (typeof userPrompt !== "string") return null;
  if (!Array.isArray(v.assets)) return null;
  const assets: UploadedAsset[] = [];
  for (const item of v.assets) {
    const a = parseUploadedAsset(item);
    if (!a) return null;
    assets.push(a);
  }
  return {
    canvasConfig,
    assets,
    brandKit,
    userPrompt,
    styleControls,
  };
}

export type ParsedGenerateBody = {
  request: GenerationRequest;
};

/**
 * Same fields as GenerationRequest, plus optional single-slot regeneration.
 */
export function parseGenerateApiBody(v: unknown): ParsedGenerateBody | null {
  const request = parseGenerationRequest(v);
  if (!request) return null;
  return { request };
}

export type EnhancePromptBody = {
  userPrompt: string;
  canvasConfig: CanvasConfig;
  assets: UploadedAsset[];
};

export function parseEnhancePromptBody(v: unknown): EnhancePromptBody | null {
  if (!isRecord(v)) return null;
  const userPrompt = v.userPrompt;
  const canvasConfig = parseCanvasConfig(v.canvasConfig);
  if (typeof userPrompt !== "string" || !canvasConfig) return null;
  if (!Array.isArray(v.assets)) return null;
  const assets: UploadedAsset[] = [];
  for (const item of v.assets) {
    const a = parseUploadedAsset(item);
    if (!a) return null;
    assets.push(a);
  }
  return { userPrompt, canvasConfig, assets };
}
