/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requestFullGeneration } from "@/lib/client-generation";
import {
  useEditorStore,
  type GenerationProgress,
  type VariationProgressStatus,
} from "@/store/editor";
import { cn } from "@/lib/utils";

function VariationCardSkeleton() {
  return (
    <div
      className="flex min-h-[10rem] flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm"
      aria-hidden
    >
      <div className="aspect-video w-full animate-pulse rounded-md bg-zinc-200" />
      <div className="flex gap-2">
        <div className="h-8 flex-1 animate-pulse rounded-md bg-zinc-200" />
        <div className="h-8 flex-1 animate-pulse rounded-md bg-zinc-200" />
      </div>
    </div>
  );
}

export function VariationGrid({ className }: { className?: string }) {
  const generatedImage = useEditorStore((s) => s.generatedImage);
  const setGeneratedImage = useEditorStore((s) => s.setGeneratedImage);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const setIsGenerating = useEditorStore((s) => s.setIsGenerating);
  const generationError = useEditorStore((s) => s.generationError);
  const setGenerationError = useEditorStore((s) => s.setGenerationError);
  const generationProgress = useEditorStore((s) => s.generationProgress);
  const setGenerationProgress = useEditorStore((s) => s.setGenerationProgress);

  const showSkeletons = isGenerating;
  const hasResults = Boolean(generatedImage);
  const showGenerationFailure = Boolean(generationError) && !isGenerating;

  const statusLabel = (status: VariationProgressStatus) => {
    switch (status) {
      case "running":
        return "Đang tạo";
      case "done":
        return "Hoàn tất";
      case "fallback":
        return "Fallback";
      case "error":
        return "Lỗi";
      default:
        return "Chờ";
    }
  };

  const retryFullGeneration = async () => {
    setGenerationError(null);
    const nextProgress: GenerationProgress = {
      percent: 0,
      status: "pending",
    };
    setGenerationProgress(nextProgress);
    setIsGenerating(true);
    const result = await requestFullGeneration({
      onProgress: ({ status }) => {
        nextProgress.status = status;
        nextProgress.percent = status === "running" ? 65 : 100;
        setGenerationProgress({ ...nextProgress });
      },
    });
    setIsGenerating(false);
    if (!result.ok) {
      setGenerationError(result.error);
      return;
    }
    setGeneratedImage(result.image);
    setGenerationError(null);
    setGenerationProgress({
      percent: 100,
      status: result.source === "placeholder" ? "fallback" : "done",
    });
  };

  return (
    <section
      className={cn("shrink-0 space-y-3", className)}
      aria-label="Kết quả banner"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Kết quả
      </h2>

      {showSkeletons ? (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-sm font-medium text-zinc-800">
            Tiến trình tạo: {generationProgress.percent}%
          </p>
          <p className="text-sm text-zinc-600">
            Trạng thái:{" "}
            <span className="font-medium text-zinc-900">
              {statusLabel(generationProgress.status)}
            </span>
          </p>
          <div className="grid grid-cols-1 gap-3 overflow-visible sm:grid-cols-3">
            <VariationCardSkeleton />
          </div>
        </div>
      ) : null}

      {showGenerationFailure ? (
        <div
          className="rounded-lg border-2 border-destructive/80 bg-destructive/5 p-4 shadow-sm"
          role="alert"
        >
          <p className="text-sm font-semibold text-destructive">
            Tạo banner thất bại
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {generationError}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 border-zinc-200"
            disabled={isGenerating}
            onClick={() => void retryFullGeneration()}
          >
            Thử lại
          </Button>
        </div>
      ) : null}

      {!showSkeletons && !showGenerationFailure && !hasResults ? (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-6 text-center text-sm text-zinc-500">
          Nhấn <span className="font-medium text-zinc-700">Tạo banner</span> để
          tạo 1 kết quả chất lượng cao.
        </p>
      ) : null}

      {!showSkeletons && !showGenerationFailure && hasResults ? (
        <div className="grid grid-cols-1 gap-3 overflow-visible">
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedImage ?? ""}
                alt="Kết quả banner đã tạo"
                className="size-full object-cover"
                draggable={false}
              />
            </div>
            <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              <Sparkles className="size-4 text-amber-500" aria-hidden />
              1 ảnh duy nhất, ưu tiên sáng tạo và chất lượng hoàn thiện.
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
