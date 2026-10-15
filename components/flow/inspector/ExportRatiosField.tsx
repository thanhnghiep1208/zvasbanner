'use client';

import { useId } from 'react';
import type { NodeParamsMap, RatioSpec } from '@/lib/flow/schema';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import { useFlowStore } from '@/store/flow-store';

const EMPTY: RatioSpec[] = [];

/**
 * Chọn kích thước xuất (T4.6). Chỉ kích thước được chọn mới được sinh → số lượt AI giảm theo.
 * "Tất cả" lưu 'all' để kích thước thêm sau vào node Kích thước tự được xuất.
 */
export function ExportRatiosField({ nodeId, p }: { nodeId: string; p: NodeParamsMap['export'] }) {
  const update = useFlowStore((s) => s.updateNodeParams);
  const ratios = useFlowStore((s) => {
    const n = s.graph.nodes.find((x) => x.type === 'ratio');
    return n ? (n.params as NodeParamsMap['ratio']).ratios : EMPTY;
  });
  // Lượt AI / kích thước của executor đang nối vào Xuất ảnh (flat 2, composed 1).
  const perRatio = useFlowStore((s) => {
    const execTypes = ['generate-flat', 'generate-background'] as const;
    const t = execTypes.find((type) => s.graph.nodes.some((n) => n.type === type));
    return t ? NODE_DEFINITIONS[t].aiCallsPerRatio : 0;
  });
  const allId = useId();
  const set = (ratioIds: NodeParamsMap['export']['ratioIds']) => update<'export'>(nodeId, { ratioIds });

  const all = p.ratioIds === 'all';
  const selected = new Set(p.ratioIds === 'all' ? ratios.map((r) => r.id) : p.ratioIds);
  const count = ratios.filter((r) => selected.has(r.id)).length;
  const missing = p.ratioIds === 'all' ? [] : p.ratioIds.filter((id) => !ratios.some((r) => r.id === id));

  const toggle = (id: string, on: boolean) => {
    const next = ratios.map((r) => r.id).filter((x) => (x === id ? on : selected.has(x)));
    set(next.length === ratios.length ? 'all' : next);
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <legend className="px-1 text-xs font-medium">Kích thước xuất</legend>
      {ratios.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có node Kích thước.</p>
      ) : (
        <>
          <label htmlFor={allId} className="flex items-center gap-2 text-sm font-medium">
            <input id={allId} type="checkbox" checked={all}
              onChange={(e) => set(e.target.checked ? 'all' : ratios.slice(0, 1).map((r) => r.id))} />
            Tất cả ({ratios.length})
          </label>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 pl-6">
            {ratios.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{r.width}×{r.height}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Sinh {count} ảnh{perRatio ? ` · ~${count * perRatio} lượt AI` : ''}.
          </p>
          {missing.length > 0 && (
            <p className="text-xs text-destructive">Đã xoá khỏi node Kích thước: {missing.join(', ')}.</p>
          )}
        </>
      )}
    </fieldset>
  );
}
