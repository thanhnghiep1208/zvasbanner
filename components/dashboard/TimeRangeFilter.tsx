"use client";

import { Button } from "@/components/ui/button";
import type { DashboardRange } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export type { DashboardRange };

type TimeRangeFilterProps = {
  value: DashboardRange;
  onChange: (next: DashboardRange) => void;
  className?: string;
};

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

export function TimeRangeFilter({
  value,
  onChange,
  className,
}: TimeRangeFilterProps) {
  return (
    <div
      className={cn("inline-flex items-center gap-2", className)}
      role="tablist"
      aria-label="Select analytics time range"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={active ? "default" : "ghost"}
            role="tab"
            aria-selected={active}
            className={cn(
              "min-w-20 rounded-lg border border-transparent",
              active
                ? "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800"
                : "bg-white text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
