/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import * as React from "react";
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
import { exportBanner } from "@/lib/export";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

export function ExportPopover() {
  const generatedImage = useEditorStore((s) => s.generatedImage);
  const canvasConfig = useEditorStore((s) => s.canvasConfig);

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
      });
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Xuất thất bại";
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
          className="pointer-events-none border-zinc-200 bg-zinc-100 text-zinc-600"
        >
          Xuất
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
          "border-zinc-200"
        )}
      >
        Xuất
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3" sideOffset={8}>
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
              className="flex-1 border-zinc-200"
              onClick={() => setFormat("png")}
            >
              PNG
            </Button>
            <Button
              type="button"
              size="sm"
              variant={format === "jpg" ? "default" : "outline"}
              className="flex-1 border-zinc-200"
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
              className="flex-1 border-zinc-200"
              onClick={() => setScale(1)}
            >
              @1x
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scale === 2 ? "default" : "outline"}
              className="flex-1 border-zinc-200"
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
            "Tải xuống"
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
