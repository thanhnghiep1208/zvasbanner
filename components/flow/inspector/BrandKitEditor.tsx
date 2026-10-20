'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { asLogoPosition, LOGO_POSITIONS, LOGO_POSITION_LABELS } from '@/lib/flow/brand';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { FLOW_FONTS, type FontId } from '@/lib/flow/text/text-style';
import { useFlowStore } from '@/store/flow-store';
import { BrandFromWebsite } from './BrandFromWebsite';
import { ColorField, SelectField } from './fields';

type BrandParams = NodeParamsMap['brand-kit'];

const NONE = '__none__';
const FONT_OPTIONS = [
  { value: NONE, label: 'Không chọn' },
  ...(Object.keys(FLOW_FONTS) as FontId[]).map((id) => ({ value: FLOW_FONTS[id].label, label: FLOW_FONTS[id].label })),
];
const LOGO_OPTIONS = [
  { value: NONE, label: 'Theo bố cục' },
  ...LOGO_POSITIONS.map((p) => ({ value: p, label: LOGO_POSITION_LABELS[p] })),
];

/**
 * Brand kit (T4.5). Lưu đúng kiểu BrandKit của form (chuỗi) để flat gửi thẳng vào prompt cũ:
 * font = nhãn font, logo = 'top-left'… Giá trị lạ (từ project cũ) vẫn hiện để không mất dữ liệu.
 */
export function BrandKitEditor({ nodeId, p }: { nodeId: string; p: BrandParams }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const set = (patch: Partial<BrandParams>) => update<'brand-kit'>(nodeId, patch);
  const setColor = (i: number, color: string) => set({ colors: p.colors.map((c, k) => (k === i ? color : c)) });

  const fontOptions = p.fontPreference && !FONT_OPTIONS.some((o) => o.value === p.fontPreference)
    ? [...FONT_OPTIONS, { value: p.fontPreference, label: `${p.fontPreference} (không có sẵn)` }]
    : FONT_OPTIONS;
  const logoOptions = p.logoPosition && !asLogoPosition(p.logoPosition)
    ? [...LOGO_OPTIONS, { value: p.logoPosition, label: `${p.logoPosition} (chỉ dùng cho flat)` }]
    : LOGO_OPTIONS;

  return (
    <>
      <BrandFromWebsite nodeId={nodeId} p={p} />

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-xs font-medium">Màu thương hiệu</legend>
        {p.colors.length === 0 && <p className="text-xs text-muted-foreground">Chưa có màu.</p>}
        {p.colors.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ColorField label={`Màu ${i + 1}`} value={c} onChange={(v) => setColor(i, v)} />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Xoá màu ${i + 1}`}
              onClick={() => set({ colors: p.colors.filter((_, k) => k !== i) })}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={p.colors.length >= 8}
          onClick={() => set({ colors: [...p.colors, '#111111'] })}>
          <Plus className="size-4" aria-hidden />
          Thêm màu
        </Button>
        <p className="text-xs text-muted-foreground">Dùng cho bảng màu của nền AI và ô chọn nhanh màu chữ.</p>
      </fieldset>

      <SelectField label="Font thương hiệu" value={p.fontPreference ?? NONE} options={fontOptions}
        hint="AI dùng font này (hoặc gần giống) khi vẽ chữ trên banner."
        onChange={(v) => set({ fontPreference: v === NONE ? undefined : v })} />

      <SelectField label="Vị trí logo" value={p.logoPosition ?? NONE} options={logoOptions}
        hint="AI đặt logo vào góc này trên banner."
        onChange={(v) => set({ logoPosition: v === NONE ? undefined : v })} />
    </>
  );
}
