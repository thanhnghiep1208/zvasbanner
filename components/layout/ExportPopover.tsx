/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { track } from "@/lib/analytics";
import { configToPresetId } from "@/lib/canvas-presets";
import { explainExportError } from "@/lib/export-errors";
import { exportBanner } from "@/lib/export";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

export function ExportPopover() {
  const generatedImage = useEditorStore((s) => s.generatedImage);
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const currentBannerId = useEditorStore((s) => s.currentBannerId);
  const { userId } = useAuth();

  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<"png" | "jpg">("png");
  const [qualityPct, setQualityPct] = React.useState(90);
  const [scale, setScale] = React.useState<1 | 2>(1);
  const [exporting, setExporting] = React.useState(false);

  const canExport = Boolean(generatedImage);
  const imageUrl = generatedImage || null;

  const handleDownload = async () => {
    if (!imageUrl) {
      toast.error("Không có ảnh để xuất.");
      return;
    }
    setExporting(true);
    try {
      await exportBanner({
        imageUrl,
        canvasConfig,
        format,
        quality: qualityPct / 100,
        scale,
        filenameStamp: `${Date.now()}-${configToPresetId(canvasConfig)}`,
      });
      if (currentBannerId && userId) {
        void track("export_banner", {
          banner_id: currentBannerId,
          user_id: userId,
          format,
          scale,
          quality: format === "jpg" ? qualityPct / 100 : undefined,
          export_width: canvasConfig.width,
          export_height: canvasConfig.height,
          export_preset_id: configToPresetId(canvasConfig),
          export_variant: "current_canvas",
        }).catch(() => {
          // Non-blocking analytics path; export UX should not fail.
        });
      }
      setOpen(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Lỗi không xác định";
      const msg = explainExportError(raw);
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const disabledTrigger = (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex cursor-not-allowed rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        }
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled
          aria-label="Xuất banner"
          className="pointer-events-none border-0 bg-zinc-100/90 text-zinc-600 shadow-sm ring-1 ring-zinc-900/[0.06]"
        >
          Download Image
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Tạo banner trước khi xuất
      </TooltipContent>
    </Tooltip>
  );

  if (!canExport) {
    return disabledTrigger;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Xuất banner"
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "border-0 shadow-sm ring-1 ring-zinc-900/[0.06]"
        )}
      >
        Download Image
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[min(32rem,calc(100vh-4rem))] w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto p-3 shadow-lg shadow-zinc-900/[0.08] ring-1 ring-zinc-900/[0.06]"
        sideOffset={8}
      >
        <PopoverTitle className="text-sm font-semibold text-zinc-900">
          Xuất banner
        </PopoverTitle>

        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-600">Định dạng</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={format === "png" ? "default" : "outline"}
              className={cn(
                "flex-1",
                format !== "png" &&
                  "border-0 bg-zinc-100/75 shadow-sm ring-1 ring-zinc-900/[0.06]"
              )}
              onClick={() => setFormat("png")}
            >
              PNG
            </Button>
            <Button
              type="button"
              size="sm"
              variant={format === "jpg" ? "default" : "outline"}
              className={cn(
                "flex-1",
                format !== "jpg" &&
                  "border-0 bg-zinc-100/75 shadow-sm ring-1 ring-zinc-900/[0.06]"
              )}
              onClick={() => setFormat("jpg")}
            >
              JPG
            </Button>
          </div>
        </div>

        {format === "jpg" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
              <label htmlFor="export-quality-slider">Chất lượng</label>
              <span className="tabular-nums text-zinc-800">{qualityPct}%</span>
            </div>
            <Slider
              id="export-quality-slider"
              min={60}
              max={100}
              step={1}
              value={[qualityPct]}
              onValueChange={(v) => {
                const n = Array.isArray(v) ? v[0] : v;
                setQualityPct(typeof n === "number" ? n : 90);
              }}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-600">Độ phân giải</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={scale === 1 ? "default" : "outline"}
              className={cn(
                "flex-1",
                scale !== 1 &&
                  "border-0 bg-zinc-100/75 shadow-sm ring-1 ring-zinc-900/[0.06]"
              )}
              onClick={() => setScale(1)}
            >
              @1x
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scale === 2 ? "default" : "outline"}
              className={cn(
                "flex-1",
                scale !== 2 &&
                  "border-0 bg-zinc-100/75 shadow-sm ring-1 ring-zinc-900/[0.06]"
              )}
              onClick={() => setScale(2)}
            >
              @2x
            </Button>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={exporting || !imageUrl}
          onClick={() => void handleDownload()}
        >
          {exporting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Đang xuất...
            </>
          ) : (
            "Tải xuống (kích thước canvas hiện tại)"
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
