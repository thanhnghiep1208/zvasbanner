import { create } from "zustand";

/** Placeholder; extend when wiring canvas, prompt, and generation state. */
export type EditorState = Record<string, never>;

export const useEditorStore = create<EditorState>(() => ({}));
