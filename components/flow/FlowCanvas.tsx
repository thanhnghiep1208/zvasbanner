'use client';

import { useCallback, useMemo, useRef, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { REJECT_MESSAGES } from '@/lib/flow/connection-rules';
import { getDefinition } from '@/lib/flow/node-definitions';
import type { NodeType } from '@/lib/flow/schema';
import { checkConnection, rejectMessageForConnectionEnd } from '@/lib/flow-ui/connection-feedback';
import {
  freePosition, selectRFEdges, selectRFNodes, selectSingleSelectedNode, useFlowStore,
} from '@/store/flow-store';
import { Inspector } from './inspector/Inspector';
import { NODE_DRAG_MIME, NodeLibrary } from './NodeLibrary';
import { FLOW_NODE_TYPES, FlowNodeActionsContext } from './nodes/FlowNodeCard';
import { useFlowRun } from './use-flow-run';
import { Button } from '@/components/ui/button';
import { Play, LoaderCircle } from 'lucide-react';
import styles from './flow-canvas.module.css';

/** Kích thước node card (flow-node-card.module.css) – để căn node mới vào giữa điểm thả. */
const NODE_HALF = { x: 120, y: 40 };

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
  const { screenToFlowPosition } = useReactFlow();
  const { run, isRunning, aiCalls } = useFlowRun();
  const nodeActions = useMemo(() => ({ onRetry: () => void run() }), [run]);
  const paneRef = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => selectRFNodes(graph, nodeUi, runInfo), [graph, nodeUi, runInfo]);
  const edges = useMemo(() => selectRFEdges(graph, edgeUi), [graph, edgeUi]);
  const selected = useMemo(() => selectSingleSelectedNode(graph, nodeUi), [graph, nodeUi]);
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
    <div className={styles['flow-studio']}>
      <NodeLibrary onAdd={onAddFromLibrary} />

      <section ref={paneRef} className={styles['flow-canvas']} aria-label="Flow canvas">
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
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
          <Panel position="top-right">
            <Button type="button" onClick={() => void run()} disabled={isRunning || isEmpty} aria-busy={isRunning}>
              {isRunning
                ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                : <Play className="size-4" aria-hidden />}
              {isRunning ? 'Đang chạy…' : 'Chạy tất cả'}
              {!isRunning && aiCalls !== null && (
                <span className="text-xs opacity-75">· {aiCalls} lượt AI</span>
              )}
            </Button>
          </Panel>
        </ReactFlow>
        </FlowNodeActionsContext.Provider>

        {isEmpty && (
          <div className={styles['flow-canvas__empty']} role="status">
            <p className={styles['flow-canvas__empty-title']}>Canvas trống</p>
            <p className={styles['flow-canvas__empty-hint']}>
              Kéo node từ thư viện bên trái vào đây, hoặc bấm vào node trong thư viện.
            </p>
          </div>
        )}
      </section>

      <Inspector node={selected} />
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
