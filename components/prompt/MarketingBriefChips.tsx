"use client";

import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";
import type { CampaignIntent, FocalSubject } from "@/lib/types";

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        active
          ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {children}
    </button>
  );
}

const INTENT_OPTIONS: { value: CampaignIntent; label: string }[] = [
  { value: "flash-sale", label: "⚡ Flash sale" },
  { value: "product-launch", label: "🚀 Ra mắt sản phẩm" },
  { value: "brand-awareness", label: "💡 Nhận thức thương hiệu" },
  { value: "event", label: "🎉 Sự kiện / Ngày lễ" },
];

const FOCAL_OPTIONS: { value: FocalSubject; label: string }[] = [
  { value: "product", label: "📦 Sản phẩm" },
  { value: "person", label: "👤 Người / Model" },
  { value: "text", label: "✍️ Text / Thông điệp" },
  { value: "scene", label: "🌆 Không gian" },
];


function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function MarketingBriefChips({ disabled }: { disabled?: boolean }) {
  const marketingBrief = useEditorStore((s) => s.marketingBrief);
  const setMarketingBrief = useEditorStore((s) => s.setMarketingBrief);

  return (
    <div className="space-y-2.5">
      {/* Campaign intent */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Mục tiêu banner
        </p>
        <div className="flex flex-wrap gap-1.5">
          {INTENT_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              active={marketingBrief.campaignIntents.includes(value)}
              disabled={disabled}
              onClick={() =>
                setMarketingBrief({
                  campaignIntents: toggle(marketingBrief.campaignIntents, value),
                })
              }
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Focal subject */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Nhân vật chính
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FOCAL_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              active={marketingBrief.focalSubjects.includes(value)}
              disabled={disabled}
              onClick={() =>
                setMarketingBrief({
                  focalSubjects: toggle(marketingBrief.focalSubjects, value),
                })
              }
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

    </div>
  );
}
