import type { CanvasConfig } from "@/lib/types";

export interface CanvasPresetOption {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Shown as `CanvasConfig.platform` for presets */
  category: string;
}

export interface CanvasPresetGroup {
  label: string;
  presets: CanvasPresetOption[];
}

export const CUSTOM_PRESET_ID = "custom" as const;

export const CANVAS_PRESET_GROUPS: CanvasPresetGroup[] = [
  {
    label: "Social Media",
    presets: [
      {
        id: "social-facebook-ad",
        name: "Facebook Ad",
        width: 1200,
        height: 628,
        category: "Social Media",
      },
      {
        id: "social-instagram-post",
        name: "Instagram Post",
        width: 1080,
        height: 1080,
        category: "Social Media",
      },
      {
        id: "social-instagram-story",
        name: "Instagram Story",
        width: 1080,
        height: 1920,
        category: "Social Media",
      },
      {
        id: "social-twitter-header",
        name: "Twitter/X Header",
        width: 1500,
        height: 500,
        category: "Social Media",
      },
      {
        id: "social-linkedin-cover",
        name: "LinkedIn Cover",
        width: 1584,
        height: 396,
        category: "Social Media",
      },
    ],
  },
  {
    label: "Google Ads",
    presets: [
      {
        id: "ads-leaderboard",
        name: "Leaderboard",
        width: 728,
        height: 90,
        category: "Google Ads",
      },
      {
        id: "ads-medium-rectangle",
        name: "Medium Rectangle",
        width: 300,
        height: 250,
        category: "Google Ads",
      },
      {
        id: "ads-wide-skyscraper",
        name: "Wide Skyscraper",
        width: 160,
        height: 600,
        category: "Google Ads",
      },
      {
        id: "ads-large-rectangle",
        name: "Large Rectangle",
        width: 336,
        height: 280,
        category: "Google Ads",
      },
    ],
  },
  {
    label: "Other",
    presets: [
      {
        id: "other-youtube-thumbnail",
        name: "YouTube Thumbnail",
        width: 1280,
        height: 720,
        category: "Other",
      },
      {
        id: "other-email-header",
        name: "Email Header",
        width: 600,
        height: 200,
        category: "Other",
      },
    ],
  },
];

export function getAllPresets(): CanvasPresetOption[] {
  return CANVAS_PRESET_GROUPS.flatMap((g) => g.presets);
}

export function getPresetById(id: string): CanvasPresetOption | undefined {
  return getAllPresets().find((p) => p.id === id);
}

export function presetToCanvasConfig(preset: CanvasPresetOption): CanvasConfig {
  return {
    width: preset.width,
    height: preset.height,
    platform: preset.category,
    name: preset.name,
  };
}

export function isCustomCanvasConfig(config: CanvasConfig): boolean {
  return config.platform === "Custom" && config.name === "Custom";
}

/** Resolves which select value matches the current store config. */
export function configToPresetId(config: CanvasConfig): string {
  if (isCustomCanvasConfig(config)) {
    return CUSTOM_PRESET_ID;
  }
  const match = getAllPresets().find(
    (p) =>
      p.width === config.width &&
      p.height === config.height &&
      p.name === config.name &&
      p.category === config.platform
  );
  return match?.id ?? CUSTOM_PRESET_ID;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function aspectRatioParts(width: number, height: number): {
  label: string;
  decimal: string;
} {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { label: "—", decimal: "—" };
  }
  const g = gcd(width, height);
  const rw = Math.round(width / g);
  const rh = Math.round(height / g);
  const dec = width / height;
  const decimal =
    dec >= 10 ? dec.toFixed(2) : dec >= 1 ? dec.toFixed(3) : dec.toFixed(4);
  return { label: `${rw}:${rh}`, decimal };
}
