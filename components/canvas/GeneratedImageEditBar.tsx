"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, PencilLine, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGeneratedImageEdit } from "@/components/prompt/prompt-input";
import { cn } from "@/lib/utils";

const CALLOUT_SEEN_KEY = "banner_edit_callout_seen";

export function GeneratedImageEditBar({ className }: { className?: string }) {
  const {
    editPrompt,
    setEditPrompt,
    isEditingImage,
    isGenerating,
    generatedImage,
    handleEditGeneratedImage,
  } = useGeneratedImageEdit();

  const inputRef = useRef<HTMLInputElement>(null);
  const [showCallout, setShowCallout] = useState(false);

  useEffect(() => {
    if (!generatedImage) return;
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    try {
      if (!localStorage.getItem(CALLOUT_SEEN_KEY)) setShowCallout(true);
    } catch {}
    return () => clearTimeout(t);
  }, [generatedImage]);

  const dismissCallout = () => {
    setShowCallout(false);
    try { localStorage.setItem(CALLOUT_SEEN_KEY, "1"); } catch {}
  };

  if (!generatedImage) return null;

  const disabled = isEditingImage || isGenerating;
  const canApply = !disabled && editPrompt.trim().length >= 3;

  return (
    <div className={cn("relative", className)}>
      {/* First-time feature intro callout */}
      {showCallout && (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300 absolute bottom-full left-0 right-0 z-20 mb-3">
          <div className="mx-1 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 shadow-xl shadow-violet-900/25">
            <div className="flex items-start gap-2.5">
              <Sparkles
                className="mt-0.5 size-4 shrink-0 text-violet-200"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white">
                  Tinh chỉnh ảnh bằng AI
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-violet-200">
                  Nhập lệnh để sửa màu sắc, bố cục, ánh sáng… Ảnh cập nhật
                  ngay lập tức.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissCallout}
                className="shrink-0 cursor-pointer rounded p-0.5 text-violet-300 transition-colors hover:bg-white/15 hover:text-white"
                aria-label="Đóng gợi ý"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {/* Callout arrow */}
            <div className="absolute bottom-0 left-8 size-3 translate-y-1/2 rotate-45 rounded-[2px] bg-indigo-600" />
          </div>
        </div>
      )}

      {/* Edit bar */}
      <div
        className="animate-in slide-in-from-bottom-2 fade-in duration-300 flex flex-col gap-1.5 border-t-2 border-t-violet-500/75 bg-white px-3 py-2.5 shadow-[0_-10px_36px_-6px_rgba(109,40,217,0.15)] backdrop-blur-md dark:border-t-violet-400/60 dark:bg-zinc-900/95"
        role="region"
        aria-label="Chỉnh sửa ảnh đã tạo"
      >
        <div className="flex items-center gap-2">
          {/* Label badge */}
          <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 sm:flex">
            <Sparkles className="size-3 shrink-0" strokeWidth={2} aria-hidden />
            Tinh chỉnh AI
          </span>
          <Sparkles
            className="size-3.5 shrink-0 text-violet-500 sm:hidden"
            strokeWidth={2}
            aria-hidden
          />

          <Input
            ref={inputRef}
            value={editPrompt}
            onChange={(e) => {
              setEditPrompt(e.target.value);
              if (showCallout) dismissCallout();
            }}
            placeholder="Dịch trái, ấm màu, sáng hơn…"
            disabled={disabled}
            aria-label="Prompt chỉnh sửa ảnh đã tạo"
            className="h-8 min-w-0 flex-1 border-0 bg-zinc-50 px-2.5 text-xs ring-1 ring-zinc-200 dark:bg-zinc-800/70 dark:ring-zinc-700 md:text-sm focus-visible:ring-violet-400 dark:focus-visible:ring-violet-500"
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
            className="h-8 shrink-0 gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-[11px] font-semibold text-white shadow-sm hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40"
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
                <span className="hidden sm:inline">Áp dụng</span>
              </>
            )}
          </Button>
        </div>

        {/* Hint row */}
        <p className="text-[10px] leading-none text-zinc-400 dark:text-zinc-500">
          Nhấn{" "}
          <kbd className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[9px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Enter
          </kbd>{" "}
          để áp dụng · Mô tả thay đổi bạn muốn thực hiện
        </p>
      </div>
    </div>
  );
}
