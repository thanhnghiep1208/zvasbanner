'use client';

import type { FlowGraph, NodeParamsMap } from '@/lib/flow/schema';
import { autoStyleContextFromGraph, autoTypography } from '@/lib/flow/text/auto-style';
import { useFlowStore } from '@/store/flow-store';
import { SelectField } from '../inspector/fields';

type Mode = 'auto' | 'manual';

/** Bật/tắt "tự động theo banner" cho mọi text layer (trừ tiêu đề AI vẽ). Tắt → giữ đúng kiểu đang tự động để chỉnh tiếp. */
function setMode(graph: FlowGraph, mode: Mode): FlowGraph {
  const ctx = autoStyleContextFromGraph(graph);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.type !== 'text-layer') return n;
      const p = n.params as NodeParamsMap['text-layer'];
      if (p.renderSource === 'ai') return n;
      if (mode === 'auto') return p.autoStyle ? n : { ...n, params: { ...p, autoStyle: true } };
      if (!p.autoStyle) return n;
      const r = autoTypography(p, ctx);
      return { ...n, params: { ...p, autoStyle: false, style: r.style, minFontSizePx: r.minFontSizePx } };
    }),
  };
}

/** Simple view: 1 lựa chọn cho cả banner – chữ tự hợp với phong cách/nền, hay tự chỉnh màu/cỡ. */
export function TextStyleModeField() {
  const texts = useFlowStore((s) => s.graph.nodes.filter((n) => n.type === 'text-layer'
    && (n.params as NodeParamsMap['text-layer']).renderSource !== 'ai').map((n) => Boolean((n.params as NodeParamsMap['text-layer']).autoStyle)).join());
  const editGraph = useFlowStore((s) => s.editGraph);
  if (!texts) return null;
  const mode: Mode = texts.split(',').every((v) => v === 'true') ? 'auto' : 'manual';
  return (
    <SelectField
      label="Kiểu chữ"
      value={mode}
      options={[{ value: 'auto', label: 'Tự động theo banner' }, { value: 'manual', label: 'Chỉnh tay' }]}
      hint={mode === 'auto'
        ? 'Font và cỡ theo phong cách; màu chữ, bóng, nút chọn theo nền thật để luôn dễ đọc.'
        : 'Tự đặt màu/cỡ ở các ô bên dưới hoặc trong canvas.'}
      onChange={(m) => editGraph((g) => setMode(g, m as Mode))}
    />
  );
}
