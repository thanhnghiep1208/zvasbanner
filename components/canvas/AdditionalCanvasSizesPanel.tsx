"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { track } from "@/lib/analytics";
import {
  getAllPresets,
  getPresetById,
  presetToCanvasConfig,
  type CanvasPresetOption,
} from "@/lib/canvas-presets";
import { requestGenerationForCanvasConfig } from "@/lib/client-generation";
import { explainExportError } from "@/lib/export-errors";
import { exportBanner } from "@/lib/export";
import { resolveBannerImageToDataUrl } from "@/lib/reference-image-data-url";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isSameCanvasPreset(
  preset: CanvasPresetOption,
  config: { width: number; height: number; name: string; platform: string }
): boolean {
  return (
    preset.width === config.width &&
    preset.height === config.height &&
    preset.name === config.name &&
    preset.category === config.platform
  );
}

type PreviewRow = {
  presetId: string;
  label: string;
  width: number;
  height: number;
  platform: string;
  name: string;
  status: "loading" | "ready" | "error";
  image: string | null;
  source?: "gemini" | "placeholder";
  errorMessage?: string;
};

export function AdditionalCanvasSizesPanel({ className }: { className?: string }) {
  const generatedImage = useEditorStore((s) => s.generatedImage);
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const currentBannerId = useEditorStore((s) => s.currentBannerId);
  const assets = useEditorStore((s) => s.assets);
  const headline = useEditorStore((s) => s.headline);
  const subheadline = useEditorStore((s) => s.subheadline);
  const ctaText = useEditorStore((s) => s.ctaText);
  const { userId } = useAuth();

  const [format, setFormat] = React.useState<"png" | "jpg">("png");
  const [qualityPct, setQualityPct] = React.useState(90);
  const [scale, setScale] = React.useState<1 | 2>(1);
  const [extraPresetIds, setExtraPresetIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);
  const [exportingPresetId, setExportingPresetId] = React.useState<string | null>(
    null
  );

  const otherPresets = React.useMemo(() => {
    return getAllPresets().filter((p) => !isSameCanvasPreset(p, canvasConfig));
  }, [canvasConfig]);

  React.useEffect(() => {
    setPreviewRows([]);
  }, [generatedImage]);

  const toggleExtraPreset = (id: string) => {
    setExtraPresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClearPreviews = () => {
    setPreviewRows([]);
  };

  const handleCreatePreviews = async () => {
    const retryPrompt = [
      "Layout translation only: keep same campaign look and content hierarchy.",
      headline.trim() ? `Headline: ${headline.trim()}` : "",
      subheadline.trim() ? `Subheadline: ${subheadline.trim()}` : "",
      ctaText.trim() ? `CTA: ${ctaText.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const ids = [...extraPresetIds].filter((id) => getPresetById(id));
    if (ids.length === 0) {
      toast.error("Chọn ít nhất một kích thước preset.");
      return;
    }
    if (!generatedImage) {
      toast.error("Chưa có banner gốc để làm mốc.");
      return;
    }
    setPreviewBusy(true);
    const bannerId = currentBannerId ?? `banner-extra-${Date.now()}`;
    let readyCount = 0;
    try {
      const ref = await resolveBannerImageToDataUrl(generatedImage);
      if (!ref) {
        toast.error(
          "Không đọc được ảnh banner gốc (data URL). Thử tạo lại banner rồi thử lại."
        );
        return;
      }

      const initialRows: PreviewRow[] = ids.map((id) => {
        const preset = getPresetById(id)!;
        const c = presetToCanvasConfig(preset);
        return {
          presetId: id,
          label: preset.name,
          width: c.width,
          height: c.height,
          platform: c.platform,
          name: c.name,
          status: "loading",
          image: null,
        };
      });
      setPreviewRows(initialRows);

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const preset = getPresetById(id)!;
        const targetConfig = presetToCanvasConfig(preset);
        const t0 = performance.now();
        let gen = await requestGenerationForCanvasConfig(targetConfig, {
          layoutAdaptationFromBanner: ref,
          forceStrictPreserveMode: true,
          imageModelOverride: "nano-banana-2",
        });

        // One automatic retry with compact "layout translation only" prompt.
        if (!gen.ok || gen.source === "placeholder") {
          gen = await requestGenerationForCanvasConfig(targetConfig, {
            layoutAdaptationFromBanner: ref,
            forceStrictPreserveMode: true,
            imageModelOverride: "nano-banana-2",
            userPromptOverride: retryPrompt,
          });
        }

        if (!gen.ok) {
          setPreviewRows((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              status: "error",
              errorMessage: gen.error,
              image: null,
            };
            return next;
          });
          if (i < ids.length - 1) await delay(600);
          continue;
        }

        if (gen.source === "placeholder") {
          const detail =
            gen.placeholderError ?? "AI trả placeholder, không dùng làm biến thể.";
          if (userId) {
            void track("generate_banner", {
              banner_id: bannerId,
              user_id: userId,
              source: "placeholder",
              success: false,
              has_asset: assets.length > 0,
              generation_time_ms:
                gen.meta?.elapsedMs ?? Math.round(performance.now() - t0),
              regenerate_count: 0,
              cost_usd: gen.meta?.costUsd ?? 0,
              prompt_tokens: gen.meta?.promptTokens,
              output_tokens: gen.meta?.outputTokens,
              total_tokens: gen.meta?.totalTokens,
              generation_context: "extra_size_preview",
              target_preset_id: id,
              target_width: targetConfig.width,
              target_height: targetConfig.height,
            }).catch(() => {});
          }
          setPreviewRows((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              status: "error",
              errorMessage: detail,
              source: "placeholder",
              image: null,
            };
            return next;
          });
          if (i < ids.length - 1) await delay(600);
          continue;
        }

        readyCount += 1;
        if (userId) {
          void track("generate_banner", {
            banner_id: bannerId,
            user_id: userId,
            source: gen.source,
            success: true,
            has_asset: assets.length > 0,
            generation_time_ms:
              gen.meta?.elapsedMs ?? Math.round(performance.now() - t0),
            regenerate_count: 0,
            cost_usd: gen.meta?.costUsd ?? 0,
            prompt_tokens: gen.meta?.promptTokens,
            output_tokens: gen.meta?.outputTokens,
            total_tokens: gen.meta?.totalTokens,
            generation_context: "extra_size_preview",
            target_preset_id: id,
            target_width: targetConfig.width,
            target_height: targetConfig.height,
          }).catch(() => {});
        }
        setPreviewRows((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: "ready",
            image: gen.image,
            source: gen.source,
          };
          return next;
        });
        if (i < ids.length - 1) await delay(600);
      }

      if (readyCount === ids.length) {
        toast.success("Đã tạo xong biến thể. Xem từng khung và tải nếu ổn.");
      } else if (readyCount > 0) {
        toast.warning(
          `Một số kích thước lỗi. ${readyCount}/${ids.length} biến thể sẵn sàng để xem/tải.`
        );
      } else {
        toast.error("Không tạo được biến thể nào. Canvas gốc không đổi.");
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Lỗi không xác định";
      toast.error(explainExportError(raw));
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleDownloadRow = async (row: PreviewRow) => {
    if (!row.image || row.status !== "ready" || row.source !== "gemini") {
      return;
    }
    const canvasCfg = {
      width: row.width,
      height: row.height,
      platform: row.platform,
      name: row.name,
    };
    setExportingPresetId(row.presetId);
    try {
      await exportBanner({
        imageUrl: row.image,
        canvasConfig: canvasCfg,
        format,
        quality: qualityPct / 100,
        scale,
        filenameStamp: `${Date.now()}-${row.presetId}`,
      });
      if (userId) {
        void track("export_banner", {
          banner_id: currentBannerId ?? `banner-variant-${row.presetId}`,
          user_id: userId,
          format,
          scale,
          quality: format === "jpg" ? qualityPct / 100 : undefined,
          export_width: row.width,
          export_height: row.height,
          export_preset_id: row.presetId,
          export_variant: "download_ai_extra",
        }).catch(() => {});
      }
      toast.success(`Đã tải: ${row.label}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Lỗi không xác định";
      toast.error(explainExportError(raw));
    } finally {
      setExportingPresetId(null);
    }
  };

  if (otherPresets.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "w-full max-w-2xl rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 shadow-sm",
        className
      )}
      aria-label="Biến thể kích thước"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Biến thể kích thước
      </p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Tạo bản xem trước theo từng preset — AI bám sát banner gốc (bố cục, màu, nội
        dung chính), chỉ điều chỉnh tối thiểu cho khung mới. Chỉ tải khi bạn nhấn
        Tải xuống; canvas đang chỉnh không đổi.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-zinc-500">Khi tải</span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={format === "png" ? "default" : "outline"}
            className="h-7 border-zinc-200 px-2 text-xs"
            onClick={() => setFormat("png")}
            disabled={previewBusy}
          >
            PNG
          </Button>
          <Button
            type="button"
            size="sm"
            variant={format === "jpg" ? "default" : "outline"}
            className="h-7 border-zinc-200 px-2 text-xs"
            onClick={() => setFormat("jpg")}
            disabled={previewBusy}
          >
            JPG
          </Button>
        </div>
        {format === "jpg" ? (
          <div className="flex min-w-[8rem] flex-1 items-center gap-2">
            <Slider
              aria-label="Chất lượng JPG"
              min={60}
              max={100}
              step={1}
              value={[qualityPct]}
              disabled={previewBusy}
              onValueChange={(v) => {
                const n = Array.isArray(v) ? v[0] : v;
                setQualityPct(typeof n === "number" ? n : 90);
              }}
              className="flex-1"
            />
            <span className="w-8 text-[10px] tabular-nums text-zinc-600">
              {qualityPct}%
            </span>
          </div>
        ) : null}
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={scale === 1 ? "default" : "outline"}
            className="h-7 border-zinc-200 px-2 text-xs"
            onClick={() => setScale(1)}
            disabled={previewBusy}
          >
            @1x
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scale === 2 ? "default" : "outline"}
            className="h-7 border-zinc-200 px-2 text-xs"
            onClick={() => setScale(2)}
            disabled={previewBusy}
          >
            @2x
          </Button>
        </div>
      </div>

      <ul
        className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-zinc-100 bg-white p-2"
        aria-label="Chọn preset biến thể"
      >
        {otherPresets.map((p) => {
          const checked = extraPresetIds.has(p.id);
          return (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-800">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 shrink-0 rounded border-zinc-300"
                  checked={checked}
                  disabled={previewBusy}
                  onChange={() => toggleExtraPreset(p.id)}
                />
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-zinc-500">
                    {" "}
                    ({p.width}×{p.height})
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="flex-1 min-w-[10rem]"
          disabled={previewBusy || extraPresetIds.size === 0}
          onClick={() => void handleCreatePreviews()}
        >
          {previewBusy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Đang tạo biến thể…
            </>
          ) : (
            `Tạo biến thể để xem (${extraPresetIds.size})`
          )}
        </Button>
        {previewRows.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-200"
            disabled={previewBusy}
            onClick={handleClearPreviews}
          >
            Xóa kết quả xem
          </Button>
        ) : null}
      </div>

      {previewRows.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {previewRows.map((row) => (
            <div
              key={row.presetId}
              className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-zinc-900">{row.label}</p>
                  <p className="text-[10px] text-zinc-500">
                    {row.width}×{row.height}px
                  </p>
                </div>
              </div>
              <div className="relative aspect-video w-full overflow-hidden rounded border border-zinc-100 bg-zinc-100">
                {row.status === "loading" ? (
                  <div className="flex size-full items-center justify-center gap-2 text-xs text-zinc-500">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Đang tạo…
                  </div>
                ) : null}
                {row.status === "error" ? (
                  <div className="flex size-full flex-col justify-center gap-1 p-2 text-[11px] text-red-700">
                    <span className="font-medium">Lỗi</span>
                    <span className="leading-snug">{row.errorMessage}</span>
                  </div>
                ) : null}
                {row.status === "ready" && row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image}
                    alt={`Biến thể ${row.label}`}
                    className="size-full object-cover"
                    draggable={false}
                  />
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-zinc-200"
                disabled={
                  row.status !== "ready" ||
                  row.source !== "gemini" ||
                  !row.image ||
                  exportingPresetId === row.presetId
                }
                onClick={() => void handleDownloadRow(row)}
              >
                {exportingPresetId === row.presetId ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Đang tải…
                  </>
                ) : (
                  <>
                    <Download className="size-3.5" aria-hidden />
                    Tải xuống
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
