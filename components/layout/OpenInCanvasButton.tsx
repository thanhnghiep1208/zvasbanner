"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Workflow } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { loadEditorStateIntoFlow } from "@/components/flow/open-from-form";
import { markFlowOpenSource } from "@/components/flow/flow-analytics";
import { useEditorStore } from "@/store/editor";

/** Đã bấm thử Flow canvas trên máy này → tắt chấm báo "mới" (chỉ là tiện ích hiển thị, mất cũng không sao). */
const SEEN_KEY = "zvas:flow-canvas-seen";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

const SEEN_EVENT = "zvas:flow-canvas-seen";

function writeSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode / chặn storage: bỏ qua */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function subscribeSeen(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

/**
 * T6.2: chuyển cấu hình form đang mở sang Flow canvas. Chỉ render khi user có flag FLOW_CANVAS.
 * Quảng bá tính năng mới: gradient tím–indigo như các nút AI chính của form, nhãn "Mới", chấm báo cho tới lần bấm đầu.
 */
export function OpenInCanvasButton() {
  const router = useRouter();
  const isGenerating = useEditorStore((s) => s.isGenerating);
  // Server không có localStorage → coi như đã xem (không chấm) để HTML server và client khớp nhau.
  const seen = useSyncExternalStore(subscribeSeen, readSeen, () => true);

  const open = () => {
    try {
      loadEditorStateIntoFlow();
    } catch (e) {
      toast.error(`Không mở được canvas: ${(e as Error).message}`);
      return;
    }
    writeSeen();
    markFlowOpenSource("form");
    // Điều hướng client-side: flow store (module singleton) giữ graph vừa nạp; /flow không có ?doc/?template nên
    // không nạp gì đè lên.
    router.push("/flow");
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="sm"
            disabled={isGenerating}
            onClick={open}
            aria-label="Mở trong canvas – tính năng mới"
            className="relative h-8 cursor-pointer gap-1.5 rounded-full border-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/20 transition-[box-shadow,background-color] duration-200 ring-inset hover:from-violet-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-indigo-600/40 focus-visible:ring-3 focus-visible:ring-indigo-500/50 disabled:opacity-50 sm:pr-1.5 sm:pl-3"
          />
        }
      >
        <Workflow className="size-4" aria-hidden />
        <span className="hidden font-medium sm:inline">Mở trong canvas</span>
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
        <span className="font-semibold">Mới: Flow canvas.</span> Dựng banner bằng các node, xuất nhiều kích thước cùng
        lúc, lưu thành project. Mở ngay với cấu hình đang có.
      </TooltipContent>
    </Tooltip>
  );
}
