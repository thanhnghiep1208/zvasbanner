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
  MOOD_OPTIONS,
  MOOD_SELECT_ITEMS,
  PALETTE_OPTIONS,
  PALETTE_SELECT_ITEMS,
  STYLE_OPTIONS,
  STYLE_SELECT_ITEMS,
} from "@/lib/style-options";
import type { StyleControls as StyleControlsType } from "@/lib/types";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

export function StyleControls({ className }: { className?: string }) {
  const styleControls = useEditorStore((s) => s.styleControls);
  const setStyleControls = useEditorStore((s) => s.setStyleControls);

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
        <span className="min-w-0 truncate">Style &amp; color</span>
        <ChevronDown
          className="size-4 shrink-0 text-zinc-500 transition-transform duration-200 dark:text-muted-foreground"
          aria-hidden
        />
      </summary>

      <div className="w-full min-w-0 space-y-4 px-3 py-3">
        {/* Always single column: sidebar is ~300px; two columns break Select layout */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-4">
          <div className="min-w-0 space-y-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-muted-foreground">
              Style
            </span>
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
                <SelectTrigger className="h-9 w-full max-w-full min-w-0">
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
            <span className="text-xs font-medium text-zinc-600 dark:text-muted-foreground">
              Mood
            </span>
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
                <SelectTrigger className="h-9 w-full max-w-full min-w-0">
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
          <span className="text-xs font-medium text-zinc-600 dark:text-muted-foreground">
            Color palette
          </span>
          {/* Select avoids Tabs root flex row + multiple panels overflowing a ~300px sidebar */}
          <div className="min-w-0 w-full">
            <Select
              value={styleControls.colorPalette}
              items={PALETTE_SELECT_ITEMS}
              onValueChange={(v) => {
                if (v)
                  setStyleControls({
                    colorPalette: v as StyleControlsType["colorPalette"],
                  });
              }}
            >
              <SelectTrigger className="h-9 w-full max-w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                sideOffset={6}
                alignItemWithTrigger={false}
                className="z-[300] w-[min(100vw-1.5rem,var(--anchor-width))] min-w-[var(--anchor-width)] max-w-[min(100vw-1.5rem,20rem)]"
              >
                {PALETTE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </details>
  );
}
