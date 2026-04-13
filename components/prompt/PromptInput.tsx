"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

const MAX_CHARS = 1000;

const PLACEHOLDER =
  "Mô tả banner bạn muốn tạo... Ví dụ: Banner sale 50% cho shop thời trang, tone màu pastel, phong cách tối giản";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PromptInput({ className }: { className?: string }) {
  const userPrompt = useEditorStore((s) => s.userPrompt);
  const setUserPrompt = useEditorStore((s) => s.setUserPrompt);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const setIsGenerating = useEditorStore((s) => s.setIsGenerating);

  const [isEnhancing, setIsEnhancing] = React.useState(false);
  const [enhanceError, setEnhanceError] = React.useState<string | null>(null);

  const onPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value.slice(0, MAX_CHARS);
    setUserPrompt(next);
  };

  const handleEnhance = async () => {
    setEnhanceError(null);
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userPrompt }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { enhancedPrompt?: unknown };
      const text =
        typeof data.enhancedPrompt === "string" ? data.enhancedPrompt : "";
      setUserPrompt(text.slice(0, MAX_CHARS));
    } catch {
      setEnhanceError("Không cải thiện được prompt. Thử lại sau.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    const state = useEditorStore.getState();
    console.log("[generate stub]", {
      userPrompt: state.userPrompt,
      styleControls: state.styleControls,
      canvasConfig: state.canvasConfig,
      assets: state.assets.map((a) => ({
        id: a.id,
        role: a.role,
        fileName: a.fileName,
      })),
    });
    setIsGenerating(true);
    await sleep(2000);
    setIsGenerating(false);
  };

  const len = userPrompt.length;
  const disableEnhance = isEnhancing || isGenerating || len === 0;
  const disableGenerate = isGenerating || isEnhancing;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Textarea
          value={userPrompt}
          onChange={onPromptChange}
          placeholder={PLACEHOLDER}
          rows={3}
          maxLength={MAX_CHARS}
          disabled={isGenerating}
          aria-label="Mô tả banner"
          className="min-h-[5.25rem] max-h-[12rem] resize-none overflow-y-auto pb-8"
        />
        <div
          className="pointer-events-none absolute right-2 bottom-2 text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {len}/{MAX_CHARS}
        </div>
      </div>

      {enhanceError ? (
        <p className="text-sm text-destructive" role="alert">
          {enhanceError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disableEnhance}
          onClick={() => void handleEnhance()}
          className="min-w-[9rem]"
        >
          {isEnhancing ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Đang xử lý...
            </>
          ) : (
            "Cải thiện prompt"
          )}
        </Button>
        <Button
          type="button"
          variant="default"
          disabled={disableGenerate}
          onClick={() => void handleGenerate()}
          className="min-w-[9rem]"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Đang tạo...
            </>
          ) : (
            "Tạo banner"
          )}
        </Button>
      </div>
    </div>
  );
}
