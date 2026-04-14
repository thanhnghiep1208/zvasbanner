/*
 * tsc --noEmit: (no errors in this file)
 */

"use client";

import * as React from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  guessHasAlpha,
  isAllowedAssetType,
  isWithinSizeLimit,
  loadImageDimensions,
  MAX_ASSETS,
  MAX_BYTES,
} from "@/lib/asset-upload";
import type { UploadedAsset } from "@/lib/types";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

const ACCEPT_ATTR =
  "image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,.png,.jpg,.jpeg,.svg,.webp";

function formatMaxSize(): string {
  return `${MAX_BYTES / (1024 * 1024)}MB`;
}

async function runFakeProgress(onProgress: (pct: number) => void): Promise<void> {
  for (let p = 0; p <= 100; p += 8) {
    onProgress(Math.min(100, p));
    await new Promise((r) => setTimeout(r, 45));
  }
  onProgress(100);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const v = reader.result;
      if (typeof v === "string") resolve(v);
      else reject(new Error("Failed to read file as data URL"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const INVALID_TYPE_REASON =
  "định dạng không được hỗ trợ (PNG, JPG, SVG, WebP).";
function invalidSizeReason(): string {
  return `dung lượng vượt quá ${formatMaxSize()}.`;
}

export function AssetUploader({ className }: { className?: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();
  const dropZoneId = React.useId();
  const assets = useEditorStore((s) => s.assets);
  const addAsset = useEditorStore((s) => s.addAsset);

  const [dragActive, setDragActive] = React.useState(false);
  const [invalidUploadLine, setInvalidUploadLine] = React.useState<string | null>(
    null
  );
  const [slotErrors, setSlotErrors] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState<{
    fileName: string;
    progress: number;
  } | null>(null);
  const dragDepthRef = React.useRef(0);

  React.useEffect(() => {
    if (!invalidUploadLine) return;
    const t = window.setTimeout(() => setInvalidUploadLine(null), 4000);
    return () => window.clearTimeout(t);
  }, [invalidUploadLine]);

  const processFiles = React.useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const nextSlotErrors: string[] = [];
      const remainingSlots = MAX_ASSETS - assets.length;

      if (remainingSlots <= 0) {
        setSlotErrors([
          `Bạn chỉ có thể tải lên tối đa ${MAX_ASSETS} tài sản mỗi phiên. Hãy xóa bớt để thêm mới.`,
        ]);
        return;
      }

      let toProcess = files;
      if (files.length > remainingSlots) {
        nextSlotErrors.push(
          `Chỉ còn ${remainingSlots} vị trí. Các tệp dư đã bị bỏ qua.`
        );
        toProcess = files.slice(0, remainingSlots);
      }

      let invalidReason: string | null = null;
      const validForUpload: File[] = [];
      for (const file of toProcess) {
        if (!isAllowedAssetType(file)) {
          if (!invalidReason) invalidReason = INVALID_TYPE_REASON;
          continue;
        }
        if (!isWithinSizeLimit(file)) {
          if (!invalidReason) invalidReason = invalidSizeReason();
          continue;
        }
        validForUpload.push(file);
      }

      setInvalidUploadLine(
        invalidReason ? `File không hợp lệ: ${invalidReason}` : null
      );
      setSlotErrors(nextSlotErrors);

      for (const file of validForUpload) {
        const url = URL.createObjectURL(file);
        try {
          setUploading({ fileName: file.name, progress: 0 });
          await runFakeProgress((pct) =>
            setUploading({ fileName: file.name, progress: pct })
          );

          const dims = await loadImageDimensions(url);
          const dataUrl = await fileToDataUrl(file);
          const asset: UploadedAsset = {
            id: crypto.randomUUID(),
            url,
            dataUrl,
            fileName: file.name,
            role: "image",
            hasAlpha: guessHasAlpha(file),
            originalDims: dims,
          };
          addAsset(asset);
        } catch {
          URL.revokeObjectURL(url);
          setSlotErrors((prev) => [
            ...prev,
            `“${file.name}”: không thể đọc thành ảnh hợp lệ.`,
          ]);
        } finally {
          setUploading(null);
        }
      }
    },
    [addAsset, assets.length]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) void processFiles(list);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files?.length) void processFiles(e.dataTransfer.files);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        id={dropZoneId}
        role="region"
        aria-label="Kéo thả ảnh vào đây hoặc chọn tệp để tải lên"
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepthRef.current += 1;
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepthRef.current -= 1;
          if (dragDepthRef.current <= 0) {
            dragDepthRef.current = 0;
            setDragActive(false);
          }
        }}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed border-muted-foreground/35 bg-muted/20 px-4 py-8 text-center transition-colors",
          dragActive && "border-primary bg-primary/5"
        )}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTR}
          multiple
          aria-label="Chọn tệp ảnh để tải lên"
          onChange={onInputChange}
        />
        <Upload
          className="mx-auto mb-3 size-9 text-muted-foreground"
          aria-hidden
        />
        <p className="mb-1 text-sm font-medium text-foreground">
          Kéo và thả ảnh vào đây
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          PNG, JPG, SVG, WebP · max {formatMaxSize()} each · up to {MAX_ASSETS}{" "}
          tệp
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
        >
          Chọn tệp
        </Button>

        {uploading ? (
          <div className="mx-auto mt-5 max-w-xs space-y-1.5 text-left">
            <p className="truncate text-xs text-muted-foreground">
              Đang tải lên {uploading.fileName}…
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
                style={{ width: `${uploading.progress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {invalidUploadLine ? (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          {invalidUploadLine}
        </p>
      ) : null}

      {slotErrors.length > 0 ? (
        <ul
          className="space-y-1 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {slotErrors.map((msg, i) => (
            <li key={`${i}-${msg.slice(0, 24)}`}>{msg}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
