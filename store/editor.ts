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
};

const defaultBrandKit: BrandKit = { colors: [] };

const defaultPreset = getPresetById("social-facebook-ad");
const defaultCanvas: CanvasConfig = defaultPreset
  ? presetToCanvasConfig(defaultPreset)
  : {
      width: 1200,
      height: 628,
      platform: "Social Media",
      name: "Facebook Ad",
    };

export type SelectedVariationIndex = 0 | 1 | 2;

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
  styleControls: StyleControls;
  setStyleControls: (partial: Partial<StyleControls>) => void;
  brandKit: BrandKit;
  setBrandKit: (partial: Partial<BrandKit> | BrandKit) => void;
  /** Last generated image URLs / data URLs (length 3 after a full run). */
  variations: string[];
  setVariations: (urls: string[]) => void;
  selectedVariation: SelectedVariationIndex | null;
  setSelectedVariation: (index: SelectedVariationIndex | null) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
}

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
  variations: [],
  setVariations: (urls) => set({ variations: urls }),
  selectedVariation: null,
  setSelectedVariation: (index) => set({ selectedVariation: index }),
  isGenerating: false,
  setIsGenerating: (value) => set({ isGenerating: value }),
}));
