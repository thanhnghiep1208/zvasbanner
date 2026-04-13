"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useEditorStore, type SelectedVariationIndex } from "@/store/editor";
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
  const variations = useEditorStore((s) => s.variations);
  const selectedVariation = useEditorStore((s) => s.selectedVariation);
  const setSelectedVariation = useEditorStore((s) => s.setSelectedVariation);
  const setVariations = useEditorStore((s) => s.setVariations);
  const isGenerating = useEditorStore((s) => s.isGenerating);

  const [regeneratingIndex, setRegeneratingIndex] = React.useState<
    SelectedVariationIndex | null
  >(null);

  /** Full run from prompt uses store isGenerating; single-slot regen uses local state. */
  const showSkeletons = isGenerating;
  const hasResults = variations.length === 3;

  const runRegenerate = async (index: SelectedVariationIndex) => {
    if (variations.length !== 3 || regeneratingIndex !== null) return;

    const state = useEditorStore.getState();
    setRegeneratingIndex(index);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasConfig: state.canvasConfig,
          assets: state.assets,
          brandKit: state.brandKit,
          userPrompt: state.userPrompt,
          styleControls: state.styleControls,
          regenerateVariationIndex: index,
          existingVariations: variations,
        }),
      });
      const data = (await res.json()) as {
        variations?: unknown;
        error?: unknown;
      };
      if (!res.ok) {
        const msg =
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        toast.error(msg);
        return;
      }
      if (
        !Array.isArray(data.variations) ||
        data.variations.length !== 3 ||
        !data.variations.every((u) => typeof u === "string")
      ) {
        toast.error("Phản hồi biến thể không hợp lệ.");
        return;
      }
      setVariations(data.variations as string[]);
    } catch {
      toast.error("Không tạo lại được biến thể. Thử lại sau.");
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <section
      className={cn("shrink-0 space-y-3", className)}
      aria-label="Biến thể banner"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Biến thể
      </h2>

      {showSkeletons ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <VariationCardSkeleton />
          <VariationCardSkeleton />
          <VariationCardSkeleton />
        </div>
      ) : null}

      {!showSkeletons && !hasResults ? (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-6 text-center text-sm text-zinc-500">
          Nhấn <span className="font-medium text-zinc-700">Tạo banner</span> để
          tạo 3 biến thể.
        </p>
      ) : null}

      {hasResults ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([0, 1, 2] as const).map((index) => {
            const url = variations[index];
            const selected = selectedVariation === index;
            const regenBusy = regeneratingIndex === index;

            return (
              <div
                key={index}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-white p-2 shadow-sm transition-[box-shadow,border-color]",
                  selected
                    ? "border-indigo-500 ring-2 ring-indigo-500/25"
                    : "border-zinc-200"
                )}
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Biến thể ${index + 1}`}
                    className="size-full object-cover"
                    draggable={false}
                  />
                  {regenBusy ? (
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-zinc-900/40"
                      aria-live="polite"
                    >
                      <Loader2
                        className="size-8 text-white animate-spin"
                        aria-hidden
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "secondary"}
                    className="min-w-0 flex-1"
                    disabled={regenBusy || isGenerating}
                    onClick={() => setSelectedVariation(index)}
                  >
                    Select
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-w-0 flex-1 border-zinc-200"
                    disabled={
                      regenBusy || isGenerating || regeneratingIndex !== null
                    }
                    onClick={() => void runRegenerate(index)}
                  >
                    Variation
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
