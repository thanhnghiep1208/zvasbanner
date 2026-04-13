"use client";

import * as React from "react";
import { Link2, Link2Off } from "lucide-react";

import {
  CANVAS_PRESET_GROUPS,
  CUSTOM_PRESET_ID,
  aspectRatioParts,
  configToPresetId,
  getPresetById,
  presetToCanvasConfig,
} from "@/lib/canvas-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CanvasConfig } from "@/lib/types";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

const MIN_PX = 1;
const MAX_PX = 8192;

function clampDimension(n: number): number {
  if (!Number.isFinite(n)) return MIN_PX;
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(n)));
}

export function CanvasSizeSelector({ className }: { className?: string }) {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const setCanvasConfig = useEditorStore((s) => s.setCanvasConfig);

  const presetId = React.useMemo(
    () => configToPresetId(canvasConfig),
    [canvasConfig]
  );

  const [ratioLocked, setRatioLocked] = React.useState(true);
  const lockedRatioRef = React.useRef(
    canvasConfig.width / Math.max(canvasConfig.height, 1)
  );

  const handlePresetChange = React.useCallback(
    (nextId: string | null) => {
      if (nextId == null) return;
      if (nextId === CUSTOM_PRESET_ID) {
        setCanvasConfig((prev) => ({
          ...prev,
          platform: "Custom",
          name: "Custom",
        }));
        lockedRatioRef.current =
          canvasConfig.width / Math.max(canvasConfig.height, 1);
        return;
      }
      const preset = getPresetById(nextId);
      if (preset) {
        setCanvasConfig(presetToCanvasConfig(preset));
        lockedRatioRef.current = preset.width / preset.height;
      }
    },
    [setCanvasConfig, canvasConfig.width, canvasConfig.height]
  );

  const applyCustomDimensions = React.useCallback(
    (width: number, height: number) => {
      const w = clampDimension(width);
      const h = clampDimension(height);
      setCanvasConfig({
        width: w,
        height: h,
        platform: "Custom",
        name: "Custom",
      });
    },
    [setCanvasConfig]
  );

  const onWidthChange = (raw: string) => {
    const v = parseInt(raw, 10);
    if (Number.isNaN(v)) return;
    if (presetId !== CUSTOM_PRESET_ID) return;
    if (ratioLocked) {
      const r = lockedRatioRef.current || 1;
      const newW = clampDimension(v);
      const newH = clampDimension(newW / r);
      applyCustomDimensions(newW, newH);
    } else {
      applyCustomDimensions(v, canvasConfig.height);
    }
  };

  const onHeightChange = (raw: string) => {
    const v = parseInt(raw, 10);
    if (Number.isNaN(v)) return;
    if (presetId !== CUSTOM_PRESET_ID) return;
    if (ratioLocked) {
      const r = lockedRatioRef.current || 1;
      const newH = clampDimension(v);
      const newW = clampDimension(newH * r);
      applyCustomDimensions(newW, newH);
    } else {
      applyCustomDimensions(canvasConfig.width, v);
    }
  };

  const toggleRatioLock = () => {
    setRatioLocked((prev) => {
      const next = !prev;
      if (next) {
        lockedRatioRef.current =
          canvasConfig.width / Math.max(canvasConfig.height, 1);
      }
      return next;
    });
  };

  const preview = React.useMemo(() => {
    const w = canvasConfig.width;
    const h = canvasConfig.height;
    if (!w || !h) return { pw: 0, ph: 0 };
    const max = 96;
    const ar = w / h;
    if (ar >= 1) {
      return { pw: max, ph: max / ar };
    }
    return { pw: max * ar, ph: max };
  }, [canvasConfig.width, canvasConfig.height]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="space-y-2">
        <span className="text-sm font-medium" id="canvas-size-label">
          Canvas size
        </span>
        <Select value={presetId} onValueChange={handlePresetChange}>
          <SelectTrigger
            size="default"
            className="h-9 w-full min-w-0 max-w-md justify-between"
            aria-labelledby="canvas-size-label"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {CANVAS_PRESET_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.presets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{" "}
                    <span className="text-muted-foreground">
                      ({p.width}×{p.height})
                    </span>
                  </SelectItem>
                ))}
                {group.label === "Other" ? (
                  <SelectItem value={CUSTOM_PRESET_ID}>Custom…</SelectItem>
                ) : null}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {presetId === CUSTOM_PRESET_ID ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid w-28 gap-1.5">
            <label
              htmlFor="canvas-width"
              className="text-xs font-medium text-muted-foreground"
            >
              Width (px)
            </label>
            <Input
              id="canvas-width"
              type="number"
              min={MIN_PX}
              max={MAX_PX}
              value={canvasConfig.width}
              onChange={(e) => onWidthChange(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mb-0.5 shrink-0"
            onClick={toggleRatioLock}
            aria-pressed={ratioLocked}
            title={
              ratioLocked
                ? "Unlock aspect ratio"
                : "Lock aspect ratio to current proportion"
            }
          >
            {ratioLocked ? (
              <Link2 className="size-3.5" aria-hidden />
            ) : (
              <Link2Off className="size-3.5" aria-hidden />
            )}
            <span className="sr-only">
              {ratioLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
            </span>
          </Button>
          <div className="grid w-28 gap-1.5">
            <label
              htmlFor="canvas-height"
              className="text-xs font-medium text-muted-foreground"
            >
              Height (px)
            </label>
            <Input
              id="canvas-height"
              type="number"
              min={MIN_PX}
              max={MAX_PX}
              value={canvasConfig.height}
              onChange={(e) => onHeightChange(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <div
          className="flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40"
          style={{
            width: preview.pw + 16,
            height: preview.ph + 16,
            minWidth: 40,
            minHeight: 40,
          }}
          aria-hidden
        >
          <div
            className="rounded-sm bg-primary/25 ring-1 ring-primary/40"
            style={{
              width: Math.max(4, preview.pw),
              height: Math.max(4, preview.ph),
            }}
          />
        </div>
        <MetadataBlock config={canvasConfig} />
      </div>
    </div>
  );
}

function MetadataBlock({ config }: { config: CanvasConfig }) {
  const { label: ratioLabel, decimal: ratioDecimal } = aspectRatioParts(
    config.width,
    config.height
  );
  return (
    <dl className="grid min-w-0 flex-1 gap-2 text-sm sm:grid-cols-3 sm:gap-x-4">
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Platform</dt>
        <dd className="truncate font-medium text-foreground">{config.platform}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">
          Dimensions
        </dt>
        <dd className="font-medium text-foreground tabular-nums">
          {config.width} × {config.height} px
        </dd>
      </div>
      <div className="min-w-0 sm:col-span-1">
        <dt className="text-xs font-medium text-muted-foreground">
          Aspect ratio
        </dt>
        <dd className="font-medium text-foreground tabular-nums">
          {ratioLabel}
          <span className="ml-1.5 text-muted-foreground">({ratioDecimal}:1)</span>
        </dd>
      </div>
    </dl>
  );
}
