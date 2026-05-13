"use client";

import { Loader2, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGeneratedImageEdit } from "@/components/prompt/prompt-input";
import { cn } from "@/lib/utils";

export function GeneratedImageEditBar({ className }: { className?: string }) {
  const {
    editPrompt,
    setEditPrompt,
    isEditingImage,
    isGenerating,
    generatedImage,
    handleEditGeneratedImage,
  } = useGeneratedImageEdit();

  if (!generatedImage) return null;

  const disabled = isEditingImage || isGenerating;
  const canApply = !disabled && editPrompt.trim().length >= 3;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 bg-background/92 py-1 pl-1.5 pr-1 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md dark:bg-background/85",
        className
      )}
      role="region"
      aria-label="Chỉnh sửa ảnh đã tạo"
    >
      <PencilLine
        className="size-3.5 shrink-0 text-primary"
        strokeWidth={2}
        aria-hidden
      />
      <span className="hidden max-w-[4.5rem] shrink-0 truncate text-[10px] font-medium leading-none text-muted-foreground sm:inline">
        Sửa ảnh
      </span>
      <Input
        value={editPrompt}
        onChange={(e) => setEditPrompt(e.target.value)}
        placeholder="Dịch trái, ấm màu, sáng hơn…"
        disabled={disabled}
        aria-label="Prompt chỉnh sửa ảnh đã tạo"
        className="h-7 min-w-0 flex-1 border-0 bg-muted/35 px-2 text-xs shadow-inner ring-1 ring-zinc-900/[0.06] md:text-sm focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter" && canApply && !e.shiftKey) {
            e.preventDefault();
            void handleEditGeneratedImage();
          }
        }}
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        className="h-7 shrink-0 gap-1 px-2 text-[11px] font-semibold"
        disabled={!canApply}
        onClick={() => void handleEditGeneratedImage()}
      >
        {isEditingImage ? (
          <>
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            <span className="hidden sm:inline">Đang sửa…</span>
          </>
        ) : (
          <>
            <PencilLine className="size-3.5 shrink-0" aria-hidden />
            Áp dụng
          </>
        )}
      </Button>
    </div>
  );
}
