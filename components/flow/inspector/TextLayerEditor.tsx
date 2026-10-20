'use client';

import { TEXT_ROLE_DEFAULTS, defaultTextStyle } from '@/lib/flow/text/text-style';
import type { NodeParamsMap, TextRole } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';
import { SelectField, TextAreaField } from './fields';

type TextParams = NodeParamsMap['text-layer'];

const ROLE_OPTIONS: { value: TextRole; label: string }[] = [
  { value: 'headline', label: 'Tiêu đề chính' },
  { value: 'subheadline', label: 'Tiêu đề phụ' },
  { value: 'cta', label: 'Nút kêu gọi hành động' },
  { value: 'custom', label: 'Text khác' },
];

/**
 * Text cho Tạo banner: AI vẽ chữ đúng nội dung theo vai trò; font/màu theo node Phong cách và Brand kit.
 * Mỗi vai trò headline/subheadline/CTA chỉ gửi 1 text (giống form) – text thừa được báo khi chạy.
 */
export function TextLayerEditor({ nodeId, p }: { nodeId: string; p: TextParams }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const set = (patch: Partial<TextParams>) => update<'text-layer'>(nodeId, patch);

  return (
    <>
      <TextAreaField label="Nội dung" value={p.content} rows={3} onChange={(content) => set({ content })} />
      <SelectField label="Vai trò" value={p.role} options={ROLE_OPTIONS}
        onChange={(role) => set({
          role,
          style: defaultTextStyle(role),
          minFontSizePx: TEXT_ROLE_DEFAULTS[role].minFontSizePx,
          renderSource: 'layer',
        })} />
      <p className="text-xs text-muted-foreground">
        AI vẽ chữ đúng nội dung này lên banner. Font và màu theo node Phong cách và Brand kit.
      </p>
    </>
  );
}
