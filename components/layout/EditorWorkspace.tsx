"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { TriangleAlert } from "lucide-react";

import { AssetPanel } from "@/components/assets/AssetPanel";
import { AssetUploader } from "@/components/assets/AssetUploader";
import { CanvasArea } from "@/components/canvas/CanvasArea";
import { CanvasSizeSelector } from "@/components/canvas/CanvasSizeSelector";
import { EditorToolbar } from "@/components/layout/Toolbar";
import { PromptInput } from "@/components/prompt/PromptInput";
import { StyleControls } from "@/components/prompt/StyleControls";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function LeftSidebarBody() {
  return (
    <div className="flex flex-col gap-4">
      <CanvasSizeSelector />
      <AssetUploader />
      <AssetPanel />
    </div>
  );
}

function RightSidebarBody() {
  return (
    <div className="flex flex-col gap-3">
      <PromptInput />
      <StyleControls />
    </div>
  );
}

export function EditorWorkspace() {
  const [leftOpen, setLeftOpen] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);
  const { isSignedIn } = useAuth();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900">
      <EditorToolbar
        onOpenLeftDrawer={() => setLeftOpen(true)}
        onOpenRightDrawer={() => setRightOpen(true)}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Left column — desktop */}
        <aside
          className="hidden w-[280px] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-zinc-200 bg-zinc-50 lg:flex"
          aria-label="Canvas và tài sản"
        >
          <div className="flex flex-col gap-4 p-3">
            <LeftSidebarBody />
          </div>
        </aside>

        {/* Center */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 lg:p-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch">
              <div className="flex min-h-[12rem] min-w-0 flex-1 flex-col items-center justify-center">
                {isSignedIn ? (
                  <CanvasArea className="w-full max-w-full" />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center rounded-lg border-2 border-amber-300 bg-amber-50 px-6 py-10 text-center shadow-sm"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex max-w-md flex-col items-center gap-3">
                      <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                        <TriangleAlert className="size-6" aria-hidden />
                      </div>
                      <p className="text-base font-semibold text-amber-900">
                        Cần đăng nhập để tạo banner
                      </p>
                      <p className="text-sm text-amber-800/90">
                        Vui lòng sign in để bắt đầu và mở toàn bộ tính năng tạo
                        ảnh.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Right column — desktop */}
        <aside
          className="hidden w-[300px] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-l border-zinc-200 bg-zinc-50 lg:flex"
          aria-label="Prompt và phong cách"
        >
          <div className="flex flex-col gap-3 p-3">
            <RightSidebarBody />
          </div>
        </aside>
      </div>

      {/* Mobile / tablet drawers */}
      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent
          side="left"
          showCloseButton
          className="h-full w-[280px] max-w-[min(100vw,280px)] gap-0 border-zinc-200 bg-zinc-50 p-0 sm:max-w-[280px] [&]:flex [&]:h-full [&]:max-h-[100dvh] [&]:flex-col"
        >
          <SheetHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <SheetTitle className="text-left text-sm font-semibold text-zinc-900">
              Canvas &amp; tài sản
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
            <LeftSidebarBody />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={rightOpen} onOpenChange={setRightOpen}>
        <SheetContent
          side="right"
          showCloseButton
          className="h-full w-[300px] max-w-[min(100vw,300px)] gap-0 border-zinc-200 bg-zinc-50 p-0 sm:max-w-[300px] [&]:flex [&]:h-full [&]:max-h-[100dvh] [&]:flex-col"
        >
          <SheetHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <SheetTitle className="text-left text-sm font-semibold text-zinc-900">
              Prompt &amp; phong cách
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
            <RightSidebarBody />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
