/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import { Loader2, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  GenerateSpinnerIcon,
  PROMPT_INPUT_MAX_CHARS,
  PROMPT_INPUT_PLACEHOLDER,
  usePromptInputActions,
} from "./prompt-input";

export function PromptInput({ className }: { className?: string }) {
  const {
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
    isGenerating,
    generatedImage,
    generationStats,
    isEnhancing,
    isEditingImage,
    editPrompt,
    setEditPrompt,
    enhanceError,
    handleEnhance,
    handleGenerate,
    handleCancelGenerate,
    handleEditGeneratedImage,
    disableEnhance,
    disableGenerate,
    len,
    isSignedIn,
  } = usePromptInputActions();

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
          placeholder={PROMPT_INPUT_PLACEHOLDER}
          rows={3}
          maxLength={PROMPT_INPUT_MAX_CHARS}
          disabled={isGenerating}
          aria-label="Mô tả banner"
          className="min-h-[5.25rem] max-h-[12rem] resize-none overflow-y-auto pb-8"
        />
        <div
          className="pointer-events-none absolute right-2 bottom-2 text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {len}/{PROMPT_INPUT_MAX_CHARS}
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
