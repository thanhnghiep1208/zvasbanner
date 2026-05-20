import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export type HomeBackHeaderProps = {
  className?: string;
};

export function HomeBackHeader({ className }: HomeBackHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex h-12 max-w-7xl items-center px-4 lg:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Trang chủ
        </Link>
      </div>
    </header>
  );
}
