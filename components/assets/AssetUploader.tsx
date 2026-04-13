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

export function AssetUploader({ className }: { className?: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const assets = useEditorStore((s) => s.assets);
  const addAsset = useEditorStore((s) => s.addAsset);

  const [dragActive, setDragActive] = React.useState(false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState<{
    fileName: string;
    progress: number;
  } | null>(null);
  const dragDepthRef = React.useRef(0);

  const processFiles = React.useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const nextErrors: string[] = [];
      const remainingSlots = MAX_ASSETS - assets.length;

      if (remainingSlots <= 0) {
        setErrors([
          `You can upload at most ${MAX_ASSETS} assets per session. Remove one to add more.`,
        ]);
        return;
      }

      let toProcess = files;
      if (files.length > remainingSlots) {
        nextErrors.push(
          `Only ${remainingSlots} slot(s) left. Extra files were skipped.`
        );
        toProcess = files.slice(0, remainingSlots);
      }

      const validForUpload: File[] = [];
      for (const file of toProcess) {
        if (!isAllowedAssetType(file)) {
          nextErrors.push(
            `“${file.name}”: use PNG, JPG, SVG, or WebP only.`
          );
          continue;
        }
        if (!isWithinSizeLimit(file)) {
          nextErrors.push(
            `“${file.name}”: file must be ${formatMaxSize()} or smaller.`
          );
          continue;
        }
        validForUpload.push(file);
      }

      setErrors(nextErrors);

      for (const file of validForUpload) {
        const url = URL.createObjectURL(file);
        try {
          setUploading({ fileName: file.name, progress: 0 });
          await runFakeProgress((pct) =>
            setUploading({ fileName: file.name, progress: pct })
          );

          const dims = await loadImageDimensions(url);
          const asset: UploadedAsset = {
            id: crypto.randomUUID(),
            url,
            fileName: file.name,
            role: "image",
            hasAlpha: guessHasAlpha(file),
            originalDims: dims,
          };
          addAsset(asset);
        } catch {
          URL.revokeObjectURL(url);
          setErrors((prev) => [
            ...prev,
            `“${file.name}”: could not load as an image.`,
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
        role="presentation"
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
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTR}
          multiple
          aria-label="Upload images"
          onChange={onInputChange}
        />
        <Upload
          className="mx-auto mb-3 size-9 text-muted-foreground"
          aria-hidden
        />
        <p className="mb-1 text-sm font-medium text-foreground">
          Drag and drop images here
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          PNG, JPG, SVG, WebP · max {formatMaxSize()} each · up to {MAX_ASSETS}{" "}
          files
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>

        {uploading ? (
          <div className="mx-auto mt-5 max-w-xs space-y-1.5 text-left">
            <p className="truncate text-xs text-muted-foreground">
              Uploading {uploading.fileName}…
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

      {errors.length > 0 ? (
        <ul
          className="space-y-1 text-sm text-destructive"
          role="alert"
          aria-live="polite"
        >
          {errors.map((msg, i) => (
            <li key={`${i}-${msg.slice(0, 24)}`}>{msg}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
