/*
 * tsc --noEmit: (no errors in this file)
 */

import { create } from "zustand";

import { presetToCanvasConfig, getPresetById } from "@/lib/canvas-presets";
import type {
  AssetRole,
  BrandKit,
  CanvasConfig,
  StyleControls,
  UploadedAsset,
} from "@/lib/types";

const defaultStyleControls: StyleControls = {
  style: "minimalist",
  mood: "professional",
  colorPalette: "auto",
  fontStyle: "modern",
  strictPreserveMode: true,
  backgroundConfig: {
    tones: [],
    grains: [],
    shapes: [],
    effects: [],
  },
};

const defaultBrandKit: BrandKit = { colors: [] };

const defaultPreset = getPresetById("social-zalo-oa-img");
const defaultCanvas: CanvasConfig = defaultPreset
  ? presetToCanvasConfig(defaultPreset)
  : {
      width: 1075,
      height: 645,
      platform: "Social Media",
      name: "Zalo OA Img",
    };

export type VariationProgressStatus =
  | "pending"
  | "running"
  | "done"
  | "fallback"
  | "error";

export interface GenerationProgress {
  percent: number;
  status: VariationProgressStatus;
}

export interface GenerationStats {
  model: string;
  elapsedMs: number;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface EditorState {
  canvasConfig: CanvasConfig;
  setCanvasConfig: (
    config: CanvasConfig | ((prev: CanvasConfig) => CanvasConfig)
  ) => void;
  assets: UploadedAsset[];
  addAsset: (asset: UploadedAsset) => void;
  removeAsset: (id: string) => void;
  updateAssetRole: (id: string, role: AssetRole) => void;
  userPrompt: string;
  setUserPrompt: (value: string) => void;
  headline: string;
  setHeadline: (value: string) => void;
  subheadline: string;
  setSubheadline: (value: string) => void;
  ctaText: string;
  setCtaText: (value: string) => void;
  styleControls: StyleControls;
  setStyleControls: (partial: Partial<StyleControls>) => void;
  brandKit: BrandKit;
  setBrandKit: (partial: Partial<BrandKit> | BrandKit) => void;
  /** Last generated image URL / data URL (single result mode). */
  generatedImage: string | null;
  setGeneratedImage: (url: string | null) => void;
  currentBannerId: string | null;
  setCurrentBannerId: (value: string | null) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  /** Set when POST /api/generate fails (full run); cleared on success or retry. */
  generationError: string | null;
  setGenerationError: (value: string | null) => void;
  generationProgress: GenerationProgress;
  setGenerationProgress: (progress: GenerationProgress) => void;
  resetGenerationProgress: () => void;
  generationStats: GenerationStats | null;
  setGenerationStats: (stats: GenerationStats | null) => void;
}

const defaultGenerationProgress: GenerationProgress = {
  percent: 0,
  status: "pending",
};

export const useEditorStore = create<EditorState>((set) => ({
  canvasConfig: defaultCanvas,
  setCanvasConfig: (updater) =>
    set((s) => ({
      canvasConfig:
        typeof updater === "function" ? updater(s.canvasConfig) : updater,
    })),
  assets: [],
  addAsset: (asset) =>
    set((s) => ({ assets: [...s.assets, asset] })),
  removeAsset: (id) =>
    set((s) => {
      const target = s.assets.find((a) => a.id === id);
      if (target?.url.startsWith("blob:")) {
        URL.revokeObjectURL(target.url);
      }
      return { assets: s.assets.filter((a) => a.id !== id) };
    }),
  updateAssetRole: (id, role) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, role } : a)),
    })),
  userPrompt: "",
  setUserPrompt: (value) => set({ userPrompt: value }),
  headline: "",
  setHeadline: (value) => set({ headline: value }),
  subheadline: "",
  setSubheadline: (value) => set({ subheadline: value }),
  ctaText: "",
  setCtaText: (value) => set({ ctaText: value }),
  styleControls: defaultStyleControls,
  setStyleControls: (partial) =>
    set((s) => ({
      styleControls: { ...s.styleControls, ...partial },
    })),
  brandKit: defaultBrandKit,
  setBrandKit: (partial) =>
    set((s) => ({
      brandKit: { ...s.brandKit, ...partial },
    })),
  generatedImage: null,
  setGeneratedImage: (url) => set({ generatedImage: url }),
  currentBannerId: null,
  setCurrentBannerId: (value) => set({ currentBannerId: value }),
  isGenerating: false,
  setIsGenerating: (value) => set({ isGenerating: value }),
  generationError: null,
  setGenerationError: (value) => set({ generationError: value }),
  generationProgress: defaultGenerationProgress,
  setGenerationProgress: (progress) => set({ generationProgress: progress }),
  resetGenerationProgress: () =>
    set({ generationProgress: defaultGenerationProgress }),
  generationStats: null,
  setGenerationStats: (stats) => set({ generationStats: stats }),
}));
