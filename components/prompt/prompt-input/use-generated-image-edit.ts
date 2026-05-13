"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";

import { useEditorStore } from "@/store/editor";

export function useGeneratedImageEdit() {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const generatedImage = useEditorStore((s) => s.generatedImage);
  const setGeneratedImage = useEditorStore((s) => s.setGeneratedImage);
  const setGenerationStats = useEditorStore((s) => s.setGenerationStats);
  const setGenerationError = useEditorStore((s) => s.setGenerationError);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const { isSignedIn } = useAuth();

  const [isEditingImage, setIsEditingImage] = React.useState(false);
  const [editPrompt, setEditPrompt] = React.useState("");

  const handleEditGeneratedImage = React.useCallback(async () => {
    if (!generatedImage) {
      toast.error("Chưa có ảnh để chỉnh sửa.");
      return;
    }
    if (!isSignedIn) {
      toast.error("Cần sign in để chỉnh sửa ảnh.");
      return;
    }
    const trimmed = editPrompt.trim();
    if (trimmed.length < 3) {
      toast.error("Nhập prompt chỉnh sửa tối thiểu 3 ký tự.");
      return;
    }

    setIsEditingImage(true);
    try {
      const res = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: generatedImage,
          editPrompt: trimmed,
          canvasConfig,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      let payload: { image?: unknown; error?: unknown; meta?: unknown } | null = null;
      let textError: string | null = null;
      if (contentType.includes("application/json")) {
        try {
          payload = (await res.json()) as {
            image?: unknown;
            error?: unknown;
            meta?: unknown;
          };
        } catch {
          payload = null;
        }
      } else {
        textError = await res.text().catch(() => null);
      }

      if (!res.ok || typeof payload?.image !== "string") {
        const msg =
          typeof payload?.error === "string"
            ? payload.error
            : textError || `Chỉnh sửa ảnh thất bại (HTTP ${res.status}).`;
        throw new Error(msg);
      }

      setGeneratedImage(payload.image);
      setGenerationStats(
        payload.meta && typeof payload.meta === "object"
          ? (payload.meta as {
              model: string;
              elapsedMs: number;
              promptTokens?: number;
              outputTokens?: number;
              totalTokens?: number;
              costUsd?: number;
            })
          : null
      );
      toast.success("Đã chỉnh sửa ảnh theo prompt.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chỉnh sửa ảnh thất bại.";
      toast.error(msg);
      setGenerationError(msg);
    } finally {
      setIsEditingImage(false);
    }
  }, [
    canvasConfig,
    editPrompt,
    generatedImage,
    isSignedIn,
    setGeneratedImage,
    setGenerationError,
    setGenerationStats,
  ]);

  return {
    editPrompt,
    setEditPrompt,
    isEditingImage,
    isGenerating,
    generatedImage,
    handleEditGeneratedImage,
  };
}
