"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { LayoutDashboard, PanelLeft, PanelRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExportPopover } from "./ExportPopover";
import { OpenInCanvasButton } from "./OpenInCanvasButton";
import { useEditorStore } from "@/store/editor";
import { useCanViewDashboard } from "@/lib/use-can-view-dashboard";
import { cn } from "@/lib/utils";

export type EditorToolbarProps = {
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  /** User có flag FLOW_CANVAS → hiện nút "Mở trong canvas" (T6.2). */
  flowCanvasEnabled?: boolean;
  className?: string;
};

export function EditorToolbar({
  onOpenLeftDrawer,
  onOpenRightDrawer,
  flowCanvasEnabled = false,
  className,
}: EditorToolbarProps) {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const generationProgress = useEditorStore((s) => s.generationProgress);
  const canViewDashboard = useCanViewDashboard();

  return (
    <header
      className={cn(
        "relative flex h-[52px] shrink-0 items-center gap-2 bg-white/75 px-3 shadow-sm shadow-zinc-900/[0.04] backdrop-blur-md supports-[backdrop-filter]:bg-white/60 lg:px-4",
        className
      )}
    >
      {isGenerating ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-zinc-200"
          role="progressbar"
          aria-label="Đang tạo banner"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={generationProgress.percent}
          aria-busy="true"
        >
          <div
            className="h-full bg-indigo-600 transition-[width] duration-300 ease-out"
            style={{ width: `${generationProgress.percent}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-1 basis-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0 border-0 bg-zinc-100/70 text-zinc-700 shadow-sm shadow-zinc-900/5 hover:bg-zinc-100 lg:hidden"
          aria-label="Mở bảng canvas và tài sản"
          onClick={onOpenLeftDrawer}
        >
          <PanelLeft className="size-4" />
        </Button>
        <span className="truncate font-semibold tracking-tight text-zinc-900">
          BannerAI
        </span>
      </div>

      {/* Hai bên flex-1 basis-0 → badge đúng giữa khi đủ chỗ; thiếu chỗ thì badge co + cắt chữ, không đè logo/nút
          (flex item không co dưới nội dung). Mobile: ẩn (kích thước đã có trong bảng Canvas). */}
      <div className="hidden min-w-0 justify-center px-1 sm:flex">
        <Badge
          variant="secondary"
          className="max-w-full truncate bg-zinc-100/90 px-3 py-1 text-xs font-medium text-zinc-800 shadow-inner ring-0"
          title={`${canvasConfig.name} — ${canvasConfig.width}×${canvasConfig.height}px`}
        >
          <span className="truncate">
            {canvasConfig.name} · {canvasConfig.width}×{canvasConfig.height}
          </span>
        </Badge>
      </div>

      <div className="flex flex-1 basis-0 items-center justify-end gap-2">
        {flowCanvasEnabled ? <OpenInCanvasButton /> : null}
        <ExportPopover />
        <Show when="signed-out">
          <SignInButton mode="redirect" forceRedirectUrl="/">
            <Button type="button" variant="secondary" size="sm">
              Sign in
            </Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/account/sessions"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden text-zinc-600 sm:inline-flex"
            )}
          >
            Phiên
          </Link>
          <UserButton />
        </Show>
        {canViewDashboard ? (
          <Link
            href="/dashboard"
            aria-label="Mở dashboard"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-zinc-600"
            )}
          >
            <LayoutDashboard className="size-4" />
          </Link>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0 border-0 bg-zinc-100/70 text-zinc-700 shadow-sm shadow-zinc-900/5 hover:bg-zinc-100 lg:hidden"
          aria-label="Mở prompt và phong cách"
          onClick={onOpenRightDrawer}
        >
          <PanelRight className="size-4" />
        </Button>
      </div>
    </header>
  );
}
