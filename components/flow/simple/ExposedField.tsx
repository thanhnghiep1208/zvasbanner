'use client';

import { Input } from '@/components/ui/input';
import { isHexColor } from '@/lib/flow/brand';
import type { FlowNode, NodeParamsMap } from '@/lib/flow/schema';
import { getExposedValue, type ExposedParam } from '@/lib/flow/template/template';
import { useFlowStore } from '@/store/flow-store';
import { AssetEditor } from '../inspector/AssetEditor';
import {
  CheckboxField, ColorField, Field, NumberField, SelectField, TextAreaField, ToggleGroupField,
} from '../inspector/fields';
import { RatioEditor } from '../inspector/Inspector';

const EMPTY: string[] = [];

/**
 * 1 field Simple view (T5.2) – vẽ theo `control`, ghi thẳng vào graph qua store.setExposed.
 * Dùng lại field của Inspector để hai view nhập liệu giống hệt nhau.
 */
export function ExposedField({ e }: { e: ExposedParam }) {
  const graph = useFlowStore((s) => s.graph);
  const setExposed = useFlowStore((s) => s.setExposed);
  const brandColors = useFlowStore((s) => {
    const b = s.graph.nodes.find((n) => n.type === 'brand-kit');
    return b ? (b.params as NodeParamsMap['brand-kit']).colors : EMPTY;
  }).filter(isHexColor);
  const node = graph.nodes.find((n) => n.id === e.nodeId);
  if (!node) return null;

  const value = getExposedValue(graph, e);
  const set = (v: unknown) => setExposed(e, v);
  const label = e.required ? `${e.label} *` : e.label;
  const options = e.options ?? [];

  switch (e.control) {
    case 'text':
      return (
        <Field label={label} hint={e.hint}>
          {(id) => <Input id={id} value={String(value ?? '')} placeholder={e.placeholder} onChange={(ev) => set(ev.target.value)} />}
        </Field>
      );
    case 'textarea':
      return <TextAreaField label={label} value={String(value ?? '')} placeholder={e.placeholder} onChange={set} />;
    case 'number':
      return <NumberField label={label} value={Number(value)} hint={e.hint} onChange={set} />;
    case 'checkbox':
      return <CheckboxField label={label} checked={Boolean(value)} hint={e.hint} onChange={set} />;
    case 'color':
      return <ColorField label={label} value={String(value ?? '#000000')} swatches={brandColors} onChange={set} />;
    case 'select':
      return <SelectField label={label} value={String(value ?? '')} options={options} hint={e.hint} onChange={set} />;
    case 'chips':
      return <ToggleGroupField label={label} values={(value as string[]) ?? []} options={options} onChange={set} />;
    case 'asset': {
      const roles = node.type === 'product-asset' ? (['image', 'logo', 'decoration'] as const) : (['style-reference', 'background'] as const);
      return (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-xs font-medium">{label}</legend>
          <AssetEditor nodeId={node.id} params={node.params as NodeParamsMap['product-asset']} roles={roles} />
          {e.hint && <p className="text-xs text-muted-foreground">{e.hint}</p>}
        </fieldset>
      );
    }
    case 'ratios':
      return (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-xs font-medium">{label}</legend>
          <RatioEditor node={node as FlowNode<'ratio'>} />
        </fieldset>
      );
  }
}
