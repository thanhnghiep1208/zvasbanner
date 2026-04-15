/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import type { CSSProperties } from "react";
import * as React from "react";
import { useAuth } from "@clerk/nextjs";

import { track } from "@/lib/analytics";
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

function BannerPlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="6"
        y="8"
        width="52"
        height="32"
        rx="3"
        className="stroke-muted-foreground"
        strokeWidth="2"
      />
      <path
        className="fill-muted-foreground"
        d="M32 18.2l1.35 2.75 3.02.44-2.19 2.13.52 3.01L32 24.9l-2.7 1.42.52-3.01-2.19-2.13 3.02-.44L32 18.2z"
      />
    </svg>
  );
}

export function CanvasArea({ className }: { className?: string }) {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const generatedImage = useEditorStore((s) => s.generatedImage);
  const currentBannerId = useEditorStore((s) => s.currentBannerId);
  const { isSignedIn, userId } = useAuth();
  const trackedPreviewRef = React.useRef<Set<string>>(new Set());

  const { width, height } = canvasConfig;
  const aspectRatio =
    width > 0 && height > 0 ? (`${width} / ${height}` as const) : "1 / 1";
  const isLandscape = width >= height;

  const previewUrl = generatedImage || null;

  const showSpecEmpty = !generatedImage && !previewUrl;

  React.useEffect(() => {
    if (!isSignedIn || !userId || !generatedImage || !currentBannerId) return;
    if (trackedPreviewRef.current.has(currentBannerId)) return;
    trackedPreviewRef.current.add(currentBannerId);
    void track("preview_banner", {
      banner_id: currentBannerId,
      user_id: userId,
      view: "canvas",
    }).catch(() => {
      trackedPreviewRef.current.delete(currentBannerId);
    });
  }, [isSignedIn, userId, generatedImage, currentBannerId]);

  return (
    <div
      className={cn("h-full w-full max-w-full", className)}
      data-slot="canvas-area"
    >
      <div className="grid h-full w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5">
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

        <div className="relative flex min-h-0 min-w-0 items-center justify-center">
          <div
            className="relative overflow-hidden rounded-md border border-border shadow-sm"
            style={{
              aspectRatio,
              width: isLandscape ? "100%" : "auto",
              height: isLandscape ? "auto" : "100%",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
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
                alt="Bản xem trước banner đã tạo"
                className="relative z-10 size-full object-cover"
                draggable={false}
              />
            ) : showSpecEmpty ? (
              <div
                className="relative z-10 flex size-full min-h-[8rem] flex-col items-center justify-center gap-3 px-4 py-8 text-center"
                role="status"
              >
                <BannerPlaceholderIcon className="h-12 w-16 shrink-0" />
                <p className="text-[14px] text-muted-foreground">
                  Banner của bạn sẽ hiện ở đây
                </p>
                <p className="text-[12px] text-muted-foreground/60">
                  Nhập prompt và nhấn Tạo banner
                </p>
              </div>
            ) : (
              <div
                className="relative z-10 flex size-full min-h-[8rem] flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/35 bg-transparent px-4 py-8 text-center"
                role="status"
                aria-label="Vùng xem trước banner"
              >
                <p className="max-w-[14rem] text-sm text-muted-foreground">
                  Banner của bạn sẽ hiện ở đây
                </p>
                <p className="text-xs tabular-nums text-muted-foreground/80">
                  {width} × {height} px
                </p>
              </div>
            )}
          </div>
        </div>
        <div
          className="flex min-h-[4rem] items-center justify-center self-stretch"
          aria-hidden
        >
          {/* Mirror ruler column to keep canvas centered */}
          <span className="invisible text-[10px] font-medium tabular-nums">
            {height} px
          </span>
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
        <div aria-hidden />
      </div>
    </div>
  );
}
