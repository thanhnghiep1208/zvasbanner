'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow-theme.css';
import { Show, UserButton } from '@clerk/nextjs';
import { CircleAlert, LoaderCircle, MousePointerSquareDashed, PanelLeft, PanelRight, Play, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { REJECT_MESSAGES } from '@/lib/flow/connection-rules';
import { getDefinition, NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { NodeType } from '@/lib/flow/schema';
import { validateGraph } from '@/lib/flow/validate';
import { checkConnection, rejectMessageForConnectionEnd } from '@/lib/flow-ui/connection-feedback';
import { canvasMeasurer } from '@/lib/flow-ui/compose-render';
import {
  freePosition, selectRFEdges, selectRFNodes, selectSingleSelectedNode, useFlowStore,
} from '@/store/flow-store';
import { EDGE_CLASS } from './flow-styles';
import { Inspector } from './inspector/Inspector';
import { NODE_DRAG_MIME, NodeLibrary } from './NodeLibrary';
import { FLOW_NODE_TYPES, FlowNodeActionsContext } from './nodes/FlowNodeCard';
import { useFlowRun } from './use-flow-run';

/** Nửa kích thước node card (w-64) – để căn node mới vào giữa điểm thả. */
const NODE_HALF = { x: 128, y: 40 };

function FlowCanvasInner() {
  const { graph, nodeUi, edgeUi, runInfo, onNodesChange, onEdgesChange, connect, addNode } = useFlowStore(
    useShallow((s) => ({
      graph: s.graph,
      nodeUi: s.nodeUi,
      edgeUi: s.edgeUi,
      runInfo: s.runInfo,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      connect: s.connect,
      addNode: s.addNode,
    })),
  );
  const { screenToFlowPosition, fitView } = useReactFlow();
  const graphVersion = useFlowStore((s) => s.graphVersion);
  const nodesInitialized = useNodesInitialized();
  const fittedVersion = useRef(-1);

  // Nạp graph mới (template, migrate…): chờ RF đo xong node rồi mới canh khít, chỉ 1 lần mỗi version.
  useEffect(() => {
    if (!nodesInitialized || fittedVersion.current === graphVersion) return;
    fittedVersion.current = graphVersion;
    void fitView({ padding: 0.12, maxZoom: 1 });
  }, [nodesInitialized, graphVersion, fitView]);
  const paneRef = useRef<HTMLDivElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { run, isRunning, aiCalls } = useFlowRun();
  const nodeActions = useMemo(() => ({ onRetry: () => void run() }), [run]);

  const nodes = useMemo(() => selectRFNodes(graph, nodeUi, runInfo), [graph, nodeUi, runInfo]);
  // Dây tô theo kiểu port nguồn (flow-theme.css).
  const edges = useMemo(() => {
    const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type] as const));
    return selectRFEdges(graph, edgeUi).map((e) => {
      const nodeType = typeOf.get(e.source);
      const port = nodeType && NODE_DEFINITIONS[nodeType].outputs.find((p) => p.id === e.sourceHandle);
      return port ? { ...e, className: EDGE_CLASS[port.type] } : e;
    });
  }, [graph, edgeUi]);
  const selected = useMemo(() => selectSingleSelectedNode(graph, nodeUi), [graph, nodeUi]);
  // Canvas trống: không báo lỗi "thiếu Export" – chưa có gì để kiểm.
  // Cùng measurer Canvas với lúc chạy để báo "không vừa" khớp kết quả thật.
  const issues = useMemo(() => (graph.nodes.length ? validateGraph(graph, { measurer: canvasMeasurer }) : []), [graph]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const isEmpty = nodes.length === 0;

  // Đọc graph mới nhất từ store: các callback này được gọi liên tục khi đang kéo dây.
  const isValidConnection = useCallback<IsValidConnection>(
    (c: Edge | Connection) => checkConnection(useFlowStore.getState().graph, c).ok,
    [],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const res = connect(c);
      if (!res.ok) toast.error(REJECT_MESSAGES[res.reason]);
    },
    [connect],
  );

  const onConnectEnd = useCallback<OnConnectEnd>((_, state) => {
    const message = rejectMessageForConnectionEnd(useFlowStore.getState().graph, state);
    if (message) toast.error(message);
  }, []);

  const addAt = useCallback(
    (type: NodeType, clientX: number, clientY: number) => {
      const p = screenToFlowPosition({ x: clientX, y: clientY });
      const pos = { x: p.x - NODE_HALF.x, y: p.y - NODE_HALF.y };
      addNode(type, freePosition(useFlowStore.getState().graph, pos));
    },
    [addNode, screenToFlowPosition],
  );

  /** Bấm trong thư viện (chuột hoặc bàn phím) → thêm vào giữa vùng canvas đang nhìn. */
  const onAddFromLibrary = useCallback(
    (type: NodeType) => {
      const r = paneRef.current?.getBoundingClientRect();
      if (!r) return;
      addAt(type, r.left + r.width / 2, r.top + r.height / 2);
      setLibraryOpen(false);
    },
    [addAt],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(NODE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const type = e.dataTransfer.getData(NODE_DRAG_MIME);
      if (!type || !getDefinition(type)) return;
      e.preventDefault();
      addAt(type as NodeType, e.clientX, e.clientY);
    },
    [addAt],
  );

  return (
    <div className="flow-studio flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="relative grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md lg:px-4">
        {isRunning && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-muted"
            role="progressbar"
            aria-label="Đang chạy flow"
            aria-busy="true"
          >
            <div className="animate-generation-indeterminate h-full w-1/3 bg-run-running motion-reduce:animate-none" />
          </div>
        )}

        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <Button type="button" variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Mở thư viện node" onClick={() => setLibraryOpen(true)}>
            <PanelLeft />
          </Button>
          <Link href="/" className="truncate font-semibold tracking-tight hover:opacity-80">BannerAI</Link>
          <span className="text-muted-foreground/60" aria-hidden>/</span>
          <span className="truncate text-sm font-medium">Flow canvas</span>
          <Badge variant="secondary" className="hidden sm:inline-flex">Beta</Badge>
        </div>

        <div className="flex items-center gap-1.5 justify-self-center text-xs text-muted-foreground" aria-live="polite">
          {!isEmpty && (
            <span className="hidden tabular-nums md:inline">{graph.nodes.length} node · {graph.edges.length} dây</span>
          )}
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
              <CircleAlert className="size-3.5" aria-hidden />
              {errorCount} lỗi
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-run-stale/12 px-2 py-0.5 font-medium text-foreground">
              <TriangleAlert className="size-3.5 text-run-stale" aria-hidden />
              {warningCount} cảnh báo
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 justify-self-end">
          <Button type="button" size="sm" onClick={() => void run()} disabled={isRunning || isEmpty} aria-busy={isRunning}>
            {isRunning
              ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              : <Play aria-hidden />}
            {isRunning ? 'Đang chạy…' : 'Chạy tất cả'}
            {!isRunning && aiCalls !== null && (
              <span className="rounded-sm bg-primary-foreground/15 px-1 text-[11px] tabular-nums">{aiCalls} lượt AI</span>
            )}
          </Button>
          <Show when="signed-in"><UserButton /></Show>
          <Button type="button" variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Mở inspector" onClick={() => setInspectorOpen(true)}>
            <PanelRight />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_320px] xl:grid-cols-[272px_minmax(0,1fr)_340px]">
        <aside className="hidden min-h-0 flex-col border-r bg-card lg:flex" aria-label="Thư viện node">
          <NodeLibrary onAdd={onAddFromLibrary} />
        </aside>

        <section ref={paneRef} className="relative min-h-0 min-w-0" aria-label="Flow canvas">
          <FlowNodeActionsContext.Provider value={nodeActions}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={FLOW_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              onDragOver={onDragOver}
              onDrop={onDrop}
              fitView
              // Canvas rỗng lúc mở: không phóng to quá 100% khi fitView.
              fitViewOptions={{ maxZoom: 1 }}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" />
            </ReactFlow>
          </FlowNodeActionsContext.Provider>

          {isEmpty && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6" role="status">
              <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/85 px-6 py-8 text-center backdrop-blur-sm">
                <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                  <MousePointerSquareDashed className="size-5" />
                </span>
                <p className="text-sm font-semibold">Canvas trống</p>
                <p className="text-xs text-muted-foreground">
                  Kéo node từ thư viện vào đây, hoặc bấm vào node trong thư viện. Bắt đầu với Brief, Kích thước và Sinh banner.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col border-l bg-card lg:flex" aria-label="Inspector">
          <Inspector node={selected} />
        </aside>
      </div>

      {/* Màn hình < lg: thư viện và inspector mở dạng sheet, giống editor (EditorWorkspace). */}
      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent side="left" className="w-[300px] gap-0 p-0 sm:max-w-[300px]">
          <SheetHeader className="sr-only"><SheetTitle>Thư viện node</SheetTitle></SheetHeader>
          <NodeLibrary onAdd={onAddFromLibrary} />
        </SheetContent>
      </Sheet>
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent side="right" className="w-[340px] gap-0 p-0 sm:max-w-[340px]">
          <SheetHeader className="sr-only"><SheetTitle>Inspector</SheetTitle></SheetHeader>
          <Inspector node={selected} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
