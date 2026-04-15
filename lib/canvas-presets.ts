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
    label: "Presets",
    presets: [
      {
        id: "social-zalo-oa-img",
        name: "Zalo OA Img",
        width: 1075,
        height: 645,
        category: "Social Media",
      },
      {
        id: "mp3-home",
        name: "MP3 Home",
        width: 1071,
        height: 357,
        category: "Social Media",
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
