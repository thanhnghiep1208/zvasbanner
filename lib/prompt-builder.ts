import type {
  GenerationRequest,
  StyleControls,
  UploadedAsset,
} from "@/lib/types";

/** Which of three composition variants to request from the model. */
export type VariationIndex = 0 | 1 | 2;

const SECTION = {
  system: "=== SYSTEM ===",
  context: "=== CONTEXT ===",
  creative: "=== CREATIVE DIRECTION ===",
  user: "=== USER BRIEF ===",
  variation: "=== VARIATION ===",
} as const;

/**
 * Layer 1 — Fixed system instructions for the image model.
 * Covers legibility, brand assets, layout safety, and policy.
 */
export function buildSystemPrompt(): string {
  return [
    "You are an expert marketing banner designer generating a single static image.",
    "",
    "Text & legibility:",
    "- All on-image text must be sharp, high contrast against its background, and large enough to read at a glance.",
    "- Avoid placing critical text on busy areas; keep headlines in clear negative space.",
    "- Do not use illegible, ultra-thin, or decorative fonts for primary messaging unless the user explicitly asks.",
    "",
    "Logos & brand marks:",
    "- When a logo asset is provided, preserve its proportions, colors, and clarity—do not distort, redraw, or crop essential marks.",
    "- Place logos in a clean, unobstructed area with sufficient padding.",
    "",
    "Layout & safe zones:",
    "- Respect platform-style safe margins (roughly 5–8% inset from each edge) so nothing important is clipped on social or ad placements.",
    "- Keep primary subject and headline inside this safe zone.",
    "",
    "Quality & honesty:",
    "- No watermarks, signatures, stock overlays, or fake UI chrome unless requested.",
    "- Do not add URLs, QR codes, or small print unless the user brief includes them.",
    "",
    "Content safety:",
    "- No hate, harassment, violence, explicit content, illegal activity, or misleading claims.",
    "- No impersonation of real people or brands beyond the user's supplied assets and brief.",
    "- Refuse or neutrally adapt requests that violate these rules while still producing a professional banner where possible.",
  ].join("\n");
}

function formatAssetLine(asset: UploadedAsset): string {
  const { role, url, fileName, originalDims, hasAlpha } = asset;
  const dims = `${originalDims.width}×${originalDims.height}px`;
  const alpha = hasAlpha ? " (alpha channel)" : "";
  return `- [${role}] ${fileName} — ${dims}${alpha}\n  URL: ${url}`;
}

/**
 * Layer 2 — Structured context: canvas, assets (by role with URLs), and brand kit.
 */
export function buildContextBlock(config: GenerationRequest): string {
  const { canvasConfig, assets, brandKit } = config;
  const lines: string[] = [];

  lines.push("Canvas");
  lines.push(
    `- Dimensions: ${canvasConfig.width}×${canvasConfig.height}px`,
    `- Platform / preset: ${canvasConfig.platform} — ${canvasConfig.name}`,
    ""
  );

  lines.push("Uploaded assets (use as reference; URLs are for your multimodal input pipeline)");
  if (assets.length === 0) {
    lines.push("- None supplied.");
  } else {
    const byRole: Record<string, UploadedAsset[]> = {
      logo: [],
      image: [],
      background: [],
      decoration: [],
    };
    for (const a of assets) {
      (byRole[a.role] ??= []).push(a);
    }
    const order: UploadedAsset["role"][] = [
      "logo",
      "image",
      "background",
      "decoration",
    ];
    for (const role of order) {
      const list = byRole[role];
      if (!list?.length) continue;
      lines.push(`Role: ${role}`);
      for (const asset of list) {
        lines.push(formatAssetLine(asset));
      }
      lines.push("");
    }
  }

  lines.push("Brand kit");
  if (brandKit.colors.length === 0) {
    lines.push("- Brand colors: (none specified)");
  } else {
    lines.push(
      `- Brand colors (hex or named): ${brandKit.colors.join(", ")}`
    );
  }
  if (brandKit.fontPreference) {
    lines.push(`- Font preference: ${brandKit.fontPreference}`);
  }
  if (brandKit.logoPosition) {
    lines.push(`- Preferred logo placement: ${brandKit.logoPosition}`);
  }

  return lines.join("\n").trim();
}

const STYLE_PHRASES: Record<StyleControls["style"], string> = {
  minimalist:
    "clean whitespace, restrained layout, single focal point",
  bold: "high contrast, strong typography, dynamic composition, saturated colors",
  luxury:
    "editorial feel, generous negative space, thin elegant serif fonts, refined palette",
  playful:
    "rounded shapes, bright colors, casual friendly type, dynamic angles",
  corporate:
    "trustworthy B2B aesthetic, structured grid, conservative color use, clear hierarchy",
};

const MOOD_PHRASES: Record<StyleControls["mood"], string> = {
  energetic:
    "diagonal composition, warm vibrant colors, sense of movement",
  calm: "horizontal balance, soft cool palette, ample breathing room",
  festive:
    "celebratory accents, seasonal warmth, inviting rhythm; use sparkle or confetti motifs only sparingly if at all",
  professional:
    "polished and credible, restrained embellishment, business-appropriate tone",
};

const PALETTE_PHRASES: Record<StyleControls["colorPalette"], string> = {
  brand:
    "Strict color discipline: use only the brand colors listed in the context block—do not introduce new primary hues.",
  auto: "Choose a harmonious palette that fits the brief; balance contrast for readability.",
  monochrome:
    "Single-hue or grayscale treatment with tonal steps only; avoid unrelated accent colors.",
  warm: "Warm-forward palette: ambers, corals, soft reds, and cream highlights.",
  cool: "Cool-forward palette: blues, teals, slate, and crisp whites.",
};

/**
 * Maps style controls to compact visual-descriptor phrases for the creative layer.
 */
export function buildStylePhrase(controls: StyleControls): string {
  const parts = [
    `Overall style (${controls.style}): ${STYLE_PHRASES[controls.style]}.`,
    `Mood (${controls.mood}): ${MOOD_PHRASES[controls.mood]}.`,
    `Color treatment (${controls.colorPalette}): ${PALETTE_PHRASES[controls.colorPalette]}`,
  ];
  return parts.join(" ");
}

const VARIATION_DIRECTIVES: Record<VariationIndex, string> = {
  0: "Composition: centered symmetrical layout, text stacked vertically center",
  1: "Composition: subject left third, text right two-thirds, diagonal visual flow",
  2: "Composition: typography-led, large headline dominates, minimal imagery",
};

/**
 * Per-variation composition instructions (three distinct layouts).
 */
export function buildVariationDirective(variationIndex: VariationIndex): string {
  return VARIATION_DIRECTIVES[variationIndex];
}

/**
 * Assembles Layers 1–5 into one prompt string for Gemini (or similar multimodal APIs).
 * Order: system → context → style → user brief → variation directive.
 */
export function assembleFullPrompt(
  request: GenerationRequest,
  variationIndex: VariationIndex
): string {
  const blocks = [
    SECTION.system,
    buildSystemPrompt(),
    "",
    SECTION.context,
    buildContextBlock(request),
    "",
    SECTION.creative,
    buildStylePhrase(request.styleControls),
    "",
    SECTION.user,
    request.userPrompt.trim() || "(No additional user text.)",
    "",
    SECTION.variation,
    buildVariationDirective(variationIndex),
  ];
  return blocks.join("\n").trim();
}
