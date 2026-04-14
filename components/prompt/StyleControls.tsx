/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import { ChevronDown } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FONT_STYLE_OPTIONS,
  FONT_STYLE_SELECT_ITEMS,
  MOOD_OPTIONS,
  MOOD_SELECT_ITEMS,
  STYLE_OPTIONS,
  STYLE_SELECT_ITEMS,
} from "@/lib/style-options";
import {
  BACKGROUND_EFFECT_OPTIONS,
  BACKGROUND_GRAIN_OPTIONS,
  BACKGROUND_SHAPE_OPTIONS,
  BACKGROUND_TONE_OPTIONS,
} from "@/lib/background-options";
import type { StyleControls as StyleControlsType } from "@/lib/types";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

export function StyleControls({ className }: { className?: string }) {
  const styleControls = useEditorStore((s) => s.styleControls);
  const setStyleControls = useEditorStore((s) => s.setStyleControls);
  const bg = styleControls.backgroundConfig;

  const toggleIn = <T extends string>(list: T[], value: T) => {
    if (list.includes(value)) return list.filter((x) => x !== value);
    return [...list, value];
  };

  return (
    <details
      className={cn(
        "w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/80 shadow-sm dark:border-border dark:bg-card/30",
        "[&[open]>summary]:border-b [&[open]>summary]:border-zinc-200 dark:[&[open]>summary]:border-border",
        "[&[open]_summary_svg]:rotate-180",
        className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-zinc-900 marker:hidden [&::-webkit-details-marker]:hidden dark:text-foreground">
        <span className="min-w-0 truncate">Phong cách &amp; màu sắc</span>
        <ChevronDown
          className="size-4 shrink-0 text-zinc-500 transition-transform duration-200 dark:text-muted-foreground"
          aria-hidden
        />
      </summary>

      <div className="w-full min-w-0 space-y-4 px-3 py-3">
        <div className="grid w-full min-w-0 grid-cols-1 gap-4">
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="style-control-style"
              className="text-xs font-medium text-zinc-600 dark:text-muted-foreground"
            >
              Phong cách
            </label>
            <div className="min-w-0 w-full">
              <Select
                value={styleControls.style}
                items={STYLE_SELECT_ITEMS}
                onValueChange={(v) => {
                  if (v)
                    setStyleControls({
                      style: v as StyleControlsType["style"],
                    });
                }}
              >
                <SelectTrigger
                  id="style-control-style"
                  className="h-9 w-full max-w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  alignItemWithTrigger={false}
                  className="z-[300] w-[min(100vw-1.5rem,var(--anchor-width))] min-w-[var(--anchor-width)] max-w-[min(100vw-1.5rem,20rem)]"
                >
                  {STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="style-control-mood"
              className="text-xs font-medium text-zinc-600 dark:text-muted-foreground"
            >
              Tông cảm xúc
            </label>
            <div className="min-w-0 w-full">
              <Select
                value={styleControls.mood}
                items={MOOD_SELECT_ITEMS}
                onValueChange={(v) => {
                  if (v)
                    setStyleControls({
                      mood: v as StyleControlsType["mood"],
                    });
                }}
              >
                <SelectTrigger
                  id="style-control-mood"
                  className="h-9 w-full max-w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  alignItemWithTrigger={false}
                  className="z-[300] w-[min(100vw-1.5rem,var(--anchor-width))] min-w-[var(--anchor-width)] max-w-[min(100vw-1.5rem,20rem)]"
                >
                  {MOOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <label
            htmlFor="style-control-font-style"
            className="text-xs font-medium text-zinc-600 dark:text-muted-foreground"
          >
            Kiểu chữ
          </label>
          <div className="min-w-0 w-full">
            <Select
              value={styleControls.fontStyle}
              items={FONT_STYLE_SELECT_ITEMS}
              onValueChange={(v) => {
                if (v)
                  setStyleControls({
                    fontStyle: v as StyleControlsType["fontStyle"],
                  });
              }}
            >
              <SelectTrigger
                id="style-control-font-style"
                className="h-9 w-full max-w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                sideOffset={6}
                alignItemWithTrigger={false}
                className="z-[300] w-[min(100vw-1.5rem,var(--anchor-width))] min-w-[var(--anchor-width)] max-w-[min(100vw-1.5rem,20rem)]"
              >
                {FONT_STYLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-w-0 space-y-2 rounded-lg border border-zinc-200 bg-white/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Cau hinh background
          </p>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-700">
              1. Tone mau chu dao (Color Palette)
            </p>
            {BACKGROUND_TONE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 rounded border-zinc-300"
                  checked={bg.tones.includes(opt.value)}
                  onChange={() =>
                    setStyleControls({
                      backgroundConfig: {
                        ...bg,
                        tones: toggleIn(bg.tones, opt.value),
                      },
                    })
                  }
                />
                <span className="text-zinc-700">
                  <span className="font-medium">{opt.label}:</span>{" "}
                  {opt.description}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-700">
              2. Mat do hat (Grain/Noise Intensity)
            </p>
            {BACKGROUND_GRAIN_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 rounded border-zinc-300"
                  checked={bg.grains.includes(opt.value)}
                  onChange={() =>
                    setStyleControls({
                      backgroundConfig: {
                        ...bg,
                        grains: toggleIn(bg.grains, opt.value),
                      },
                    })
                  }
                />
                <span className="text-zinc-700">
                  <span className="font-medium">{opt.label}:</span>{" "}
                  {opt.description}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-700">
              3. Hinh khoi &amp; Bo cuc (Shapes &amp; Layout)
            </p>
            {BACKGROUND_SHAPE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 rounded border-zinc-300"
                  checked={bg.shapes.includes(opt.value)}
                  onChange={() =>
                    setStyleControls({
                      backgroundConfig: {
                        ...bg,
                        shapes: toggleIn(bg.shapes, opt.value),
                      },
                    })
                  }
                />
                <span className="text-zinc-700">
                  <span className="font-medium">{opt.label}:</span>{" "}
                  {opt.description}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-700">
              4. Sac thai &amp; Hieu ung (Vibe &amp; Effects)
            </p>
            {BACKGROUND_EFFECT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 rounded border-zinc-300"
                  checked={bg.effects.includes(opt.value)}
                  onChange={() =>
                    setStyleControls({
                      backgroundConfig: {
                        ...bg,
                        effects: toggleIn(bg.effects, opt.value),
                      },
                    })
                  }
                />
                <span className="text-zinc-700">
                  <span className="font-medium">{opt.label}:</span>{" "}
                  {opt.description}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
