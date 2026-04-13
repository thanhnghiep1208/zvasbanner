"use client";

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";

const checkerboardStyle: CSSProperties = {
  backgroundColor: "var(--muted)",
  backgroundImage: `
    linear-gradient(45deg, color-mix(in oklch, var(--foreground) 12%, transparent) 25%, transparent 25%),
    linear-gradient(-45deg, color-mix(in oklch, var(--foreground) 12%, transparent) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, color-mix(in oklch, var(--foreground) 12%, transparent) 75%),
    linear-gradient(-45deg, transparent 75%, color-mix(in oklch, var(--foreground) 12%, transparent) 75%)
  `,
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
};

export function CanvasArea({ className }: { className?: string }) {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const variations = useEditorStore((s) => s.variations);
  const selectedVariation = useEditorStore((s) => s.selectedVariation);

  const { width, height } = canvasConfig;
  const aspectRatio =
    width > 0 && height > 0 ? (`${width} / ${height}` as const) : "1 / 1";

  const previewUrl =
    selectedVariation !== null &&
    variations.length > selectedVariation &&
    variations[selectedVariation]
      ? variations[selectedVariation]
      : null;

  return (
    <div
      className={cn("w-full max-w-full", className)}
      data-slot="canvas-area"
    >
      <div className="grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        <div
          className="flex min-h-[4rem] items-center justify-center self-stretch"
          aria-hidden
        >
          <span
            className="text-[10px] font-medium tabular-nums tracking-tight text-muted-foreground [text-orientation:mixed] [writing-mode:vertical-rl] rotate-180"
            title={`${height} px tall`}
          >
            {height} px
          </span>
        </div>

        <div className="relative min-w-0">
          <div
            className="relative w-full overflow-hidden rounded-md border border-border shadow-sm"
            style={{ aspectRatio }}
          >
            <div
              className="pointer-events-none absolute inset-0 z-0"
              style={checkerboardStyle}
              aria-hidden
            />

            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URLs / arbitrary hosts
              <img
                src={previewUrl}
                alt="Generated banner preview"
                className="relative z-10 size-full object-contain"
                draggable={false}
              />
            ) : (
              <div
                className="relative z-10 flex size-full min-h-[8rem] flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/35 bg-transparent px-4 py-8 text-center"
                role="status"
                aria-label="Banner preview placeholder"
              >
                <p className="max-w-[14rem] text-sm text-muted-foreground">
                  Your banner will appear here
                </p>
                <p className="text-xs tabular-nums text-muted-foreground/80">
                  {width} × {height} px
                </p>
              </div>
            )}
          </div>
        </div>

        <div aria-hidden />
        <div className="flex justify-center">
          <span
            className="text-[10px] font-medium tabular-nums text-muted-foreground"
            title={`${width} px wide`}
          >
            {width} px
          </span>
        </div>
      </div>
    </div>
  );
}
