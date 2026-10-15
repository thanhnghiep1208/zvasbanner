'use client';

import { useMemo } from 'react';
import { CircleAlert, MousePointerClick, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeIconChip } from '../nodes/FlowNodeCard';
import { canvasMeasurer } from '@/lib/flow-ui/compose-render';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FOCAL_OPTIONS, INTENT_OPTIONS } from '@/components/prompt/MarketingBriefChips';
import { CANVAS_PRESET_GROUPS, getPresetById, presetToCanvasConfig } from '@/lib/canvas-presets';
import { FONT_STYLE_OPTIONS, MOOD_OPTIONS, PALETTE_OPTIONS, STYLE_OPTIONS } from '@/lib/style-options';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { FlowNode, NodeParamsMap, NodeType } from '@/lib/flow/schema';
import { validateGraph } from '@/lib/flow/validate';
import { MODEL_LABELS } from '@/lib/flow-ui/node-summary';
import { useFlowStore } from '@/store/flow-store';
import { AssetEditor } from './AssetEditor';
import { RunResults } from './RunResults';
import { ExportRatiosField } from './ExportRatiosField';
import { TextLayerEditor } from './TextLayerEditor';
import { BrandKitEditor } from './BrandKitEditor';
import {
  CheckboxField, NumberField, SelectField, TextAreaField, ToggleGroupField,
} from './fields';

const MODEL_OPTIONS = (Object.keys(MODEL_LABELS) as (keyof typeof MODEL_LABELS)[])
  .map((value) => ({ value, label: MODEL_LABELS[value] }));

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
    case 'text-layer':
      return <TextLayerEditor nodeId={node.id} p={node.params as NodeParamsMap['text-layer']} />;
    case 'brand-kit':
      return <BrandKitEditor nodeId={node.id} p={node.params as NodeParamsMap['brand-kit']} />;
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
      return <p className="text-xs text-muted-foreground">
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
          <ExportRatiosField nodeId={node.id} p={p} />
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
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {ratios.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{r.name} <span className="text-xs text-muted-foreground">{r.width}×{r.height}</span></span>
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
    () => (node ? validateGraph(graph, { measurer: canvasMeasurer }).filter((i) => i.nodeId === node.id) : []),
    [graph, node],
  );

  if (!node) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <MousePointerClick className="size-5" />
        </span>
        <h2 className="text-sm font-semibold">Chưa chọn node</h2>
        <p className="text-xs text-muted-foreground">Chọn một node trên canvas để chỉnh thông số.</p>
      </div>
    );
  }

  const def = NODE_DEFINITIONS[node.type];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-2.5 border-b p-3">
        <NodeIconChip type={node.type} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{def.label}</h2>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {issues.length > 0 && (
          <ul className="space-y-1.5" aria-label="Vấn đề của node">
            {issues.map((i, k) => (
              <li
                key={k}
                className={cn(
                  'flex gap-1.5 rounded-lg p-2 text-xs',
                  i.severity === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-run-stale/12 text-foreground',
                )}
              >
                {i.severity === 'error'
                  ? <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  : <TriangleAlert className="mt-px size-3.5 shrink-0 text-run-stale" aria-hidden />}
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-4">
          <NodeEditor node={node} />
        </div>
      </div>
    </div>
  );
}
