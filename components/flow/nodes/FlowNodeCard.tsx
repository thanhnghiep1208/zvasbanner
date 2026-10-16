'use client';

import { createContext, memo, useContext, useMemo } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
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
  TriangleAlert,
  Type,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NODE_DEFINITIONS, PORT_TYPE_LABELS, type PortDef } from '@/lib/flow/node-definitions';
import { RUN_STATE_LABELS } from '@/lib/flow/run-state';
import type { FlowNode, NodeParamsMap, NodeType, PortType } from '@/lib/flow/schema';
import type { FlowRFNode } from '@/lib/flow-ui/rf-adapter';
import { summarizeNode } from '@/lib/flow-ui/node-summary';
import { checkConnection } from '@/lib/flow-ui/connection-feedback';
import { ASSET_UNCONNECTED_MESSAGE } from '@/lib/flow/validate';
import { useFlowStore } from '@/store/flow-store';
import { KIND_CHIP, PORT_HANDLE, RUN_BORDER, RUN_DOT, RUN_PILL } from '../flow-styles';
import { nodeDetails, type NodeDetails } from './node-details';
import { RatioShape } from '../RatioShape';

type AssetParams = { assetId: string; url: string; fileName: string };

/** Nội dung chữ đầy đủ + tuỳ chọn đã chọn (node-details.ts). Không cắt: card cao theo nội dung. */
function DetailsBlock({ details }: { details: NodeDetails }) {
  const hasText = details.text !== undefined;
  if (!hasText && !details.chips.length) return null;
  return (
    <div className="flex flex-col gap-2 border-t px-3 py-2">
      {hasText && (
        <p className={cn('text-xs leading-snug break-words whitespace-pre-wrap', !details.text && 'text-muted-foreground italic')}>
          {details.text || '(trống)'}
        </p>
      )}
      {details.chips.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Tuỳ chọn">
          {details.chips.map((c, i) => (
            <li key={i} className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
              {c.swatch && <span className="size-2.5 shrink-0 rounded-sm border" style={{ background: c.swatch }} aria-hidden />}
              <span className="truncate">{c.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Node Kích thước: liệt kê đủ mọi kích thước (header chỉ có chỗ cho 1). Hình chữ nhật nhỏ theo đúng tỉ lệ để nhận ra
 * ngang/dọc/vuông. Kích thước bị bỏ chọn ở node Xuất ảnh (T4.6) hiện mờ + "không xuất".
 */
function RatioList({ ratios }: { ratios: NodeParamsMap['ratio']['ratios'] }) {
  const exportIds = useFlowStore((s) => {
    const ex = s.graph.nodes.find((n) => n.type === 'export');
    return ex ? (ex.params as NodeParamsMap['export']).ratioIds : 'all';
  });
  if (!ratios.length) return null;
  return (
    <ul className="flex flex-col gap-1 border-t px-3 py-2" aria-label="Các kích thước">
      {ratios.map((r) => {
        const exported = exportIds === 'all' || exportIds.includes(r.id);
        return (
          <li key={r.id} className={cn('flex items-center gap-2 text-xs', !exported && 'opacity-50')}>
            <RatioShape width={r.width} height={r.height} className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {r.width}×{r.height}{!exported && ' · không xuất'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

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

/** Trạng thái ô nối khi đang kéo dây: nối được (phóng to + nhấp nháy) / không nối được (mờ). */
type Candidate = 'valid' | 'invalid' | undefined;

function PortRow({ port, direction, candidate }: {
  port: { id: string; type: PortType } & Partial<PortDef>;
  direction: 'in' | 'out';
  candidate: Candidate;
}) {
  const isIn = direction === 'in';
  const marks = `${port.required ? ' (bắt buộc)' : ''}${port.multiple ? ' (nhiều kết nối)' : ''}`;
  return (
    <li className={cn('flow-port-row relative flex h-6 items-center px-3 text-xs', !isIn && 'justify-end')}>
      <Handle
        type={isIn ? 'target' : 'source'}
        position={isIn ? Position.Left : Position.Right}
        id={port.id}
        className={cn(
          PORT_HANDLE[port.type],
          candidate === 'valid' && 'flow-handle-candidate',
          candidate === 'invalid' && 'flow-handle-dim',
        )}
        aria-label={`${isIn ? 'Input' : 'Output'} ${PORT_TYPE_LABELS[port.type]}${marks}`}
      />
      <span className={cn(
        'flow-port-label inline-flex items-center gap-1 text-muted-foreground transition-colors',
        candidate === 'valid' && 'font-medium text-foreground',
        candidate === 'invalid' && 'opacity-40',
      )}>
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
  const domainNode = { id, type, params: data.params, position: { x: 0, y: 0 } } as FlowNode;
  const summary = summarizeNode(domainNode);
  const details = nodeDetails(domainNode);
  const { onRetry } = useContext(FlowNodeActionsContext);
  // Đang kéo dây: chuỗi primitive để node chỉ render lại khi bắt đầu/kết thúc kéo, không phải mỗi lần chuột di chuyển.
  const dragging = useConnection((c) =>
    c.inProgress && c.fromHandle?.id ? `${c.fromNode.id}|${c.fromHandle.id}|${c.fromHandle.type}` : null);
  const candidates = useMemo(() => portCandidates(dragging, id, type), [dragging, id, type]);
  const isImage = type === 'product-asset' || type === 'reference-image';
  // Ảnh chưa có dây ra → viền vàng + nhắc ngay trên node (cùng cảnh báo asset-unconnected của validate).
  const unconnected = useFlowStore((s) => isImage && !s.graph.edges.some((e) => e.source === id));

  return (
    <div
      className={cn(
        'relative w-64 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow',
        'hover:shadow-md',
        RUN_BORDER[run.state],
        unconnected && run.state === 'idle' && 'border-run-stale',
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

      {details && <DetailsBlock details={details} />}

      {(def.inputs.length > 0 || def.outputs.length > 0) && (
        <ul className="border-t py-1.5">
          {def.inputs.map((p) => <PortRow key={`in-${p.id}`} port={p} direction="in" candidate={candidates?.[`in:${p.id}`]} />)}
          {def.outputs.map((p) => <PortRow key={`out-${p.id}`} port={p} direction="out" candidate={candidates?.[`out:${p.id}`]} />)}
        </ul>
      )}

      {unconnected && (
        <p className="mx-3 mb-2 flex gap-1.5 rounded-lg bg-run-stale/15 p-2 text-xs text-foreground" role="status">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-run-stale" aria-hidden />
          <span>{ASSET_UNCONNECTED_MESSAGE} Kéo dây từ ô ra bên phải vào node cần dùng ảnh.</span>
        </p>
      )}
      {isImage && <AssetThumb params={data.params as AssetParams} />}
      {type === 'ratio' && <RatioList ratios={(data.params as NodeParamsMap['ratio']).ratios} />}

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

/**
 * Khi đang kéo dây từ ô `dragging` ("nodeId|handleId|source|target"): ô nào của node này nối được (luật canConnect,
 * T2.2 – cùng luật với isValidConnection). Ô cùng chiều với ô đang kéo, hoặc ô trên chính node đó → không nối được.
 */
function portCandidates(dragging: string | null, nodeId: string, type: NodeType): Record<string, Candidate> | null {
  if (!dragging) return null;
  const [fromNode, fromHandle, fromType] = dragging.split('|') as [string, string, 'source' | 'target'];
  const def = NODE_DEFINITIONS[type];
  const graph = useFlowStore.getState().graph;
  const out: Record<string, Candidate> = {};
  for (const p of def.inputs) {
    if (fromNode === nodeId && fromType === 'target' && p.id === fromHandle) continue; // ô đang kéo
    out[`in:${p.id}`] = fromType === 'source' && checkConnection(graph,
      { source: fromNode, sourceHandle: fromHandle, target: nodeId, targetHandle: p.id }).ok ? 'valid' : 'invalid';
  }
  for (const p of def.outputs) {
    if (fromNode === nodeId && fromType === 'source' && p.id === fromHandle) continue;
    out[`out:${p.id}`] = fromType === 'target' && checkConnection(graph,
      { source: nodeId, sourceHandle: p.id, target: fromNode, targetHandle: fromHandle }).ok ? 'valid' : 'invalid';
  }
  return out;
}

export const FlowNodeCard = memo(FlowNodeCardImpl);

/** nodeTypes cho <ReactFlow>: mọi NodeType dùng chung FlowNodeCard. Khai báo ngoài component để ổn định. */
export const FLOW_NODE_TYPES = Object.fromEntries(
  (Object.keys(NODE_DEFINITIONS) as NodeType[]).map((t) => [t, FlowNodeCard]),
) as Record<NodeType, typeof FlowNodeCard>;
