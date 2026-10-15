'use client';

import type { DragEvent } from 'react';
import { NODE_DEFINITIONS, type NodeKind } from '@/lib/flow/node-definitions';
import type { NodeType } from '@/lib/flow/schema';
import { NODE_ICONS } from './nodes/FlowNodeCard';
import styles from './flow-canvas.module.css';

/** MIME riêng cho kéo thả node từ thư viện vào canvas. */
export const NODE_DRAG_MIME = 'application/x-zvas-flow-node';

const GROUPS: { kind: NodeKind; label: string }[] = [
  { kind: 'input', label: 'Đầu vào' },
  { kind: 'config', label: 'Cấu hình' },
  { kind: 'layout', label: 'Layout' },
  { kind: 'executor', label: 'Sinh ảnh (AI)' },
  { kind: 'output', label: 'Đầu ra' },
];

const TYPES = Object.keys(NODE_DEFINITIONS) as NodeType[];

export function NodeLibrary({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const onDragStart = (e: DragEvent, type: NodeType) => {
    e.dataTransfer.setData(NODE_DRAG_MIME, type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className={styles['flow-studio__panel']} aria-label="Thư viện node">
      <h2 className={styles['flow-studio__panel-title']}>Thư viện node</h2>
      <p className={styles['flow-studio__hint']}>Kéo vào canvas, hoặc bấm để thêm vào giữa màn hình.</p>
      {GROUPS.map((g) => (
        <section key={g.kind} className={styles['node-library__group']}>
          <h3 className={styles['node-library__group-title']}>{g.label}</h3>
          <ul className={styles['node-library__list']}>
            {TYPES.filter((t) => NODE_DEFINITIONS[t].kind === g.kind).map((type) => {
              const def = NODE_DEFINITIONS[type];
              const Icon = NODE_ICONS[type];
              return (
                <li key={type}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, type)}
                    onClick={() => onAdd(type)}
                    className={styles['node-library__item']}
                  >
                    <Icon className={styles['node-library__icon']} aria-hidden />
                    <span className={styles['node-library__label']}>{def.label}</span>
                    {def.aiCallsPerRatio > 0 && (
                      <span className={styles['node-library__badge']} title={`${def.aiCallsPerRatio} lần gọi AI mỗi kích thước`}>
                        AI ×{def.aiCallsPerRatio}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}
