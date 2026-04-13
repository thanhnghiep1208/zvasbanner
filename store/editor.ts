import { create } from "zustand";

import { presetToCanvasConfig, getPresetById } from "@/lib/canvas-presets";
import type {
  AssetRole,
  CanvasConfig,
  StyleControls,
  UploadedAsset,
} from "@/lib/types";

const defaultStyleControls: StyleControls = {
  style: "minimalist",
  mood: "professional",
  colorPalette: "auto",
};

const defaultPreset = getPresetById("social-facebook-ad");
const defaultCanvas: CanvasConfig = defaultPreset
  ? presetToCanvasConfig(defaultPreset)
  : {
      width: 1200,
      height: 628,
      platform: "Social Media",
      name: "Facebook Ad",
    };

export interface EditorState {
  canvasConfig: CanvasConfig;
  setCanvasConfig: (
    config: CanvasConfig | ((prev: CanvasConfig) => CanvasConfig)
  ) => void;
  /** Data URL or remote URL of the last generated banner preview */
  generatedImageUrl: string | null;
  setGeneratedImageUrl: (url: string | null) => void;
  assets: UploadedAsset[];
  addAsset: (asset: UploadedAsset) => void;
  removeAsset: (id: string) => void;
  updateAssetRole: (id: string, role: AssetRole) => void;
  userPrompt: string;
  setUserPrompt: (value: string) => void;
  styleControls: StyleControls;
  setStyleControls: (partial: Partial<StyleControls>) => void;
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
  generatedImageUrl: null,
  setGeneratedImageUrl: (url) => set({ generatedImageUrl: url }),
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
  isGenerating: false,
  setIsGenerating: (value) => set({ isGenerating: value }),
}));
