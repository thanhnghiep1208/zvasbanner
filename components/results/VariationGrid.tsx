import { cn } from "@/lib/utils";

export function VariationGrid({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "shrink-0 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-3 py-6 text-center text-sm text-zinc-500",
        className
      )}
      aria-label="Biến thể banner"
    >
      <p className="font-medium text-zinc-600">Variations</p>
      <p className="mt-1 text-xs text-zinc-500">
        Generated options will appear here.
      </p>
    </section>
  );
}
