"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { loadEditorStateIntoFlow } from "@/components/flow/open-from-form";
import { markFlowOpenSource } from "@/components/flow/flow-analytics";
import { useEditorStore } from "@/store/editor";

/**
 * Cờ hiển thị trên máy này (chỉ là tiện ích, mất cũng không sao):
 * - SEEN: đã bấm thử chế độ nâng cao → tắt chấm báo "mới".
 * - INTRO: đã đóng popover giới thiệu → không tự mở lại.
 */
const SEEN_KEY = "zvas:flow-canvas-seen";
const INTRO_KEY = "zvas:advanced-mode-intro-dismissed";
const FLAG_EVENT = "zvas:flow-canvas-flag";
/** Đợi trang ổn định rồi mới mở popover, tránh nháy lúc vừa tải. */
const INTRO_DELAY_MS = 800;

const BENEFITS = [
  "Tạo nhiều kích thước cùng lúc",
  "Lưu thành dự án để mở lại",
  "Chỉnh từng bước chi tiết",
];

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* private mode / chặn storage: bỏ qua */
  }
  window.dispatchEvent(new Event(FLAG_EVENT));
}

function subscribeFlags(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(FLAG_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(FLAG_EVENT, onChange);
  };
}

// Server không có localStorage → coi như đã xem để HTML server và client khớp nhau.
function useFlag(key: string): boolean {
  return useSyncExternalStore(subscribeFlags, () => readFlag(key), () => true);
}

/**
 * T6.2: chuyển cấu hình form đang mở sang Flow canvas, hiển thị cho user là "Chế độ nâng cao".
 * Chỉ render khi user có flag FLOW_CANVAS. Lần đầu tự mở popover giới thiệu (dùng được cả trên mobile,
 * không như tooltip); chấm báo "mới" còn tới lần bấm đầu.
 */
export function OpenInCanvasButton() {
  const router = useRouter();
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const seen = useFlag(SEEN_KEY);
  const introDismissed = useFlag(INTRO_KEY);
  const [introOpen, setIntroOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (introDismissed || isGenerating) return;
    const id = window.setTimeout(() => setIntroOpen(true), INTRO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [introDismissed, isGenerating]);

  const dismissIntro = () => {
    setIntroOpen(false);
    writeFlag(INTRO_KEY);
  };

  const open = () => {
    try {
      loadEditorStateIntoFlow();
    } catch (e) {
      toast.error(`Không mở được chế độ nâng cao: ${(e as Error).message}`);
      return;
    }
    dismissIntro();
    writeFlag(SEEN_KEY);
    markFlowOpenSource("form");
    // Điều hướng client-side: flow store (module singleton) giữ graph vừa nạp; /flow không có ?doc/?template nên
    // không nạp gì đè lên.
    router.push("/flow");
  };

  return (
    <>
      <Tooltip disabled={introOpen}>
        <TooltipTrigger
          render={
            <Button
              ref={buttonRef}
              type="button"
              size="sm"
              disabled={isGenerating}
              onClick={open}
              aria-label="Chế độ nâng cao – tính năng mới"
              className="relative h-8 cursor-pointer gap-1.5 rounded-full border-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/20 transition-[box-shadow,background-color] duration-200 ring-inset hover:from-violet-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-indigo-600/40 focus-visible:ring-3 focus-visible:ring-indigo-500/50 disabled:opacity-50 sm:pr-1.5 sm:pl-3"
            />
          }
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden font-medium sm:inline">Chế độ nâng cao</span>
          <span className="hidden rounded-full bg-white/20 px-1.5 py-px text-[10px] leading-4 font-semibold tracking-wide uppercase sm:inline">
            Mới
          </span>
          {!seen && (
            <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64">
          <span className="font-semibold">Chế độ nâng cao</span> – tạo nhiều kích thước cùng lúc, lưu thành dự án để
          mở lại, chỉnh từng bước chi tiết. Nội dung bạn đang nhập được giữ nguyên.
        </TooltipContent>
      </Tooltip>

      <Popover open={introOpen} onOpenChange={(next) => (next ? setIntroOpen(true) : dismissIntro())}>
        <PopoverContent anchor={buttonRef} side="bottom" align="end" sideOffset={8} className="w-72 gap-3 p-3.5">
          <div className="flex flex-col gap-1">
            <PopoverTitle className="text-sm font-semibold">
              <span className="mr-1.5 rounded-full bg-indigo-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-indigo-700 uppercase">
                Mới
              </span>
              Chế độ nâng cao
            </PopoverTitle>
            <PopoverDescription>Làm được nhiều hơn với banner bạn đang tạo:</PopoverDescription>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Nội dung bạn đang nhập được giữ nguyên khi chuyển sang.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={dismissIntro}>
              Để sau
            </Button>
            <Button type="button" size="sm" disabled={isGenerating} onClick={open}>
              Thử ngay
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
