import { create } from "zustand";

import { presetToCanvasConfig, getPresetById } from "@/lib/canvas-presets";
import type { CanvasConfig } from "@/lib/types";

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
}));
