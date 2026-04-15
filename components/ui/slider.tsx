"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type SliderProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
};

/**
 * Native range input — avoids Base UI Slider injecting <script> in thumbs,
 * which React 19 warns about on the client.
 */
function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  disabled,
  id,
  ...props
}: SliderProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(defaultValue?.[0] ?? min);

  const n = controlled ? (value?.[0] ?? min) : inner;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!controlled) setInner(next);
    onValueChange?.([next]);
  };

  return (
    <input
      {...props}
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={n}
      disabled={disabled}
      onChange={handleChange}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={n}
      className={cn(
        "h-1 w-full cursor-pointer appearance-none rounded-full bg-muted",
        "accent-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ring [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm",
        "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted",
        "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ring [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-sm",
        "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted",
        className
      )}
    />
  );
}

export { Slider };
