"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";

import {
  composeUserPrompt,
  requestFullGeneration,
} from "@/lib/client-generation";
import { track } from "@/lib/analytics";
import {
  useEditorStore,
  type GenerationProgress,
} from "@/store/editor";

import { PROMPT_INPUT_MAX_CHARS } from "./constants";
import { explainEnhanceHttpError, mapEnhanceErrorCode } from "./enhance-errors";

export function usePromptInputActions() {
  const userPrompt = useEditorStore((s) => s.userPrompt);
  const setUserPrompt = useEditorStore((s) => s.setUserPrompt);
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const assets = useEditorStore((s) => s.assets);
  const headline = useEditorStore((s) => s.headline);
  const setHeadline = useEditorStore((s) => s.setHeadline);
  const subheadline = useEditorStore((s) => s.subheadline);
  const setSubheadline = useEditorStore((s) => s.setSubheadline);
  const ctaText = useEditorStore((s) => s.ctaText);
  const setCtaText = useEditorStore((s) => s.setCtaText);
  const styleControls = useEditorStore((s) => s.styleControls);
  const setStyleControls = useEditorStore((s) => s.setStyleControls);
  const imageModel = useEditorStore((s) => s.imageModel);
  const setImageModel = useEditorStore((s) => s.setImageModel);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const setIsGenerating = useEditorStore((s) => s.setIsGenerating);
  const setGeneratedImage = useEditorStore((s) => s.setGeneratedImage);
  const setCurrentBannerId = useEditorStore((s) => s.setCurrentBannerId);
  const setGenerationError = useEditorStore((s) => s.setGenerationError);
  const setGenerationProgress = useEditorStore((s) => s.setGenerationProgress);
  const resetGenerationProgress = useEditorStore((s) => s.resetGenerationProgress);
  const generationStats = useEditorStore((s) => s.generationStats);
  const setGenerationStats = useEditorStore((s) => s.setGenerationStats);

  const { isSignedIn, userId } = useAuth();

  const [isEnhancing, setIsEnhancing] = React.useState(false);
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);
  const generationAbortRef = React.useRef<AbortController | null>(null);

  const onPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value.slice(0, PROMPT_INPUT_MAX_CHARS);
    setUserPrompt(next);
  };

  const handleEnhance = async () => {
    setEnhanceError(null);
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: composeUserPrompt({
            userPrompt,
            headline,
            subheadline,
            ctaText,
          }),
          canvasConfig,
          assets,
        }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      let data:
        | {
            enhancedPrompt?: unknown;
            error?: unknown;
          }
        | null = null;
      let textError: string | null = null;
      if (contentType.includes("application/json")) {
        try {
          data = (await res.json()) as {
            enhancedPrompt?: unknown;
            error?: unknown;
          };
        } catch {
          data = null;
        }
      } else {
        try {
          textError = await res.text();
        } catch {
          textError = null;
        }
      }
      if (!res.ok) {
        const serverMsg =
          typeof data?.error === "string" ? data.error : textError ?? undefined;
        const msg = `[${mapEnhanceErrorCode(res.status)}] ${explainEnhanceHttpError(
          res.status,
          serverMsg
        )}`;
        throw new Error(msg);
      }
      const text =
        typeof data?.enhancedPrompt === "string" ? data.enhancedPrompt : "";
      setUserPrompt(text.slice(0, PROMPT_INPUT_MAX_CHARS));
      toast.success("Prompt đã được cải thiện", { duration: 2200 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi không xác định";
      setEnhanceError(msg);
      toast.error(msg);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    if (!isSignedIn) {
      toast.error("Cần sign in để tạo banner.");
      return;
    }
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
    }
    const controller = new AbortController();
    generationAbortRef.current = controller;
    const nextProgress: GenerationProgress = {
      percent: 0,
      status: "pending",
    };
    setGenerationError(null);
    setGenerationStats(null);
    setCurrentBannerId(null);
    setGenerationProgress(nextProgress);
    setIsGenerating(true);
    const result = await requestFullGeneration({
      signal: controller.signal,
      onProgress: ({ status }) => {
        nextProgress.status = status;
        nextProgress.percent = status === "running" ? 65 : 100;
        setGenerationProgress({ ...nextProgress });
      },
    });
    if (generationAbortRef.current === controller) {
      generationAbortRef.current = null;
    }
    setIsGenerating(false);
    if (!result.ok) {
      setGenerationError(result.error);
      toast.error(result.error);
      if (result.error.includes("hủy")) {
        resetGenerationProgress();
      }
      return;
    }
    setGeneratedImage(result.image);
    setGenerationError(null);
    setGenerationStats(result.meta ?? null);
    const bannerId = result.bannerId;
    setCurrentBannerId(bannerId);
    try {
      await track("generate_banner", {
        banner_id: bannerId,
        user_id: userId ?? "unknown",
        source: result.source,
        success: result.source === "gemini",
        image_model: result.meta?.model,
        has_asset: assets.length > 0,
        generation_time_ms: result.meta?.elapsedMs ?? undefined,
        regenerate_count: 0,
        cost_usd: result.meta?.costUsd ?? 0,
        prompt_tokens: result.meta?.promptTokens,
        output_tokens: result.meta?.outputTokens,
        total_tokens: result.meta?.totalTokens,
      });
    } catch {
      // Non-blocking analytics path; generation UX should not fail.
    }
    if (result.source === "placeholder") {
      const details = result.placeholderError ?? "Không rõ nguyên nhân.";
      const step = result.failedStep ? ` (bước: ${result.failedStep})` : "";
      const code = result.errorCode ? ` [${result.errorCode}]` : "";
      const msg = `Ảnh AI lỗi, đang hiển thị placeholder${step}${code}. ${details}`;
      setGenerationError(msg);
      toast.error(msg);
    }
    setGenerationProgress({
      percent: 100,
      status: result.source === "placeholder" ? "fallback" : "done",
    });
  };

  const handleCancelGenerate = () => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
  };

  const len = userPrompt.length;
  const disableEnhance = isEnhancing || isGenerating || len === 0;
  const disableGenerate = isGenerating || isEnhancing || !isSignedIn;

  return {
    userPrompt,
    onPromptChange,
    headline,
    setHeadline,
    subheadline,
    setSubheadline,
    ctaText,
    setCtaText,
    styleControls,
    setStyleControls,
    imageModel,
    setImageModel,
    isGenerating,
    generationStats,
    isEnhancing,
    enhanceError,
    handleEnhance,
    handleGenerate,
    handleCancelGenerate,
    disableEnhance,
    disableGenerate,
    len,
    isSignedIn,
  };
}
