/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  composeUserPrompt,
  requestFullGeneration,
} from "@/lib/client-generation";
import { track } from "@/lib/analytics";
import {
  useEditorStore,
  type GenerationProgress,
} from "@/store/editor";
import { cn } from "@/lib/utils";

const MAX_CHARS = 1000;

const PLACEHOLDER =
  "Mô tả banner bạn muốn tạo... Ví dụ: Banner sale 50% cho shop thời trang, tone màu pastel, phong cách tối giản";

function GenerateSpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 shrink-0", className)}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="animate-generate-spinner-stroke"
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PromptInput({ className }: { className?: string }) {
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
    const next = e.target.value.slice(0, MAX_CHARS);
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
      const data = (await res.json()) as {
        enhancedPrompt?: unknown;
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const text =
        typeof data.enhancedPrompt === "string" ? data.enhancedPrompt : "";
      setUserPrompt(text.slice(0, MAX_CHARS));
      toast.success("Prompt đã được cải thiện", { duration: 2200 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi không xác định";
      setEnhanceError(msg);
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
    const bannerId = `banner-${canvasConfig.name}-${Date.now()}`;
    setCurrentBannerId(bannerId);
    try {
      await track("generate_banner", {
        banner_id: bannerId,
        user_id: userId ?? "unknown",
        source: result.source,
        success: result.source === "gemini",
        has_asset: assets.length > 0,
        generation_time_ms: result.meta?.elapsedMs ?? undefined,
        regenerate_count: 0,
        cost_usd: result.meta?.costUsd ?? 0,
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

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <div className="mb-2 grid grid-cols-1 gap-2">
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            disabled={isGenerating}
            placeholder="Tiêu đề chính (tuỳ chọn)"
            aria-label="Tiêu đề chính"
          />
          <Input
            value={subheadline}
            onChange={(e) => setSubheadline(e.target.value)}
            disabled={isGenerating}
            placeholder="Tiêu đề phụ (tuỳ chọn)"
            aria-label="Tiêu đề phụ"
          />
          <Input
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            disabled={isGenerating}
            placeholder="Nút kêu gọi hành động (tuỳ chọn)"
            aria-label="Nút kêu gọi hành động"
          />
        </div>
        <Textarea
          value={userPrompt}
          onChange={onPromptChange}
          placeholder={PLACEHOLDER}
          rows={3}
          maxLength={MAX_CHARS}
          disabled={isGenerating}
          aria-label="Mô tả banner"
          className="min-h-[5.25rem] max-h-[12rem] resize-none overflow-y-auto pb-8"
        />
        <div
          className="pointer-events-none absolute right-2 bottom-2 text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {len}/{MAX_CHARS}
        </div>
      </div>

      {enhanceError ? (
        <p className="text-sm text-destructive" role="alert">
          {enhanceError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disableEnhance}
          onClick={() => void handleEnhance()}
          className="min-w-[9rem]"
        >
          {isEnhancing ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Đang xử lý...
            </>
          ) : (
            "Cải thiện prompt"
          )}
        </Button>
        <Button
          type="button"
          variant="default"
          disabled={disableGenerate}
          onClick={() => void handleGenerate()}
          className="min-w-[9rem]"
          title={!isSignedIn ? "Cần sign in để tạo banner" : undefined}
        >
          {isGenerating ? (
            <>
              <GenerateSpinnerIcon />
              Đang tạo...
            </>
          ) : (
            "Tạo banner"
          )}
        </Button>
        {isGenerating ? (
          <Button type="button" variant="outline" onClick={handleCancelGenerate}>
            Hủy
          </Button>
        ) : null}
      </div>

      <label
        htmlFor="strict-preserve-mode-prompt"
        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2"
      >
        <input
          id="strict-preserve-mode-prompt"
          type="checkbox"
          className="mt-0.5 size-4 rounded border-zinc-300"
          checked={styleControls.strictPreserveMode}
          onChange={(e) =>
            setStyleControls({ strictPreserveMode: e.target.checked })
          }
          disabled={isGenerating}
        />
        <span className="space-y-0.5 text-xs">
          <span className="block font-medium text-zinc-800">
            Giữ nguyên chủ thể upload
          </span>
          <span className="block text-zinc-600">
            Hạn chế sửa sản phẩm/logo/chủ thể; AI chủ yếu thêm nền, ánh sáng và
            hiệu ứng.
          </span>
        </span>
      </label>

      {generationStats ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-700">
          <p>
            Model: <span className="font-medium">{generationStats.model}</span>
          </p>
          <p>
            Thời gian tạo:{" "}
            <span className="font-medium">
              {(generationStats.elapsedMs / 1000).toFixed(2)}s
            </span>
          </p>
          <p>
            Token:{" "}
            <span className="font-medium">
              {generationStats.totalTokens ?? "-"}
            </span>{" "}
            <span className="text-zinc-500">
              (prompt: {generationStats.promptTokens ?? "-"}, output:{" "}
              {generationStats.outputTokens ?? "-"})
            </span>
          </p>
          <p>
            Cost:{" "}
            <span className="font-medium">
              {generationStats.costUsd !== undefined
                ? `$${generationStats.costUsd.toFixed(6)}`
                : "-"}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
