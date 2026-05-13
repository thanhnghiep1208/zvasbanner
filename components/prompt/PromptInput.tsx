/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ImageGenerationModel } from "@/lib/types";

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
  } = usePromptInputActions();

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl bg-white/90 p-3 shadow-md shadow-zinc-900/[0.06] ring-1 ring-zinc-900/[0.04] backdrop-blur-sm",
        className
      )}
    >
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

      <div className="flex flex-wrap gap-2 pb-3 shadow-[inset_0_-1px_0_0_rgba(24,24,27,0.07)]">
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
          className="min-w-[9rem] bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm hover:from-violet-500 hover:to-indigo-500"
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

      <div className="space-y-1.5 rounded-lg bg-zinc-50/90 px-3 py-2.5 shadow-inner ring-1 ring-zinc-900/[0.05]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-zinc-700">Model tạo ảnh</p>
          <Badge variant="secondary" className="h-5 px-2 text-[10px]">
            Premium Router
          </Badge>
        </div>
        <div className="grid gap-2">
          {(
            [
              {
                value: "nano-banana-pro",
                title: "Thiết kế Banner (Chất lượng cao) - Nano Banana Pro",
                description:
                  "Hình ảnh có chiều sâu, tính nghệ thuật và độ chi tiết chuyên nghiệp.",
              },
              {
                value: "nano-banana-2",
                title: "Tạo banner nhanh/số lượng lớn - Nano Banana 2",
                description:
                  "Tốc độ cực nhanh, phù hợp cho việc chạy thử nghiệm (A/B testing) nhiều ý tưởng.",
              },
            ] as const
          ).map((item) => {
            const checked = imageModel === item.value;
            return (
              <label
                key={item.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 shadow-sm transition-all ring-1",
                  checked
                    ? "bg-violet-50/90 ring-violet-400/45 shadow-md"
                    : "bg-white/90 ring-zinc-900/[0.06] hover:bg-zinc-50/95 hover:ring-zinc-900/10"
                )}
              >
                <input
                  type="radio"
                  name="image-model-choice"
                  className="mt-0.5 size-4"
                  checked={checked}
                  disabled={isGenerating}
                  onChange={() => setImageModel(item.value as ImageGenerationModel)}
                />
                <span className="space-y-0.5 text-xs">
                  <span className="block font-medium text-zinc-800">{item.title}</span>
                  <span className="block text-zinc-600">{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <label
        htmlFor="strict-preserve-mode-prompt"
        className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-zinc-50/90 px-3 py-2.5 shadow-sm ring-1 ring-zinc-900/[0.05]"
      >
        <input
          id="strict-preserve-mode-prompt"
          type="checkbox"
          className="mt-0.5 size-4 rounded border border-zinc-200/50"
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
        <div className="rounded-lg bg-zinc-50/90 px-3 py-2 text-xs text-zinc-700 shadow-inner ring-1 ring-zinc-900/[0.05]">
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
