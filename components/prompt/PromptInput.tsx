/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

function explainEnhanceHttpError(status: number, message?: string): string {
  if (status === 400) {
    return `Dữ liệu cải thiện prompt chưa hợp lệ. ${message ?? ""}`.trim();
  }
  if (status === 429) {
    return "Gemini API đang quá tải/rate limit khi cải thiện prompt. Vui lòng thử lại sau ít phút.";
  }
  if (status === 504) {
    return "Yêu cầu cải thiện prompt bị timeout. Vui lòng thử lại.";
  }
  if (status >= 500) {
    return `Máy chủ cải thiện prompt gặp lỗi (${status}). ${message ?? "Vui lòng thử lại sau."}`.trim();
  }
  return message ?? `Cải thiện prompt thất bại (HTTP ${status}).`;
}

function mapEnhanceErrorCode(status: number): string {
  if (status === 400) return "E-ENH-400";
  if (status === 429) return "E-ENH-429";
  if (status === 504) return "E-ENH-504";
  if (status >= 500) return "E-ENH-5XX";
  return "E-ENH-UNKNOWN";
}

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
  const generatedImage = useEditorStore((s) => s.generatedImage);

  const [isEnhancing, setIsEnhancing] = React.useState(false);
  const [isEditingImage, setIsEditingImage] = React.useState(false);
  const [editPrompt, setEditPrompt] = React.useState("");
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
      setUserPrompt(text.slice(0, MAX_CHARS));
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

  const handleEditGeneratedImage = async () => {
    if (!generatedImage) {
      toast.error("Chưa có ảnh để chỉnh sửa.");
      return;
    }
    if (!isSignedIn) {
      toast.error("Cần sign in để chỉnh sửa ảnh.");
      return;
    }
    const trimmed = editPrompt.trim();
    if (trimmed.length < 3) {
      toast.error("Nhập prompt chỉnh sửa tối thiểu 3 ký tự.");
      return;
    }

    setIsEditingImage(true);
    try {
      const res = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: generatedImage,
          editPrompt: trimmed,
          canvasConfig,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      let payload: { image?: unknown; error?: unknown; meta?: unknown } | null = null;
      let textError: string | null = null;
      if (contentType.includes("application/json")) {
        try {
          payload = (await res.json()) as {
            image?: unknown;
            error?: unknown;
            meta?: unknown;
          };
        } catch {
          payload = null;
        }
      } else {
        textError = await res.text().catch(() => null);
      }

      if (!res.ok || typeof payload?.image !== "string") {
        const msg =
          typeof payload?.error === "string"
            ? payload.error
            : textError || `Chỉnh sửa ảnh thất bại (HTTP ${res.status}).`;
        throw new Error(msg);
      }

      setGeneratedImage(payload.image);
      setGenerationStats(
        payload.meta && typeof payload.meta === "object"
          ? (payload.meta as {
              model: string;
              elapsedMs: number;
              promptTokens?: number;
              outputTokens?: number;
              totalTokens?: number;
              costUsd?: number;
            })
          : null
      );
      toast.success("Đã chỉnh sửa ảnh theo prompt.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chỉnh sửa ảnh thất bại.";
      toast.error(msg);
      setGenerationError(msg);
    } finally {
      setIsEditingImage(false);
    }
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

      {generatedImage ? (
        <div
          className="space-y-3 rounded-xl border-2 border-primary/25 bg-gradient-to-br from-primary/[0.08] via-background to-violet-500/[0.06] p-4 shadow-md ring-1 ring-primary/15 dark:border-primary/35 dark:from-primary/[0.12] dark:ring-primary/25"
          role="region"
          aria-label="Chỉnh sửa ảnh đã tạo"
        >
          <div className="flex gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
              aria-hidden
            >
              <PencilLine className="size-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold leading-tight text-foreground">
                  Chỉnh sửa ảnh vừa tạo
                </h3>
                <Badge
                  variant="default"
                  className="h-5 px-2 text-[10px] font-semibold uppercase tracking-wide"
                >
                  Có sẵn
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Giữ nguyên bố cục và chủ thể. Mô tả thay đổi nhẹ: dịch vị trí, xoay,
                sáng/tối, màu nền hoặc tone — không tạo banner mới từ đầu.
              </p>
            </div>
          </div>
          <Textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            placeholder="Ví dụ: Dời sản phẩm sang trái một chút, xoay nhẹ 8°, ấm màu hơn"
            rows={3}
            disabled={isEditingImage || isGenerating}
            aria-label="Prompt chỉnh sửa ảnh đã tạo"
            className="min-h-[5rem] resize-none border-primary/20 bg-background/80 focus-visible:border-primary/40"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="default"
              size="default"
              className="min-w-[11rem] gap-2 font-semibold shadow-sm"
              disabled={
                isEditingImage || isGenerating || editPrompt.trim().length < 3
              }
              onClick={() => void handleEditGeneratedImage()}
            >
              {isEditingImage ? (
                <>
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                  Đang chỉnh sửa...
                </>
              ) : (
                <>
                  <PencilLine className="size-4 shrink-0" aria-hidden />
                  Áp dụng chỉnh sửa
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
