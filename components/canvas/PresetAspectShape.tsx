import { aspectRatioParts } from "@/lib/canvas-presets";
import { cn } from "@/lib/utils";

type PresetAspectShapeProps = {
  width: number;
  height: number;
  /** Outer box size in px (square). */
  size?: number;
  variant?: "default" | "selected";
  className?: string;
  /** Show simplified ratio label under the shape, e.g. 16:9 */
  showRatioLabel?: boolean;
};

function fitRect(
  box: number,
  padding: number,
  aspect: number
): { x: number; y: number; w: number; h: number } {
  const max = Math.max(1, box - padding * 2);
  let w: number;
  let h: number;
  if (aspect >= 1) {
    w = max;
    h = max / aspect;
  } else {
    h = max;
    w = max * aspect;
  }
  return {
    x: (box - w) / 2,
    y: (box - h) / 2,
    w,
    h,
  };
}

/**
 * Mini aspect-ratio silhouette so preset sizes are easy to scan at a glance.
 */
export function PresetAspectShape({
  width,
  height,
  size = 40,
  variant = "default",
  className,
  showRatioLabel = false,
}: PresetAspectShapeProps) {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const { x, y, w, h } = fitRect(size, 5, aspect);
  const ratio = aspectRatioParts(width, height);
  const selected = variant === "selected";

  return (
    <div
      className={cn("flex shrink-0 flex-col items-center gap-0.5", className)}
      title={`${width}×${height}px · ${ratio.label}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        aria-hidden
      >
        <rect
          x={0.5}
          y={0.5}
          width={size - 1}
          height={size - 1}
          rx={6}
          className={cn(
            "fill-transparent stroke-[1.5]",
            selected ? "stroke-violet-300/80" : "stroke-zinc-200"
          )}
        />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={2}
          className={cn(
            "stroke-[1.5]",
            selected
              ? "fill-violet-500/25 stroke-violet-600/70"
              : "fill-zinc-400/20 stroke-zinc-500/45"
          )}
        />
      </svg>
      {showRatioLabel ? (
        <span
          className={cn(
            "text-[9px] font-medium tabular-nums leading-none",
            selected ? "text-violet-700/80" : "text-zinc-400"
          )}
        >
          {ratio.label}
        </span>
      ) : null}
    </div>
  );
}
