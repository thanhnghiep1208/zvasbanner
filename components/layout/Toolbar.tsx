"use client";

import { PanelLeft, PanelRight, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportPopover } from "./ExportPopover";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

export type EditorToolbarProps = {
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  className?: string;
};

export function EditorToolbar({
  onOpenLeftDrawer,
  onOpenRightDrawer,
  className,
}: EditorToolbarProps) {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const generationProgress = useEditorStore((s) => s.generationProgress);

  return (
    <header
      className={cn(
        "relative grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-zinc-200 bg-white px-3 shadow-sm lg:px-4",
        className
      )}
    >
      {isGenerating ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-zinc-200"
          role="progressbar"
          aria-label="Đang tạo banner"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={generationProgress.percent}
          aria-busy="true"
        >
          <div
            className="h-full bg-indigo-600 transition-[width] duration-300 ease-out"
            style={{ width: `${generationProgress.percent}%` }}
          />
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 justify-self-start">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0 border-zinc-200 text-zinc-700 lg:hidden"
          aria-label="Mở bảng canvas và tài sản"
          onClick={onOpenLeftDrawer}
        >
          <PanelLeft className="size-4" />
        </Button>
        <span className="truncate font-semibold tracking-tight text-zinc-900">
          BannerAI
        </span>
      </div>

      <div className="max-w-[min(100vw-10rem,24rem)] min-w-0 justify-self-center px-1">
        <Badge
          variant="outline"
          className="max-w-full truncate border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-800 shadow-none"
          title={`${canvasConfig.name} — ${canvasConfig.width}×${canvasConfig.height}px`}
        >
          <span className="truncate">
            {canvasConfig.name} · {canvasConfig.width}×{canvasConfig.height}
          </span>
        </Badge>
      </div>

      <div className="flex items-center justify-end gap-2 justify-self-end">
        <ExportPopover />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-zinc-600"
          aria-label="Cài đặt"
        >
          <Settings className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0 border-zinc-200 text-zinc-700 lg:hidden"
          aria-label="Mở prompt và phong cách"
          onClick={onOpenRightDrawer}
        >
          <PanelRight className="size-4" />
        </Button>
      </div>
    </header>
  );
}
