'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NODE_DEFINITIONS, type NodeKind } from '@/lib/flow/node-definitions';
import type { NodeType } from '@/lib/flow/schema';
import { KIND_LABELS } from './flow-styles';
import { NodeIconChip } from './nodes/FlowNodeCard';

/** MIME riêng cho kéo thả node từ thư viện vào canvas. */
export const NODE_DRAG_MIME = 'application/x-zvas-flow-node';

const KINDS: NodeKind[] = ['input', 'config', 'layout', 'executor', 'output'];
const TYPES = Object.keys(NODE_DEFINITIONS) as NodeType[];

/** Bỏ dấu tiếng Việt để tìm "sinh nen" vẫn ra "Sinh nền". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function NodeLibrary({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  const visible = useMemo(
    () => TYPES.filter((t) => !q || fold(`${NODE_DEFINITIONS[t].label} ${NODE_DEFINITIONS[t].description}`).includes(q)),
    [q],
  );

  const onDragStart = (e: DragEvent, type: NodeType) => {
    e.dataTransfer.setData(NODE_DRAG_MIME, type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-3">
        <div>
          <h2 className="text-sm font-semibold">Thư viện node</h2>
          <p className="text-xs text-muted-foreground">Kéo vào canvas, hoặc bấm để thêm vào giữa màn hình.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm node"
            aria-label="Tìm node"
            className="h-8 pl-8"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {KINDS.map((kind) => {
          const items = visible.filter((t) => NODE_DEFINITIONS[t].kind === kind);
          if (!items.length) return null;
          return (
            <section key={kind} aria-labelledby={`lib-${kind}`}>
              <h3 id={`lib-${kind}`} className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {KIND_LABELS[kind]}
              </h3>
              <ul className="space-y-1">
                {items.map((type) => {
                  const def = NODE_DEFINITIONS[type];
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => onDragStart(e, type)}
                        onClick={() => onAdd(type)}
                        className="group flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
                      >
                        <NodeIconChip type={type} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{def.label}</span>
                            {def.aiCallsPerRatio > 0 && (
                              <span
                                className="shrink-0 rounded-full bg-node-executor/12 px-1.5 text-[10px] leading-4 font-medium text-node-executor"
                                title={`${def.aiCallsPerRatio} lần gọi AI mỗi kích thước`}
                              >
                                AI ×{def.aiCallsPerRatio}
                              </span>
                            )}
                          </span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">{def.description}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {!visible.length && <p className="px-1 text-xs text-muted-foreground">Không có node khớp “{query}”.</p>}
      </div>
    </div>
  );
}
