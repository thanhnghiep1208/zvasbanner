import type {
  CampaignIntent,
  FocalSubject,
  GenerationRequest,
  MarketingBrief,
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
 * Layer 2 — Structured context: canvas, assets (by role with URLs), brand kit, and industry context.
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

const INTENT_PHRASES: Record<CampaignIntent, string> = {
  "flash-sale":
    "Urgency-forward composition: bold discount callout prominent, high-contrast warm accent color, time-pressure visual energy, eye-catching over refined.",
  "product-launch":
    "Premium reveal aesthetic: hero product dominant and well-lit, clean aspirational atmosphere, sense of unveiling something new.",
  "brand-awareness":
    "Brand storytelling over hard sell: emotional resonance, narrative composition, visual cohesion with brand identity takes priority.",
  "event":
    "Celebratory atmosphere: festive warmth, seasonal or occasion-relevant motifs used sparingly, inviting and energetic feel.",
};

const FOCAL_PHRASES: Record<FocalSubject, string> = {
  "product":
    "Product must be the dominant subject: 55–70% of frame area, hero-lit from front-top, clean visual separation from background, no competing focal points.",
  "person":
    "Human figure or face is the primary focal point: expression or gesture leads the eye, product/environment plays supporting role.",
  "text":
    "Typography-first layout: headline text is the visual hero, imagery and graphics exist to frame and support the message, not compete with it.",
  "scene":
    "Atmospheric scene composition: wide establishing shot, product or subject integrated into environment, mood and setting carry the story.",
};


/**
 * Maps style controls to compact visual-descriptor phrases for the creative layer.
 */
export function buildStylePhrase(controls: StyleControls, brief?: MarketingBrief): string {
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

  const intents = brief?.campaignIntents ?? [];
  if (intents.length > 0) {
    parts.push(`Campaign intent: ${intents.map((i) => INTENT_PHRASES[i]).join(" + ")}`);
  }

  const focals = brief?.focalSubjects ?? [];
  if (focals.length > 0) {
    parts.push(`Focal subject: ${focals.map((f) => FOCAL_PHRASES[f]).join(", ")}`);
  }

  return parts.join(" ");
}

/**
 * Visual cohesion directives for composited banners (lighting, edges, depth).
 */
export function buildCohesionInstructions(): string {
  return [
    "VISUAL COHESION & DEPTH REQUIREMENTS:",
    "- Establish a single dominant light source direction (e.g. top-left at 45°); all elements must cast shadows and receive highlights consistent with this source — no element should look lit from a different angle than the background.",
    "- At every point where an element contacts or overlaps the background, add a soft ambient occlusion shadow (feathered 8–16px, opacity 20–35%) so the element feels grounded, not floating.",
    "- Apply a unified color grade across the entire canvas: same color temperature (warm/cool), same hue tint, same contrast curve — no element should have a noticeably different white balance than its surroundings.",
    "- Blend element edges into the background using soft feathering (no hard pixel-perfect cutouts); if an element has a transparent background, its edge should pick up subtle reflected color from the background behind it.",
    "- Add micro-depth cues: foreground elements slightly larger/sharper, background elements slightly desaturated and softer (depth of field falloff).",
    "- Ensure ground plane consistency: any element resting on a surface must have a contact shadow beneath it; floating elements must have a drop shadow with correct perspective.",
    "- Global atmosphere: apply a subtle unified vignette or atmospheric haze so the entire composition reads as one scene, not a collage.",
  ].join("\n");
}

export function buildOutputPriorityDirective(): string {
  return [
    "Generate one final banner only (no alternatives).",
    "Prioritize visual originality, strong concept, and premium finish quality.",
    "Preserve uploaded items with minimal alteration; add creativity mostly through background/effects.",
    "Keep composition coherent and production-ready for direct use.",
  ].join(" ");
}

/** When adapting from an approved reference banner to a new canvas size. */
export function buildOutputPriorityDirectiveLayoutAdaptation(): string {
  return [
    "Generate one final banner only (no alternatives).",
    "Prioritize FAITHFULNESS to the reference banner over novelty: same campaign look, same hierarchy, same subject and text roles.",
    "CONTENT-PRESERVATION FIRST: avoid dropping key text blocks, CTA, logo, or hero subject; adapt layout before removing anything.",
    "Preserve uploaded reference assets with minimal alteration; the reference OUTPUT image defines the target composition—translate it, do not reinvent it.",
    "Keep composition production-ready for direct use at the exact requested pixel dimensions.",
  ].join(" ");
}

function buildLayoutAdaptationBlock(request: GenerationRequest): string {
  const { width, height, platform, name } = request.canvasConfig;
  const lockedCopyLines = request.userPrompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const m = line.match(/^(headline|subheadline|cta)\s*:\s*(.+)$/i);
      if (!m) return [];
      const label =
        m[1].toLowerCase() === "cta"
          ? "CTA"
          : m[1].toLowerCase() === "headline"
            ? "Headline"
            : "Subheadline";
      return [`- ${label}: ${m[2].trim()}`];
    });

  return [
    "=== LAYOUT ADAPTATION (REFERENCE BANNER) ===",
    "The next multimodal image part (in message order) is the REFERENCE OUTPUT: the user's approved banner at another size.",
    `Your output MUST be exactly ${width}×${height}px for platform/preset: ${platform} — ${name}.`,
    "",
    "Goals (strict):",
    "- Match the reference as closely as this new aspect ratio allows: same focal subject, same headline/CTA intent, same palette and graphic language.",
    "- Re-scale and reflow only as needed for fit; keep relative prominence of headline vs sub vs CTA.",
    "- Preserve ALL major content blocks from the reference (hero, headline, subheadline, CTA, logo). Do not omit them unless physically impossible.",
    "- If space is tight, compress spacing and line breaks first; do not delete key content.",
    "- Do NOT replace the hero product/object, invent a new theme, swap typography personality, or introduce unrelated motifs.",
    "- Do NOT remove or add major brand elements compared to the reference unless the new aspect ratio forces minor safe-zone padding only.",
    ...(lockedCopyLines.length
      ? [
          "",
          "TEXT LOCK (high priority, keep wording):",
          ...lockedCopyLines,
          "- Keep the above copy blocks intact; do not paraphrase or drop them except for minor line-break reflow.",
        ]
      : []),
    "",
    "Allowed adjustments:",
    "- Margins, safe-zone padding, line breaks, subtle background extension or tightening to fill the frame.",
    "- Minor typographic reflow for legibility at the new size.",
    "",
    "Forbidden:",
    "- A redesign that looks like a different ad or campaign.",
    "- New illustrations, new color schemes, or new layout structure unrelated to the reference.",
  ].join("\n");
}

/**
 * Assembles layers into one prompt string for Gemini (or similar multimodal APIs).
 * Order: system → context → style → user brief → output priority.
 */
export function assembleFullPrompt(request: GenerationRequest): string {
  const strictPreserveInstruction = request.styleControls.strictPreserveMode
    ? "STRICT PRESERVE MODE: Keep uploaded product/logo/object assets nearly unchanged. Only allow subtle integration edits (global tone match, edge cleanup, shadow harmonization). Do not redesign or reshape uploaded subjects."
    : "Balanced preserve mode: keep uploaded assets recognizable while allowing moderate blending and stylistic adaptation.";
  const adaptation = request.layoutAdaptationFromBanner
    ? buildLayoutAdaptationBlock(request)
    : null;
  const outputDirective = request.layoutAdaptationFromBanner
    ? buildOutputPriorityDirectiveLayoutAdaptation()
    : buildOutputPriorityDirective();
  const blocks = [
    SECTION.system,
    buildSystemPrompt(),
    "",
    SECTION.context,
    buildContextBlock(request),
    "",
    ...(adaptation ? [adaptation, ""] : []),
    SECTION.creative,
    buildStylePhrase(request.styleControls, request.marketingBrief),
    "",
    buildCohesionInstructions(),
    "",
    SECTION.user,
    request.userPrompt.trim() || "(No additional user text.)",
    "",
    strictPreserveInstruction,
    "",
    SECTION.output,
    outputDirective,
  ];
  return blocks.join("\n").trim();
}
