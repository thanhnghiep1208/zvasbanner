'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent } from 'react';
import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore as useRFStore,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow-theme.css';
import { Show, UserButton } from '@clerk/nextjs';
import { CircleAlert, ImagePlus, LoaderCircle, MousePointerSquareDashed, PanelLeft, PanelRight, Play, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { REJECT_MESSAGES } from '@/lib/flow/connection-rules';
import { getDefinition, NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { FlowAsset, NodeType } from '@/lib/flow/schema';
import { DEFAULT_TEMPLATES, getTemplate } from '@/lib/flow/template';
import { validateGraph } from '@/lib/flow/validate';
import {
  checkConnection, nearestValidConnection, rejectMessageForConnectionEnd, type HandlePoint,
} from '@/lib/flow-ui/connection-feedback';
import { nodeKeys } from '@/lib/flow/cache-keys';
import { canvasMeasurer } from '@/lib/flow-ui/compose-render';
import {
  freePosition, selectRFEdges, selectRFNodes, selectSingleSelectedNode, useFlowStore,
} from '@/store/flow-store';
import { EDGE_CLASS } from './flow-styles';
import { FLOW_FONT_VARIABLES } from './flow-fonts';
import { Inspector } from './inspector/Inspector';
import { readAssetFile } from './inspector/read-asset-file';
import { TemplatePicker } from './TemplatePicker';
import { ProjectMenu } from './ProjectMenu';
import { useFlowDocs } from './use-flow-docs';
import { takeFlowOpenSource, trackFlow } from './flow-analytics';
import { SimpleView } from './simple/SimpleView';
import { NODE_DRAG_MIME, NodeLibrary } from './NodeLibrary';
import { FLOW_NODE_TYPES, FlowNodeActionsContext } from './nodes/FlowNodeCard';
import { useFlowRun } from './use-flow-run';

/** Nửa kích thước node card (w-64) – để căn node mới vào giữa điểm thả. */
const NODE_HALF = { x: 128, y: 40 };

/** Node Asset / Ảnh tham chiếu nằm dưới con trỏ khi kéo file vào canvas (null nếu chỗ trống hoặc node khác). */
function imageNodeAt(target: EventTarget | null) {
  const id = target instanceof Element ? target.closest('.react-flow__node')?.getAttribute('data-id') : null;
  const node = id ? useFlowStore.getState().graph.nodes.find((n) => n.id === id) : undefined;
  return node && (node.type === 'product-asset' || node.type === 'reference-image') ? node : null;
}

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
  const { screenToFlowPosition, fitView, getInternalNode } = useReactFlow();
  // Zoom làm tròn 0.05 → chỉ render lại khi đổi bậc, không phải mỗi tick cuộn chuột.
  const zoom = useRFStore((s) => Math.max(0.05, Math.round(s.transform[2] * 20) / 20));
  // Bù zoom cho ô nối: zoom nhỏ (graph 6 cột trên laptop ~0.4) thì chấm 12px chỉ còn ~5px trên màn hình.
  // Giữ ≥ ~10px màn hình, tối đa ×1.8 (chấm 22px < khoảng cách 24px giữa 2 port, không chồng nhau).
  const handleBoost = Math.min(1.8, Math.max(1, 0.8 / zoom));
  const graphVersion = useFlowStore((s) => s.graphVersion);
  const view = useFlowStore((s) => s.view);
  const setView = useFlowStore((s) => s.setView);
  // User tự đổi view (header / "Mở canvas") → analytics; loadTemplate/loadDoc đổi view thì không tính.
  const switchView = useCallback((v: 'simple' | 'canvas') => {
    if (useFlowStore.getState().view === v) return;
    setView(v);
    if (useFlowStore.getState().view === v) trackFlow('flow_view_switched', { view: v });
  }, [setView]);
  const hasExposed = useFlowStore((s) => s.exposed.length > 0);
  const nodesInitialized = useNodesInitialized();
  const fittedVersion = useRef(-1);

  // Nạp graph mới (template, migrate…) hoặc quay lại Canvas view (React Flow mount lại): chờ RF đo xong node rồi
  // mới canh khít, 1 lần mỗi lần.
  useEffect(() => {
    if (view !== 'canvas') {
      fittedVersion.current = -1;
      return;
    }
    if (!nodesInitialized || fittedVersion.current === graphVersion) return;
    fittedVersion.current = graphVersion;
    void fitView({ padding: 0.12, maxZoom: 1 });
  }, [nodesInitialized, graphVersion, fitView, view]);
  const paneRef = useRef<HTMLDivElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { run, isRunning, aiCalls, reusable } = useFlowRun();
  const nodeActions = useMemo(
    () => ({ onRetry: (id: string) => void run(id), onRunFrom: (id: string) => void run(id), isRunning }),
    [run, isRunning],
  );

  // Key Merkle hiện tại – node đã chạy mà key đổi → "Cần chạy lại" (T4.7).
  const currentKeys = useMemo(() => nodeKeys(graph), [graph]);
  const nodes = useMemo(() => selectRFNodes(graph, nodeUi, runInfo, currentKeys), [graph, nodeUi, runInfo, currentKeys]);
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

  const onConnectEnd = useCallback<OnConnectEnd>((event, state) => {
    if (state.isValid === true) return; // React Flow đã gọi onConnect
    const graph = useFlowStore.getState().graph;
    // Thả lệch / ô gần nhất không nối được → thử ô HỢP LỆ gần nhất (bán kính ~40px màn hình).
    const from = state.fromHandle;
    const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (from?.id && pt) {
      const point = screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
      const handles: HandlePoint[] = [];
      for (const n of graph.nodes) {
        const internal = getInternalNode(n.id);
        if (!internal) continue;
        const { x: nx, y: ny } = internal.internals.positionAbsolute;
        for (const b of [...(internal.internals.handleBounds?.source ?? []), ...(internal.internals.handleBounds?.target ?? [])]) {
          if (b.id) handles.push({ nodeId: n.id, handleId: b.id, type: b.type, x: nx + b.x + b.width / 2, y: ny + b.y + b.height / 2 });
        }
      }
      const c = nearestValidConnection(graph, { nodeId: from.nodeId, handleId: from.id, type: from.type }, point,
        handles, 40 / zoom);
      if (c) {
        const res = connect(c);
        if (res.ok) return;
      }
    }
    const message = rejectMessageForConnectionEnd(graph, state);
    if (message) toast.error(message);
  }, [connect, getInternalNode, screenToFlowPosition, zoom]);

  const addAt = useCallback(
    (type: NodeType, clientX: number, clientY: number) => {
      const p = screenToFlowPosition({ x: clientX, y: clientY });
      const pos = { x: p.x - NODE_HALF.x, y: p.y - NODE_HALF.y };
      return addNode(type, freePosition(useFlowStore.getState().graph, pos));
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

  // Kéo ảnh từ máy vào canvas: thả lên node Asset / Ảnh tham chiếu → thay ảnh node đó; thả chỗ trống → mỗi file
  // 1 node Asset mới tại điểm thả. `fileDrag` = đang kéo file qua canvas (để hiện lớp phủ hướng dẫn).
  const [fileDrag, setFileDrag] = useState<{ targetLabel: string | null } | null>(null);

  const onDragOver = useCallback((e: DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes(NODE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return;
    }
    if (!types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const target = imageNodeAt(e.target);
    const targetLabel = target ? getDefinition(target.type)!.label : null;
    setFileDrag((prev) => (prev?.targetLabel === targetLabel ? prev : { targetLabel }));
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDrag(null);
  }, []);

  const dropFiles = useCallback(
    async (files: File[], target: ReturnType<typeof imageNodeAt>, clientX: number, clientY: number) => {
      const { setAssetData, updateNodeParams } = useFlowStore.getState();
      // Thay ảnh node có sẵn: chỉ lấy file đầu (1 node = 1 ảnh), file còn lại tạo node mới.
      let rest = files;
      if (target) {
        const res = await readAssetFile(files[0]!, (target.params as FlowAsset).role);
        if (res.ok) {
          setAssetData(res.patch.assetId, res.dataUrl);
          updateNodeParams<'product-asset'>(target.id, res.patch);
        } else toast.error(res.message);
        rest = files.slice(1);
      }
      for (const file of rest) {
        const res = await readAssetFile(file);
        if (!res.ok) {
          toast.error(res.message);
          continue;
        }
        setAssetData(res.patch.assetId, res.dataUrl);
        const id = addAt('product-asset', clientX, clientY);
        updateNodeParams<'product-asset'>(id, res.patch);
      }
    },
    [addAt],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      setFileDrag(null);
      const type = e.dataTransfer.getData(NODE_DRAG_MIME);
      if (type) {
        if (!getDefinition(type)) return;
        e.preventDefault();
        addAt(type as NodeType, e.clientX, e.clientY);
        return;
      }
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      e.preventDefault();
      void dropFiles(files, imageNodeAt(e.target), e.clientX, e.clientY);
    },
    [addAt, dropFiles],
  );

  // Xoá mọi node Asset / Ảnh tham chiếu (cùng dây nối) trong 1 lần; toast cho hoàn tác nếu graph chưa đổi tiếp.
  const imageNodeIds = useMemo(
    () => graph.nodes.filter((n) => n.type === 'product-asset' || n.type === 'reference-image').map((n) => n.id),
    [graph],
  );
  const removeAllImages = useCallback(() => {
    const before = useFlowStore.getState();
    const snapshot = { graph: before.graph, nodeUi: before.nodeUi, edgeUi: before.edgeUi };
    onNodesChange(imageNodeIds.map((id) => ({ type: 'remove' as const, id })));
    const after = useFlowStore.getState().graph;
    toast.success(`Đã xoá ${imageNodeIds.length} node ảnh.`, {
      action: {
        label: 'Hoàn tác',
        onClick: () => {
          if (useFlowStore.getState().graph !== after) return void toast.error('Canvas đã thay đổi, không hoàn tác được.');
          useFlowStore.setState(snapshot);
        },
      },
    });
  }, [imageNodeIds, onNodesChange]);

  return (
    <FlowNodeActionsContext.Provider value={nodeActions}>
    <div
      data-flow-fonts
      className={`flow-studio flex h-dvh min-h-0 flex-col bg-background text-foreground ${FLOW_FONT_VARIABLES}`}
      style={{ '--flow-handle-boost': handleBoost } as CSSProperties}
    >
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
          <Button type="button" variant="ghost" size="icon-sm" className={view === 'canvas' ? 'lg:hidden' : 'hidden'} aria-label="Mở thư viện node" onClick={() => setLibraryOpen(true)}>
            <PanelLeft />
          </Button>
          <Link href="/" className="truncate font-semibold tracking-tight hover:opacity-80">BannerAI</Link>
          <span className="hidden text-muted-foreground/60 xl:inline" aria-hidden>/</span>
          <span className="hidden truncate text-sm font-medium xl:inline">Flow canvas</span>
          <Badge variant="secondary" className="hidden lg:inline-flex">Beta</Badge>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <TemplatePicker />
          {hasExposed && (
            <div className="ml-1 inline-flex shrink-0 rounded-lg border bg-muted p-0.5 text-xs whitespace-nowrap" role="tablist" aria-label="Chế độ xem">
              {(['simple', 'canvas'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => switchView(v)}
                  className="rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {v === 'simple' ? 'Đơn giản' : 'Canvas'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 justify-self-center text-xs text-muted-foreground" aria-live="polite">
          {!isEmpty && (
            <span className="hidden tabular-nums lg:inline">{graph.nodes.length} node · {graph.edges.length} dây</span>
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

        <div className="flex min-w-0 items-center gap-2 justify-self-end">
          <ProjectMenu />
          <Button type="button" size="sm" onClick={() => void run()} disabled={isRunning || isEmpty} aria-busy={isRunning}>
            {isRunning
              ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              : <Play aria-hidden />}
            {isRunning ? 'Đang chạy…' : 'Chạy tất cả'}
            {!isRunning && aiCalls !== null && (
              <span
                className="rounded-sm bg-primary-foreground/15 px-1 text-[11px] tabular-nums"
                title={reusable ? `${reusable} kích thước có sẵn kết quả trước (không tốn lượt AI)` : undefined}
              >
                {aiCalls} lượt AI{reusable ? ` · ${reusable} có sẵn` : ''}
              </span>
            )}
          </Button>
          <Show when="signed-in"><UserButton /></Show>
          <Button type="button" variant="ghost" size="icon-sm" className={view === 'canvas' ? 'lg:hidden' : 'hidden'} aria-label="Mở inspector" onClick={() => setInspectorOpen(true)}>
            <PanelRight />
          </Button>
        </div>
      </header>

      {view === 'simple' ? (
        <SimpleView onOpenCanvas={() => switchView('canvas')} />
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_320px] xl:grid-cols-[272px_minmax(0,1fr)_340px]">
        <aside className="hidden min-h-0 flex-col border-r bg-card lg:flex" aria-label="Thư viện node">
          <NodeLibrary onAdd={onAddFromLibrary} />
        </aside>

        <section ref={paneRef} className="relative min-h-0 min-w-0" aria-label="Flow canvas" onDragLeave={onDragLeave}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={FLOW_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              // Thả dây cách ô nối ≤ ~32px màn hình là tính nối vào ô đó (mặc định 20 đơn vị canvas = 7px ở zoom 0.37).
              // React Flow tính bán kính theo toạ độ canvas nên chia cho zoom.
              connectionRadius={Math.min(120, Math.round(32 / zoom))}
              onDragOver={onDragOver}
              onDrop={onDrop}
              fitView
              // Graph nhỏ: không phóng to quá 100% khi fitView.
              fitViewOptions={{ maxZoom: 1 }}
              // Template có 6 cột node: canvas hẹp (laptop, có 2 sidebar) cần zoom < 0.5 mặc định mới thấy hết.
              minZoom={0.25}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" />
              {imageNodeIds.length > 0 && (
                <Panel position="top-right">
                  <Button type="button" size="sm" variant="outline" className="bg-card shadow-xs" onClick={removeAllImages}>
                    <Trash2 aria-hidden />
                    Xoá tất cả ảnh ({imageNodeIds.length})
                  </Button>
                </Panel>
              )}
            </ReactFlow>

          {fileDrag && (
            <div className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5" aria-hidden>
              <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-sm">
                <ImagePlus className="size-4 text-primary" />
                {fileDrag.targetLabel ? `Thả để thay ảnh của node ${fileDrag.targetLabel}` : 'Thả ảnh để tạo node Asset'}
              </span>
            </div>
          )}

          {isEmpty && !fileDrag && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6" role="status">
              <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/85 px-6 py-8 text-center backdrop-blur-sm">
                <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                  <MousePointerSquareDashed className="size-5" />
                </span>
                <p className="text-sm font-semibold">Canvas trống</p>
                <p className="text-xs text-muted-foreground">
                  Kéo node từ thư viện (hoặc ảnh từ máy) vào đây, hoặc bấm vào node trong thư viện. Bắt đầu với Brief, Kích thước và Tạo banner.
                </p>
                <Button type="button" size="sm" variant="outline" className="pointer-events-auto mt-1"
                  onClick={() => {
                    useFlowStore.getState().loadTemplate(DEFAULT_TEMPLATES[0]!);
                    trackFlow('flow_template_used', { source: 'empty_canvas' });
                  }}>
                  Nạp template mặc định
                </Button>
              </div>
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col border-l bg-card lg:flex" aria-label="Inspector">
          <Inspector node={selected} />
        </aside>
      </div>
      )}

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
    </FlowNodeActionsContext.Provider>
  );
}

const noopSubscribe = () => () => {};

/**
 * Mở `/flow`:
 * - `initialDocId` (`?doc=<id>`, T6.1): tải project đã lưu; lỗi → báo và giữ template mặc định.
 * - `initialTemplateId` (`?template=<id>`): mở thẳng template đó.
 * - Không có/không hợp lệ → template mặc định mà store đã nạp sẵn (T5.4 – không bao giờ mở canvas trống).
 */
export default function FlowCanvas({ initialTemplateId, initialDocId }: { initialTemplateId?: string; initialDocId?: string }) {
  const { open } = useFlowDocs();
  // flow_opened chỉ 1 lần mỗi lần mount (StrictMode chạy effect 2 lần với cùng ref).
  const openedTracked = useRef(false);
  // Chỉ chạy ở client: store là singleton module, nạp lúc render server sẽ dùng chung giữa các request.
  useEffect(() => {
    const first = !openedTracked.current;
    openedTracked.current = true;
    const fromForm = first ? takeFlowOpenSource() : null;
    if (initialDocId) {
      const loaded = useFlowStore.getState().docId !== initialDocId ? open(initialDocId) : Promise.resolve(true);
      // Đợi tải xong để event mang doc_id/template_id của project.
      if (first) void loaded.then(() => trackFlow('flow_opened', { source: 'doc' }));
      return;
    }
    const t = initialTemplateId ? getTemplate(initialTemplateId) : undefined;
    if (t && useFlowStore.getState().templateId !== t.id) useFlowStore.getState().loadTemplate(t);
    if (!first) return;
    const source = fromForm ?? (t ? 'template_url' : 'direct');
    trackFlow('flow_opened', { source });
    // Graph đúng là template vừa nạp (chưa sửa) → tính 1 lần dùng template.
    const s = useFlowStore.getState();
    if (source !== 'form' && s.templateId && s.graph === s.templateBaseline) {
      trackFlow('flow_template_used', { source: t ? 'url' : 'default' });
    }
  }, [initialTemplateId, initialDocId, open]);

  // Studio đo chữ/vẽ bằng Canvas 2D (validate, ước tính lượt AI) – chỉ có ở trình duyệt. Graph mặc định đã có chữ
  // (T5.4) nên không render ở server; server trả khung trống cùng nền để không nháy.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="h-dvh bg-background" aria-busy="true" />;

  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
