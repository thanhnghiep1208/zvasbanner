import type {
  AssetRole,
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
  const { id, url, fileName, role, hasAlpha, originalDims } = v;
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
  return {
    id,
    url,
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

export function parseStyleControls(v: unknown): StyleControls | null {
  if (!isRecord(v)) return null;
  const { style, mood, colorPalette } = v;
  if (
    typeof style !== "string" ||
    typeof mood !== "string" ||
    typeof colorPalette !== "string"
  ) {
    return null;
  }
  if (!STYLES.includes(style as StyleControls["style"])) return null;
  if (!MOODS.includes(mood as StyleControls["mood"])) return null;
  if (!PALETTES.includes(colorPalette as StyleControls["colorPalette"]))
    return null;
  return {
    style: style as StyleControls["style"],
    mood: mood as StyleControls["mood"],
    colorPalette: colorPalette as StyleControls["colorPalette"],
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
  regenerateVariationIndex?: 0 | 1 | 2;
  existingVariations?: [string, string, string];
};

/**
 * Same fields as GenerationRequest, plus optional single-slot regeneration.
 */
export function parseGenerateApiBody(v: unknown): ParsedGenerateBody | null {
  const request = parseGenerationRequest(v);
  if (!request || !isRecord(v)) return null;

  const rawIdx = v.regenerateVariationIndex;
  if (rawIdx === undefined) {
    return { request };
  }
  if (rawIdx !== 0 && rawIdx !== 1 && rawIdx !== 2) return null;

  const ex = v.existingVariations;
  if (!Array.isArray(ex) || ex.length !== 3) return null;
  if (!ex.every((item): item is string => typeof item === "string")) {
    return null;
  }
  return {
    request,
    regenerateVariationIndex: rawIdx,
    existingVariations: [ex[0], ex[1], ex[2]],
  };
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
