/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import { useEditorStore } from "@/store/editor";
import type { VariationProgressStatus } from "@/store/editor";

export type FullGenerationResult =
  | {
      ok: true;
      image: string;
      source: "gemini" | "placeholder";
      meta?: {
        model: string;
        elapsedMs: number;
        promptTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
      placeholderError?: string;
      failedStep?: string;
    }
  | { ok: false; error: string };

const CLIENT_TIMEOUT_MS = 45_000;

type GenerationUpdate = {
  status: VariationProgressStatus;
  source?: "gemini" | "placeholder";
  meta?: {
    model: string;
    elapsedMs: number;
    promptTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  placeholderError?: string;
  failedStep?: string;
};

function timeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    externalSignal.addEventListener(
      "abort",
      () => controller.abort(),
      { once: true }
    );
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
    once: true,
  });
  return controller.signal;
}

export function composeUserPrompt(input: {
  userPrompt: string;
  headline?: string;
  subheadline?: string;
  ctaText?: string;
}): string {
  const base = input.userPrompt.trim();
  const headline = input.headline?.trim() ?? "";
  const sub = input.subheadline?.trim() ?? "";
  const cta = input.ctaText?.trim() ?? "";

  const lines: string[] = [];
  if (base) lines.push(base);
  if (headline) lines.push(`Headline: ${headline}`);
  if (sub) lines.push(`Subheadline: ${sub}`);
  if (cta) lines.push(`CTA: ${cta}`);

  return lines.join("\n");
}

export async function requestFullGeneration(options?: {
  signal?: AbortSignal;
  onProgress?: (update: GenerationUpdate) => void;
}): Promise<FullGenerationResult> {
  const state = useEditorStore.getState();
  const payload = {
    canvasConfig: state.canvasConfig,
    assets: state.assets,
    brandKit: state.brandKit,
    userPrompt: composeUserPrompt({
      userPrompt: state.userPrompt,
      headline: state.headline,
      subheadline: state.subheadline,
      ctaText: state.ctaText,
    }),
    styleControls: state.styleControls,
  };

  try {
    options?.onProgress?.({ status: "running" });
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: timeoutSignal(CLIENT_TIMEOUT_MS, options?.signal),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      image?: unknown;
      source?: unknown;
      meta?: unknown;
      placeholderError?: unknown;
      failedStep?: unknown;
      error?: unknown;
    };
    if (!res.ok || typeof data.image !== "string") {
      const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const source = data.source === "placeholder" ? "placeholder" : "gemini";
    const placeholderError =
      typeof data.placeholderError === "string" ? data.placeholderError : undefined;
    const failedStep =
      typeof data.failedStep === "string" ? data.failedStep : undefined;
    const meta =
      typeof data.meta === "object" && data.meta !== null
        ? (data.meta as {
            model: string;
            elapsedMs: number;
            promptTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
          })
        : undefined;
    options?.onProgress?.({
      status: source === "placeholder" ? "fallback" : "done",
      source,
      meta,
      placeholderError,
      failedStep,
    });
    return { ok: true, image: data.image, source, meta, placeholderError, failedStep };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Đã hủy tác vụ tạo banner." };
    }
    options?.onProgress?.({ status: "error" });
    return {
      ok: false,
      error: "Tạo banner bị timeout hoặc lỗi mạng. Vui lòng thử lại.",
    };
  }
}
