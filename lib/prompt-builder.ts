import type {
  GenerationRequest,
  StyleControls,
  UploadedAsset,
} from "@/lib/types";

const SECTION = {
  system: "=== SYSTEM ===",
  context: "=== CONTEXT ===",
  creative: "=== CREATIVE DIRECTION ===",
  user: "=== USER BRIEF ===",
  output: "=== OUTPUT PRIORITY ===",
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
    "Uploaded item integrity (strict):",
    "- Treat uploaded product/object/logo items as locked content.",
    "- Do not replace, redraw, heavily transform, or invent a different item.",
    "- Allowed creativity is mainly in background design, lighting, texture, effects, composition framing, and supporting graphic elements.",
    "- You may apply subtle global color grading so the locked items blend naturally, but keep their identity and key details intact.",
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
      "style-reference": [],
    };
    for (const a of assets) {
      (byRole[a.role] ??= []).push(a);
    }
    const order: UploadedAsset["role"][] = [
      "logo",
      "image",
      "background",
      "decoration",
      "style-reference",
    ];
    for (const role of order) {
      const list = byRole[role];
      if (!list?.length) continue;
      lines.push(`Role: ${role}`);
      if (role === "style-reference") {
        lines.push(
          "- CRITICAL: Treat these as style anchors. Reuse their color logic, graphic element system, texture/noise character, and overall art direction."
        );
        lines.push(
          "- Do not clone exact text, logo, brand identity, or copyrighted composition."
        );
      }
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

const FONT_STYLE_PHRASES: Record<StyleControls["fontStyle"], string> = {
  sans:
    "Typography direction: clean sans-serif family, high legibility, balanced spacing.",
  serif:
    "Typography direction: elegant serif headlines with careful contrast and readability.",
  display:
    "Typography direction: expressive display headline style for strong visual impact.",
  handwritten:
    "Typography direction: handwritten-inspired style, still clear and readable for key text.",
  modern:
    "Typography direction: modern geometric sans style, crisp and contemporary.",
};

const BG_TONE_LABELS: Record<StyleControls["backgroundConfig"]["tones"][number], string> = {
  "warm-sunset": "Warm Sunset",
  "ocean-breeze": "Ocean Breeze",
  "deep-twilight": "Deep Twilight",
  "pastel-dream": "Pastel Dream",
  "nordic-forest": "Nordic Forest",
  "desert-sand": "Desert Sand",
  "volcanic-ash": "Volcanic Ash",
  "spring-blossom": "Spring Blossom",
  "cyberpunk-neon": "Cyberpunk Neon",
  "midnight-luxury": "Midnight Luxury",
  "industrial-grey": "Industrial Grey",
  "synthwave-night": "Synthwave Night",
  "lavender-haze": "Lavender Haze",
  "vintage-film": "Vintage Film",
  "monochrome-mist": "Monochrome Mist",
  "ethereal-glow": "Ethereal Glow",
};
const BG_GRAIN_LABELS: Record<StyleControls["backgroundConfig"]["grains"][number], string> = {
  "subtle-grain": "Subtle Grain",
  "classic-film": "Classic Film",
  "heavy-retro": "Heavy Retro",
};
const BG_SHAPE_LABELS: Record<StyleControls["backgroundConfig"]["shapes"][number], string> = {
  "blurry-organic": "Blurry Organic",
  "abstract-blobs": "Abstract Blobs",
  "liquid-flow": "Liquid Flow",
  "central-glow": "Central Glow",
};
const BG_EFFECT_LABELS: Record<StyleControls["backgroundConfig"]["effects"][number], string> = {
  minimalist: "Minimalist",
  "dreamy-ethereal": "Dreamy/Ethereal",
  "lofi-vintage": "Lo-fi Vintage",
  "high-contrast": "High-Contrast",
};

/**
 * Maps style controls to compact visual-descriptor phrases for the creative layer.
 */
export function buildStylePhrase(controls: StyleControls): string {
  const parts = [
    `Overall style (${controls.style}): ${STYLE_PHRASES[controls.style]}.`,
    `Mood (${controls.mood}): ${MOOD_PHRASES[controls.mood]}.`,
    `Color treatment (${controls.colorPalette}): ${PALETTE_PHRASES[controls.colorPalette]}`,
    FONT_STYLE_PHRASES[controls.fontStyle],
  ];
  const bgParts: string[] = [];
  if (controls.backgroundConfig.tones.length > 0) {
    bgParts.push(
      `Background tone options: ${controls.backgroundConfig.tones.map((x) => BG_TONE_LABELS[x]).join(", ")}.`
    );
  }
  if (controls.backgroundConfig.grains.length > 0) {
    bgParts.push(
      `Background grain options: ${controls.backgroundConfig.grains.map((x) => BG_GRAIN_LABELS[x]).join(", ")}.`
    );
  }
  if (controls.backgroundConfig.shapes.length > 0) {
    bgParts.push(
      `Background shape options: ${controls.backgroundConfig.shapes.map((x) => BG_SHAPE_LABELS[x]).join(", ")}.`
    );
  }
  if (controls.backgroundConfig.effects.length > 0) {
    bgParts.push(
      `Background effect options: ${controls.backgroundConfig.effects.map((x) => BG_EFFECT_LABELS[x]).join(", ")}.`
    );
  }
  if (bgParts.length > 0) {
    parts.push(`Preselected background checklist: ${bgParts.join(" ")}`);
  }
  return parts.join(" ");
}

export function buildOutputPriorityDirective(): string {
  return [
    "Generate one final banner only (no alternatives).",
    "Prioritize visual originality, strong concept, and premium finish quality.",
    "Preserve uploaded items with minimal alteration; add creativity mostly through background/effects.",
    "Keep composition coherent and production-ready for direct use.",
  ].join(" ");
}

/**
 * Assembles layers into one prompt string for Gemini (or similar multimodal APIs).
 * Order: system → context → style → user brief → output priority.
 */
export function assembleFullPrompt(request: GenerationRequest): string {
  const strictPreserveInstruction = request.styleControls.strictPreserveMode
    ? "STRICT PRESERVE MODE: Keep uploaded product/logo/object assets nearly unchanged. Only allow subtle integration edits (global tone match, edge cleanup, shadow harmonization). Do not redesign or reshape uploaded subjects."
    : "Balanced preserve mode: keep uploaded assets recognizable while allowing moderate blending and stylistic adaptation.";
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
    strictPreserveInstruction,
    "",
    SECTION.output,
    buildOutputPriorityDirective(),
  ];
  return blocks.join("\n").trim();
}
