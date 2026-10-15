'use client';

import { createContext, memo, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  CircleAlert,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Package,
  Palette,
  Paintbrush,
  Proportions,
  RotateCcw,
  Sparkles,
  Type,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { NODE_DEFINITIONS, PORT_TYPE_LABELS, type PortDef } from '@/lib/flow/node-definitions';
import { RUN_STATE_LABELS } from '@/lib/flow/run-state';
import type { FlowNode, NodeType, PortType } from '@/lib/flow/schema';
import type { FlowRFNode } from '@/lib/flow-ui/rf-adapter';
import { summarizeNode } from '@/lib/flow-ui/node-summary';
import styles from './flow-node-card.module.css';

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  'product-asset': Package,
  'reference-image': ImageIcon,
  'brief': FileText,
  'text-layer': Type,
  'brand-kit': Palette,
  'ratio': Proportions,
  'style': Paintbrush,
  'auto-layout': LayoutTemplate,
  'generate-background': Sparkles,
  'generate-flat': WandSparkles,
  'compose': Layers,
  'export': Download,
};

/** Hành động tại node do canvas cung cấp (executor gắn ở T2.6). Không có → ẩn nút. */
export const FlowNodeActionsContext = createContext<{ onRetry?: (nodeId: string) => void }>({});

function portAriaLabel(direction: 'Input' | 'Output', port: { type: PortType }, extra = '') {
  return `${direction} ${PORT_TYPE_LABELS[port.type]}${extra}`;
}

function InputRow({ port }: { port: PortDef }) {
  const marks = `${port.required ? ' (bắt buộc)' : ''}${port.multiple ? ' (nhiều kết nối)' : ''}`;
  return (
    <li className={styles['flow-node__port']}>
      <Handle
        type="target"
        position={Position.Left}
        id={port.id}
        className={`${styles['flow-node__handle']} ${styles[`flow-node__handle--${port.type}`]}`}
        aria-label={portAriaLabel('Input', port, marks)}
      />
      <span className={styles['flow-node__port-label']}>
        {PORT_TYPE_LABELS[port.type]}
        {port.required && <span className={styles['flow-node__required']} aria-hidden>*</span>}
        {port.multiple && <span className={styles['flow-node__multiple']} aria-hidden>+</span>}
      </span>
    </li>
  );
}

function OutputRow({ port }: { port: { id: string; type: PortType } }) {
  return (
    <li className={`${styles['flow-node__port']} ${styles['flow-node__port--output']}`}>
      <span className={styles['flow-node__port-label']}>{PORT_TYPE_LABELS[port.type]}</span>
      <Handle
        type="source"
        position={Position.Right}
        id={port.id}
        className={`${styles['flow-node__handle']} ${styles[`flow-node__handle--${port.type}`]}`}
        aria-label={portAriaLabel('Output', port)}
      />
    </li>
  );
}

function FlowNodeCardImpl({ id, type, data, selected }: NodeProps<FlowRFNode>) {
  const def = NODE_DEFINITIONS[type];
  const Icon = NODE_ICONS[type];
  const run = data.run ?? { state: 'idle' as const };
  const summary = summarizeNode({ id, type, params: data.params, position: { x: 0, y: 0 } } as FlowNode);
  const { onRetry } = useContext(FlowNodeActionsContext);

  return (
    <div
      className={[
        styles['flow-node'],
        styles[`flow-node--${def.kind}`],
        styles[`flow-node--${run.state}`],
        selected ? styles['flow-node--selected'] : '',
      ].join(' ')}
      aria-busy={run.state === 'running' || undefined}
    >
      <header className={styles['flow-node__header']}>
        <Icon className={styles['flow-node__icon']} aria-hidden />
        <span className={styles['flow-node__title']}>{def.label}</span>
        {run.state !== 'idle' && (
          <span className={styles['flow-node__status']} role="status">
            {RUN_STATE_LABELS[run.state]}
          </span>
        )}
      </header>

      {summary && <p className={styles['flow-node__summary']} title={summary}>{summary}</p>}

      {(def.inputs.length > 0 || def.outputs.length > 0) && (
        <ul className={styles['flow-node__ports']}>
          {def.inputs.map((p) => <InputRow key={`in-${p.id}`} port={p} />)}
          {def.outputs.map((p) => <OutputRow key={`out-${p.id}`} port={p} />)}
        </ul>
      )}

      {run.state === 'error' && (
        <div className={styles['flow-node__error']} role="alert">
          <CircleAlert className={styles['flow-node__icon']} aria-hidden />
          <span>{run.message ?? 'Chạy node thất bại.'}</span>
          {onRetry && (
            <button
              type="button"
              className={`nodrag ${styles['flow-node__retry']}`}
              onClick={() => onRetry(id)}
            >
              <RotateCcw className={styles['flow-node__icon']} aria-hidden />
              Thử lại
            </button>
          )}
        </div>
      )}

      {run.state === 'done' && run.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- data/blob URL, không qua next/image
        <img className={styles['flow-node__preview']} src={run.previewUrl} alt={`Kết quả ${def.label}`} />
      )}
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardImpl);

/** nodeTypes cho <ReactFlow>: mọi NodeType dùng chung FlowNodeCard. Khai báo ngoài component để ổn định. */
export const FLOW_NODE_TYPES = Object.fromEntries(
  (Object.keys(NODE_DEFINITIONS) as NodeType[]).map((t) => [t, FlowNodeCard]),
) as Record<NodeType, typeof FlowNodeCard>;
