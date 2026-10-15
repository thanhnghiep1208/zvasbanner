'use client';

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FOCAL_OPTIONS, INTENT_OPTIONS } from '@/components/prompt/MarketingBriefChips';
import { CANVAS_PRESET_GROUPS, getPresetById, presetToCanvasConfig } from '@/lib/canvas-presets';
import { FONT_STYLE_OPTIONS, MOOD_OPTIONS, PALETTE_OPTIONS, STYLE_OPTIONS } from '@/lib/style-options';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { FlowNode, NodeParamsMap, NodeType, TextRole } from '@/lib/flow/schema';
import { defaultTextStyle, TEXT_ROLE_DEFAULTS } from '@/lib/flow/text/text-style';
import { validateGraph } from '@/lib/flow/validate';
import { MODEL_LABELS } from '@/lib/flow-ui/node-summary';
import { useFlowStore } from '@/store/flow-store';
import { AssetEditor } from './AssetEditor';
import { RunResults } from './RunResults';
import {
  CheckboxField, NumberField, SelectField, TextAreaField, TextField, ToggleGroupField,
} from './fields';
import styles from '../flow-canvas.module.css';

const MODEL_OPTIONS = (Object.keys(MODEL_LABELS) as (keyof typeof MODEL_LABELS)[])
  .map((value) => ({ value, label: MODEL_LABELS[value] }));

const TEXT_ROLE_OPTIONS: { value: TextRole; label: string }[] = [
  { value: 'headline', label: 'Tiêu đề chính' },
  { value: 'subheadline', label: 'Tiêu đề phụ' },
  { value: 'cta', label: 'Nút kêu gọi hành động' },
  { value: 'custom', label: 'Text khác' },
];

/** Editor theo node type. `P` = params đã thu hẹp theo type. */
function NodeEditor({ node }: { node: FlowNode }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const set = <T extends NodeType>(patch: Partial<NodeParamsMap[T]>) => update<T>(node.id, patch);

  switch (node.type) {
    case 'product-asset': {
      const p = node.params as NodeParamsMap['product-asset'];
      return <AssetEditor nodeId={node.id} params={p} roles={['image', 'logo', 'decoration'] as const} />;
    }
    case 'reference-image': {
      const p = node.params as NodeParamsMap['reference-image'];
      return <AssetEditor nodeId={node.id} params={p} roles={['style-reference', 'background'] as const} />;
    }
    case 'brief': {
      const p = node.params as NodeParamsMap['brief'];
      return (
        <>
          <TextAreaField label="Prompt" value={p.prompt} placeholder="Mô tả banner cần tạo"
            onChange={(prompt) => set<'brief'>({ prompt })} />
          <ToggleGroupField label="Mục tiêu chiến dịch" values={p.marketingBrief.campaignIntents} options={INTENT_OPTIONS}
            onChange={(campaignIntents) => set<'brief'>({ marketingBrief: { ...p.marketingBrief, campaignIntents } })} />
          <ToggleGroupField label="Chủ thể chính" values={p.marketingBrief.focalSubjects} options={FOCAL_OPTIONS}
            onChange={(focalSubjects) => set<'brief'>({ marketingBrief: { ...p.marketingBrief, focalSubjects } })} />
        </>
      );
    }
    case 'text-layer': {
      const p = node.params as NodeParamsMap['text-layer'];
      return (
        <>
          <SelectField label="Vai trò" value={p.role} options={TEXT_ROLE_OPTIONS}
            onChange={(role) => set<'text-layer'>({
              role,
              // Đổi role → style + cỡ tối thiểu theo role mới; AI chỉ cho headline.
              style: defaultTextStyle(role),
              minFontSizePx: TEXT_ROLE_DEFAULTS[role].minFontSizePx,
              renderSource: role === 'headline' ? p.renderSource : 'layer',
            })} />
          <TextAreaField label="Nội dung" value={p.content} onChange={(content) => set<'text-layer'>({ content })} />
          {p.role === 'headline' && (
            <SelectField label="Cách vẽ chữ" value={p.renderSource}
              options={[{ value: 'layer', label: 'Layer (chính xác)' }, { value: 'ai', label: 'AI vẽ (có thể sai chính tả)' }]}
              onChange={(renderSource) => set<'text-layer'>({ renderSource })} />
          )}
          <NumberField label="Cỡ chữ (px, cạnh ngắn 1080)" value={p.style.fontSizePx} min={1} max={400}
            onChange={(fontSizePx) => set<'text-layer'>({ style: { ...p.style, fontSizePx } })} />
          <NumberField label="Cỡ chữ tối thiểu khi co" value={p.minFontSizePx} min={1} max={400}
            onChange={(minFontSizePx) => set<'text-layer'>({ minFontSizePx })} />
          <TextField label="Màu chữ" value={p.style.fill.color} placeholder="#RRGGBB"
            onChange={(color) => set<'text-layer'>({ style: { ...p.style, fill: { kind: 'solid', color } } })} />
          <SelectField label="Căn lề" value={p.style.align}
            options={[{ value: 'left', label: 'Trái' }, { value: 'center', label: 'Giữa' }, { value: 'right', label: 'Phải' }]}
            onChange={(align) => set<'text-layer'>({ style: { ...p.style, align } })} />
        </>
      );
    }
    case 'brand-kit': {
      const p = node.params as NodeParamsMap['brand-kit'];
      return (
        <>
          <TextField label="Màu thương hiệu" value={p.colors.join(', ')} placeholder="#0068FF, #FFFFFF"
            hint="Mã màu, cách nhau bằng dấu phẩy."
            onChange={(v) => set<'brand-kit'>({ colors: v.split(',').map((c) => c.trim()).filter(Boolean) })} />
          <TextField label="Font ưu tiên" value={p.fontPreference ?? ''}
            onChange={(fontPreference) => set<'brand-kit'>({ fontPreference: fontPreference || undefined })} />
          <TextField label="Vị trí logo" value={p.logoPosition ?? ''} placeholder="vd. góc trên trái"
            onChange={(logoPosition) => set<'brand-kit'>({ logoPosition: logoPosition || undefined })} />
        </>
      );
    }
    case 'ratio':
      return <RatioEditor node={node as FlowNode<'ratio'>} />;
    case 'style': {
      const p = node.params as NodeParamsMap['style'];
      return (
        <>
          <SelectField label="Phong cách" value={p.style} options={STYLE_OPTIONS} onChange={(style) => set<'style'>({ style })} />
          <SelectField label="Mood" value={p.mood} options={MOOD_OPTIONS} onChange={(mood) => set<'style'>({ mood })} />
          <SelectField label="Bảng màu" value={p.colorPalette} options={PALETTE_OPTIONS}
            onChange={(colorPalette) => set<'style'>({ colorPalette })} />
          <SelectField label="Kiểu chữ" value={p.fontStyle} options={FONT_STYLE_OPTIONS}
            onChange={(fontStyle) => set<'style'>({ fontStyle })} />
        </>
      );
    }
    case 'auto-layout': {
      const p = node.params as NodeParamsMap['auto-layout'];
      const n = Object.keys(p.overrides).length;
      return <p className={styles['flow-studio__hint']}>
        {n ? `Có chỉnh tay ở ${n} kích thước.` : 'Tự động. Chỉnh tay vị trí từng phần tử được thêm ở bước 4.'}
      </p>;
    }
    case 'generate-background': {
      const p = node.params as NodeParamsMap['generate-background'];
      return (
        <>
          <SelectField label="Model" value={p.model} options={MODEL_OPTIONS} onChange={(model) => set<'generate-background'>({ model })} />
          <NumberField label="Hướng sáng (độ)" value={p.lightDirectionDeg} min={0} max={359}
            hint="315 = trên-trái. Bóng tự động của sản phẩm đổ theo hướng này."
            onChange={(lightDirectionDeg) => set<'generate-background'>({ lightDirectionDeg })} />
          <CheckboxField label="Cấm chữ trên nền" checked={p.strictNoText}
            onChange={(strictNoText) => set<'generate-background'>({ strictNoText })} />
        </>
      );
    }
    case 'generate-flat': {
      const p = node.params as NodeParamsMap['generate-flat'];
      return (
        <>
          <SelectField label="Model" value={p.model} options={MODEL_OPTIONS} onChange={(model) => set<'generate-flat'>({ model })} />
          <CheckboxField label="Giữ nguyên chủ thể upload" checked={p.strictPreserveMode}
            hint="Hạn chế sửa sản phẩm/logo; AI chủ yếu thêm nền, ánh sáng."
            onChange={(strictPreserveMode) => set<'generate-flat'>({ strictPreserveMode })} />
        </>
      );
    }
    case 'compose': {
      const p = node.params as NodeParamsMap['compose'];
      const s = p.shadow;
      return (
        <>
          <SelectField label="Bóng sản phẩm" value={s.mode}
            options={[{ value: 'auto', label: 'Tự động' }, { value: 'custom', label: 'Tuỳ chỉnh' }, { value: 'off', label: 'Tắt' }]}
            onChange={(mode) => set<'compose'>({ shadow: { ...s, mode } })} />
          {s.mode === 'custom' && (
            <>
              <NumberField label="Độ đậm (0–1)" value={s.opacity} min={0} max={1} step={0.05}
                onChange={(opacity) => set<'compose'>({ shadow: { ...s, opacity } })} />
              <NumberField label="Độ nhoè (px)" value={s.blurPx} min={0} max={200}
                onChange={(blurPx) => set<'compose'>({ shadow: { ...s, blurPx } })} />
              <NumberField label="Lệch ngang (px)" value={s.offsetX} min={-500} max={500}
                onChange={(offsetX) => set<'compose'>({ shadow: { ...s, offsetX } })} />
              <NumberField label="Lệch dọc (px)" value={s.offsetY} min={-500} max={500}
                onChange={(offsetY) => set<'compose'>({ shadow: { ...s, offsetY } })} />
            </>
          )}
        </>
      );
    }
    case 'export': {
      const p = node.params as NodeParamsMap['export'];
      return (
        <>
          <SelectField label="Định dạng" value={p.format}
            options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }]}
            onChange={(format) => set<'export'>({ format })} />
          {p.format === 'jpg' && (
            <NumberField label="Chất lượng (%)" value={Math.round(p.quality * 100)} min={10} max={100}
              onChange={(q) => set<'export'>({ quality: q / 100 })} />
          )}
          <SelectField label="Tỉ lệ xuất" value={String(p.scale) as '1' | '2'}
            options={[{ value: '1', label: '1x' }, { value: '2', label: '2x' }]}
            onChange={(v) => set<'export'>({ scale: v === '2' ? 2 : 1 })} />
          <RunResults exportParams={p} />
        </>
      );
    }
  }
}

function RatioEditor({ node }: { node: FlowNode<'ratio'> }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const { ratios } = node.params;
  const used = new Set(ratios.map((r) => r.id));

  const add = (presetId: string | null) => {
    const preset = presetId ? getPresetById(presetId) : undefined;
    if (!preset || used.has(preset.id)) return;
    update<'ratio'>(node.id, { ratios: [...ratios, { id: preset.id, ...presetToCanvasConfig(preset) }] });
  };

  return (
    <>
      <ul className={styles['inspector__list']}>
        {ratios.map((r) => (
          <li key={r.id} className={styles['inspector__list-item']}>
            <span>{r.name} <span className={styles['flow-studio__hint']}>{r.width}×{r.height}</span></span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bỏ ${r.name}`}
              disabled={ratios.length === 1}
              onClick={() => update<'ratio'>(node.id, { ratios: ratios.filter((x) => x.id !== r.id) })}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Select value={null} onValueChange={(v) => add(v as string | null)}>
        <SelectTrigger className="h-9 w-full min-w-0" aria-label="Thêm kích thước">
          <Plus className="size-4" aria-hidden />
          <SelectValue placeholder="Thêm kích thước" />
        </SelectTrigger>
        <SelectContent className="max-h-72" alignItemWithTrigger={false}>
          {CANVAS_PRESET_GROUPS.map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.presets.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={used.has(p.id)}>
                  {p.name} ({p.width}×{p.height})
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function Inspector({ node }: { node: FlowNode | null }) {
  const graph = useFlowStore((s) => s.graph);
  const issues = useMemo(
    () => (node ? validateGraph(graph).filter((i) => i.nodeId === node.id) : []),
    [graph, node],
  );

  return (
    <aside className={styles['flow-studio__panel']} aria-label="Inspector">
      {!node ? (
        <>
          <h2 className={styles['flow-studio__panel-title']}>Inspector</h2>
          <p className={styles['flow-studio__hint']}>Chọn một node để chỉnh thông số.</p>
        </>
      ) : (
        <>
          <h2 className={styles['flow-studio__panel-title']}>{NODE_DEFINITIONS[node.type].label}</h2>
          {issues.length > 0 && (
            <ul className={styles['inspector__issues']} aria-label="Vấn đề của node">
              {issues.map((i, k) => (
                <li key={k} className={styles[`inspector__issue--${i.severity}`]}>{i.message}</li>
              ))}
            </ul>
          )}
          <div className={styles['inspector__body']}>
            <NodeEditor node={node} />
          </div>
        </>
      )}
    </aside>
  );
}
