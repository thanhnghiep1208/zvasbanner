"use client";

import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_ROLE_OPTIONS, type AssetRole } from "@/lib/types";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";

function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  const keep = max - ext.length - 1;
  if (keep < 4) return `${name.slice(0, max - 1)}…`;
  return `${base.slice(0, keep)}…${ext}`;
}

const roleSelectItems = Object.fromEntries(
  ASSET_ROLE_OPTIONS.map((o) => [o.value, o.label])
) as Record<string, string>;

export function AssetPanel({ className }: { className?: string }) {
  const assets = useEditorStore((s) => s.assets);
  const removeAsset = useEditorStore((s) => s.removeAsset);
  const updateAssetRole = useEditorStore((s) => s.updateAssetRole);

  if (assets.length === 0) {
    return (
      <p
        className={cn(
          "rounded-lg border border-dashed border-muted-foreground/25 bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No assets yet. Upload images above.
      </p>
    );
  }

  return (
    <ul
      className={cn("flex flex-col gap-3", className)}
      aria-label="Uploaded assets"
    >
      {assets.map((asset) => (
        <li
          key={asset.id}
          className="flex gap-3 rounded-lg border border-border bg-card p-2 pr-2 shadow-sm"
        >
          <div className="relative size-[60px] shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs from user uploads */}
            <img
              src={asset.url}
              alt=""
              className="size-full object-cover"
              draggable={false}
            />
            {asset.role === "logo" ? (
              <Badge
                variant="secondary"
                className="pointer-events-none absolute top-0.5 left-0.5 h-4 px-1 text-[10px] leading-none"
              >
                Logo
              </Badge>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <p
                className="min-w-0 truncate text-sm font-medium text-foreground"
                title={asset.fileName}
              >
                {truncateName(asset.fileName)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${asset.fileName}`}
                onClick={() => removeAsset(asset.id)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <Select
              value={asset.role}
              items={roleSelectItems}
              onValueChange={(v) => {
                if (v) updateAssetRole(asset.id, v as AssetRole);
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-full min-w-0 max-w-full"
                aria-label={`Role for ${asset.fileName}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </li>
      ))}
    </ul>
  );
}
