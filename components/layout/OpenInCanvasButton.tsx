"use client";

import { useRouter } from "next/navigation";
import { Workflow } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { loadEditorStateIntoFlow } from "@/components/flow/open-from-form";
import { useEditorStore } from "@/store/editor";

/** T6.2: chuyển cấu hình form đang mở sang Flow canvas. Chỉ render khi user có flag FLOW_CANVAS. */
export function OpenInCanvasButton() {
  const router = useRouter();
  const isGenerating = useEditorStore((s) => s.isGenerating);

  const open = () => {
    try {
      loadEditorStateIntoFlow();
    } catch (e) {
      toast.error(`Không mở được canvas: ${(e as Error).message}`);
      return;
    }
    // Điều hướng client-side: flow store (module singleton) giữ graph vừa nạp; /flow không có ?doc/?template nên
    // không nạp gì đè lên.
    router.push("/flow");
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="hidden text-zinc-600 sm:inline-flex"
      disabled={isGenerating}
      onClick={open}
      title="Mở cấu hình hiện tại trong Flow canvas (beta)"
    >
      <Workflow className="size-4" aria-hidden />
      Mở trong canvas
    </Button>
  );
}
