'use client';

import { useEffect, useRef, useState } from 'react';
import { FLOW_FONTS, TEXT_ROLE_DEFAULTS, defaultTextStyle, type FontId, type FontWeight, type TextStyle } from '@/lib/flow/text/text-style';
import type { NodeParamsMap, TextRole } from '@/lib/flow/schema';
import { renderTextPreview } from '@/lib/flow-ui/compose-render';
import { useFlowStore } from '@/store/flow-store';
import {
  CheckboxField, ColorField, NumberField, SelectField, TextAreaField, ToggleSection,
} from './fields';

type TextParams = NodeParamsMap['text-layer'];

const ROLE_OPTIONS: { value: TextRole; label: string }[] = [
  { value: 'headline', label: 'Tiêu đề chính' },
  { value: 'subheadline', label: 'Tiêu đề phụ' },
  { value: 'cta', label: 'Nút kêu gọi hành động' },
  { value: 'custom', label: 'Text khác' },
];
const FONT_OPTIONS = (Object.keys(FLOW_FONTS) as FontId[]).map((value) => ({ value, label: FLOW_FONTS[value].label }));
const WEIGHT_LABELS: Record<FontWeight, string> = { 400: 'Thường', 500: 'Vừa', 600: 'Đậm vừa', 700: 'Đậm' };
const ALIGN_OPTIONS = [
  { value: 'left', label: 'Trái' }, { value: 'center', label: 'Giữa' }, { value: 'right', label: 'Phải' },
] as const;

/** Bề rộng xem trước = bề rộng cột chữ landscape (≈ 42% của 1080) ở tỉ lệ 1:2 cho vừa Inspector. */
const PREVIEW_SCALE = 0.5;
const PREVIEW_WIDTH_PX = 1080 * 0.42 * PREVIEW_SCALE;

/** Xem trước bằng chính renderer Canvas của Compose (T4.4). Cỡ chữ ×0.5 để vừa khung. */
function TextPreview({ content, style }: { content: string; style: TextStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<{ lines: number; overflow: boolean } | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    let alive = true;
    const scaled: TextStyle = {
      ...style,
      ...(style.stroke ? { stroke: { ...style.stroke, widthPx: style.stroke.widthPx * PREVIEW_SCALE } } : {}),
      ...(style.shadow ? { shadow: { ...style.shadow, blurPx: style.shadow.blurPx * PREVIEW_SCALE, offsetX: style.shadow.offsetX * PREVIEW_SCALE, offsetY: style.shadow.offsetY * PREVIEW_SCALE } } : {}),
      ...(style.plate ? { plate: { ...style.plate, paddingX: style.plate.paddingX * PREVIEW_SCALE, paddingY: style.plate.paddingY * PREVIEW_SCALE, radiusPx: style.plate.radiusPx * PREVIEW_SCALE } } : {}),
    };
    renderTextPreview(ref.current, content || 'Nội dung', scaled, style.fontSizePx * PREVIEW_SCALE, PREVIEW_WIDTH_PX)
      .then((r) => { if (alive) setInfo({ lines: r.lines, overflow: r.overflow }); })
      .catch(() => { if (alive) setInfo(null); });
    return () => { alive = false; };
  }, [content, style]);

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-lg border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-2">
        <canvas ref={ref} className="mx-auto block max-w-full" aria-label={`Xem trước: ${content}`} />
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Xem trước ở 50%, cột chữ banner ngang · {info ? `${info.lines} dòng` : '…'}
        {info?.overflow && <span className="text-destructive"> · vượt số dòng tối đa / từ quá dài</span>}
      </figcaption>
    </figure>
  );
}

export function TextLayerEditor({ nodeId, p }: { nodeId: string; p: TextParams }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const set = (patch: Partial<TextParams>) => update<'text-layer'>(nodeId, patch);
  const setStyle = (patch: Partial<TextStyle>) => set({ style: { ...p.style, ...patch } });
  const s = p.style;
  const weights = FLOW_FONTS[s.fontFamily].weights as readonly FontWeight[];

  return (
    <>
      <SelectField label="Vai trò" value={p.role} options={ROLE_OPTIONS}
        onChange={(role) => set({
          role,
          // Đổi role → kích thước/đậm/plate mặc định theo role mới, giữ font đang chọn; AI chỉ cho headline.
          style: { ...defaultTextStyle(role), fontFamily: s.fontFamily },
          minFontSizePx: TEXT_ROLE_DEFAULTS[role].minFontSizePx,
          renderSource: role === 'headline' ? p.renderSource : 'layer',
        })} />
      <TextAreaField label="Nội dung" value={p.content} onChange={(content) => set({ content })} />
      {p.role === 'headline' && (
        <SelectField label="Cách vẽ chữ" value={p.renderSource}
          options={[{ value: 'layer', label: 'Layer (chính xác)' }, { value: 'ai', label: 'AI vẽ (có thể sai chính tả)' }]}
          onChange={(renderSource) => set({ renderSource })} />
      )}

      {p.renderSource === 'ai' ? (
        <p className="text-xs text-muted-foreground">
          Chữ do AI vẽ vào nền trong vùng tiêu đề, nên không chỉnh được font/màu ở đây.
        </p>
      ) : (
        <>
          <TextPreview content={p.content} style={s} />

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <SelectField label="Font" value={s.fontFamily} options={FONT_OPTIONS}
                onChange={(fontFamily) => {
                  const ws = FLOW_FONTS[fontFamily].weights as readonly FontWeight[];
                  setStyle({ fontFamily, fontWeight: ws.includes(s.fontWeight) ? s.fontWeight : ws[ws.length - 1]! });
                }} />
            </div>
            <SelectField label="Độ đậm" value={String(s.fontWeight) as `${FontWeight}`}
              options={weights.map((w) => ({ value: String(w) as `${FontWeight}`, label: `${WEIGHT_LABELS[w]} (${w})` }))}
              onChange={(v) => setStyle({ fontWeight: Number(v) as FontWeight })} />
            <SelectField label="Căn lề" value={s.align} options={ALIGN_OPTIONS} onChange={(align) => setStyle({ align })} />
            <NumberField label="Cỡ chữ (px)" value={s.fontSizePx} min={1} max={400}
              hint="Tại cạnh ngắn 1080px." onChange={(fontSizePx) => setStyle({ fontSizePx })} />
            <NumberField label="Cỡ tối thiểu" value={p.minFontSizePx} min={1} max={400}
              hint="Auto layout co tới mức này." onChange={(minFontSizePx) => set({ minFontSizePx })} />
            <NumberField label="Giãn dòng" value={s.lineHeight} min={0.8} max={3} step={0.05}
              onChange={(lineHeight) => setStyle({ lineHeight })} />
            <NumberField label="Giãn chữ (em)" value={s.letterSpacingEm} min={-0.1} max={1} step={0.01}
              onChange={(letterSpacingEm) => setStyle({ letterSpacingEm })} />
            <NumberField label="Số dòng tối đa" value={s.maxLines} min={0} max={10}
              hint="0 = không giới hạn." onChange={(maxLines) => setStyle({ maxLines: Math.round(maxLines) })} />
            <div className="flex flex-col justify-end gap-2 pb-1">
              <CheckboxField label="In nghiêng" checked={s.italic} onChange={(italic) => setStyle({ italic })} />
              <CheckboxField label="IN HOA" checked={s.textTransform === 'uppercase'}
                onChange={(on) => setStyle({ textTransform: on ? 'uppercase' : 'none' })} />
            </div>
          </div>

          <ColorField label="Màu chữ" value={s.fill.color} onChange={(color) => setStyle({ fill: { kind: 'solid', color } })} />

          <ToggleSection title="Viền chữ" enabled={Boolean(s.stroke)}
            onToggle={(on) => setStyle({ stroke: on ? { color: '#000000', widthPx: 2 } : undefined })}>
            {s.stroke && (
              <div className="grid grid-cols-2 gap-3">
                <ColorField label="Màu viền" value={s.stroke.color} onChange={(color) => setStyle({ stroke: { ...s.stroke!, color } })} />
                <NumberField label="Độ dày (px)" value={s.stroke.widthPx} min={0.5} max={40} step={0.5}
                  onChange={(widthPx) => setStyle({ stroke: { ...s.stroke!, widthPx } })} />
              </div>
            )}
          </ToggleSection>

          <ToggleSection title="Bóng chữ" enabled={Boolean(s.shadow)}
            onToggle={(on) => setStyle({ shadow: on ? { color: '#00000066', blurPx: 8, offsetX: 0, offsetY: 3 } : undefined })}>
            {s.shadow && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <ColorField label="Màu bóng (#RRGGBBAA)" value={s.shadow.color} onChange={(color) => setStyle({ shadow: { ...s.shadow!, color } })} />
                </div>
                <NumberField label="Độ nhoè" value={s.shadow.blurPx} min={0} max={100}
                  onChange={(blurPx) => setStyle({ shadow: { ...s.shadow!, blurPx } })} />
                <NumberField label="Lệch dọc" value={s.shadow.offsetY} min={-100} max={100}
                  onChange={(offsetY) => setStyle({ shadow: { ...s.shadow!, offsetY } })} />
              </div>
            )}
          </ToggleSection>

          <ToggleSection title="Nền chữ (nút)" enabled={Boolean(s.plate)}
            onToggle={(on) => setStyle({ plate: on ? { color: '#111111', paddingX: 32, paddingY: 16, radiusPx: 12 } : undefined })}>
            {s.plate && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <ColorField label="Màu nền" value={s.plate.color} onChange={(color) => setStyle({ plate: { ...s.plate!, color } })} />
                </div>
                <NumberField label="Đệm ngang" value={s.plate.paddingX} min={0} max={200}
                  onChange={(paddingX) => setStyle({ plate: { ...s.plate!, paddingX } })} />
                <NumberField label="Đệm dọc" value={s.plate.paddingY} min={0} max={200}
                  onChange={(paddingY) => setStyle({ plate: { ...s.plate!, paddingY } })} />
                <NumberField label="Bo góc" value={s.plate.radiusPx} min={0} max={999}
                  onChange={(radiusPx) => setStyle({ plate: { ...s.plate!, radiusPx } })} />
              </div>
            )}
          </ToggleSection>
        </>
      )}
    </>
  );
}
