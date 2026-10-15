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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NODE_DEFINITIONS, PORT_TYPE_LABELS, type PortDef } from '@/lib/flow/node-definitions';
import { RUN_STATE_LABELS } from '@/lib/flow/run-state';
import type { FlowNode, NodeType, PortType } from '@/lib/flow/schema';
import type { FlowRFNode } from '@/lib/flow-ui/rf-adapter';
import { summarizeNode } from '@/lib/flow-ui/node-summary';
import { useFlowStore } from '@/store/flow-store';
import { KIND_CHIP, PORT_HANDLE, RUN_BORDER, RUN_DOT, RUN_PILL } from '../flow-styles';

type AssetParams = { assetId: string; url: string; fileName: string };

/**
 * Thumbnail ảnh đã upload trên node Asset / Ảnh tham chiếu. Nguồn: blob URL lúc upload; không có (project mở lại,
 * "Mở trong canvas" từ form) thì dùng ảnh còn trong bộ nhớ. Không còn ảnh → nhắc tải lại.
 */
function AssetThumb({ params }: { params: AssetParams }) {
  const dataUrl = useFlowStore((s) => (params.assetId ? s.assetData[params.assetId] : undefined));
  const src = params.url || dataUrl;
  if (!params.fileName) return null;
  return (
    <div className="px-3 pb-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob/data URL, không qua next/image
        <img
          className="flow-checker block h-28 w-full rounded-lg border object-contain"
          src={src}
          alt={params.fileName}
          draggable={false}
        />
      ) : (
        <p className="rounded-lg border border-dashed px-2 py-3 text-center text-xs text-muted-foreground">
          Cần tải lại ảnh
        </p>
      )}
    </div>
  );
}

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

/** Hành động tại node do canvas cung cấp. Không có → ẩn nút. */
export const FlowNodeActionsContext = createContext<{
  /** Node lỗi: chạy lại từ node này (T4.7). */
  onRetry?: (nodeId: string) => void;
  /** Inspector: "Chạy lại từ node này" – bỏ qua cache cho node + downstream (T4.7). */
  onRunFrom?: (nodeId: string) => void;
  isRunning?: boolean;
}>({});

/** Chip icon vuông theo nhóm node – dùng chung cho card, thư viện, inspector. */
export function NodeIconChip({ type, size = 'md' }: { type: NodeType; size?: 'sm' | 'md' }) {
  const Icon = NODE_ICONS[type];
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md',
        size === 'sm' ? 'size-6 [&>svg]:size-3.5' : 'size-7 [&>svg]:size-4',
        KIND_CHIP[NODE_DEFINITIONS[type].kind],
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}

function PortRow({ port, direction }: { port: { id: string; type: PortType } & Partial<PortDef>; direction: 'in' | 'out' }) {
  const isIn = direction === 'in';
  const marks = `${port.required ? ' (bắt buộc)' : ''}${port.multiple ? ' (nhiều kết nối)' : ''}`;
  return (
    <li className={cn('relative flex h-6 items-center px-3 text-xs', !isIn && 'justify-end')}>
      <Handle
        type={isIn ? 'target' : 'source'}
        position={isIn ? Position.Left : Position.Right}
        id={port.id}
        className={PORT_HANDLE[port.type]}
        aria-label={`${isIn ? 'Input' : 'Output'} ${PORT_TYPE_LABELS[port.type]}${marks}`}
      />
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {PORT_TYPE_LABELS[port.type]}
        {port.required && <span className="text-destructive" aria-hidden>*</span>}
        {port.multiple && (
          <span className="rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground" aria-hidden>
            nhiều
          </span>
        )}
      </span>
    </li>
  );
}

function FlowNodeCardImpl({ id, type, data, selected }: NodeProps<FlowRFNode>) {
  const def = NODE_DEFINITIONS[type];
  const run = data.run ?? { state: 'idle' as const };
  const summary = summarizeNode({ id, type, params: data.params, position: { x: 0, y: 0 } } as FlowNode);
  const { onRetry } = useContext(FlowNodeActionsContext);

  return (
    <div
      className={cn(
        'relative w-64 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow',
        'hover:shadow-md',
        RUN_BORDER[run.state],
        selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
      aria-busy={run.state === 'running' || undefined}
    >
      {run.state === 'running' && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-run-running/20" aria-hidden>
          <div className="flow-shimmer h-full w-1/3 bg-run-running" />
        </div>
      )}

      <header className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <NodeIconChip type={type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-5 font-semibold">{def.label}</p>
          <p className="truncate text-xs text-muted-foreground" title={summary ?? def.description}>
            {summary ?? def.description}
          </p>
        </div>
        {run.state !== 'idle' && (
          <span
            className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', RUN_PILL[run.state])}
            role="status"
          >
            <span className={cn('size-1.5 rounded-full', RUN_DOT[run.state])} aria-hidden />
            {RUN_STATE_LABELS[run.state]}
          </span>
        )}
      </header>

      {(def.inputs.length > 0 || def.outputs.length > 0) && (
        <ul className="border-t py-1.5">
          {def.inputs.map((p) => <PortRow key={`in-${p.id}`} port={p} direction="in" />)}
          {def.outputs.map((p) => <PortRow key={`out-${p.id}`} port={p} direction="out" />)}
        </ul>
      )}

      {(type === 'product-asset' || type === 'reference-image') && <AssetThumb params={data.params as AssetParams} />}

      {run.state === 'error' && (
        <div className="mx-3 mb-3 flex flex-col gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive" role="alert">
          <p className="flex gap-1.5">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-4">{run.message ?? 'Chạy node thất bại.'}</span>
          </p>
          {onRetry && (
            <Button type="button" size="xs" variant="outline" className="nodrag self-end" onClick={() => onRetry(id)}>
              <RotateCcw aria-hidden />
              Thử lại
            </Button>
          )}
        </div>
      )}

      {run.previewUrl && (run.state === 'done' || run.state === 'running' || run.state === 'error') && (
        <div className="px-3 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data/blob URL, không qua next/image */}
          <img
            className="block max-h-48 w-full rounded-lg border bg-muted object-contain"
            src={run.previewUrl}
            alt={`Kết quả ${def.label}`}
          />
        </div>
      )}
    </div>
  );
}

export const FlowNodeCard = memo(FlowNodeCardImpl);

/** nodeTypes cho <ReactFlow>: mọi NodeType dùng chung FlowNodeCard. Khai báo ngoài component để ổn định. */
export const FLOW_NODE_TYPES = Object.fromEntries(
  (Object.keys(NODE_DEFINITIONS) as NodeType[]).map((t) => [t, FlowNodeCard]),
) as Record<NodeType, typeof FlowNodeCard>;
