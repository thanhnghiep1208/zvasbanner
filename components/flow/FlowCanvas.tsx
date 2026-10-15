'use client';

import { useCallback, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { REJECT_MESSAGES } from '@/lib/flow/connection-rules';
import { checkConnection, rejectMessageForConnectionEnd } from '@/lib/flow-ui/connection-feedback';
import { selectRFEdges, selectRFNodes, useFlowStore } from '@/store/flow-store';
import { FLOW_NODE_TYPES } from './nodes/FlowNodeCard';
import styles from './flow-canvas.module.css';

function FlowCanvasInner() {
  const { graph, nodeUi, edgeUi, runInfo, onNodesChange, onEdgesChange, connect } = useFlowStore(
    useShallow((s) => ({
      graph: s.graph,
      nodeUi: s.nodeUi,
      edgeUi: s.edgeUi,
      runInfo: s.runInfo,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      connect: s.connect,
    })),
  );

  const nodes = useMemo(() => selectRFNodes(graph, nodeUi, runInfo), [graph, nodeUi, runInfo]);
  const edges = useMemo(() => selectRFEdges(graph, edgeUi), [graph, edgeUi]);

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

  const isEmpty = nodes.length === 0;

  return (
    <section className={styles['flow-canvas']} aria-label="Flow canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={FLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        fitView
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {isEmpty && (
        <div className={styles['flow-canvas__empty']} role="status">
          <p className={styles['flow-canvas__empty-title']}>Canvas trống</p>
          <p className={styles['flow-canvas__empty-hint']}>
            Node library và template được thêm ở bước 2.
          </p>
        </div>
      )}
    </section>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
