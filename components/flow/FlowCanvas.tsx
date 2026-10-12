'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useShallow } from 'zustand/react/shallow';
import { useFlowStore } from '@/store/flow-store';
import styles from './flow-canvas.module.css';

function FlowCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useFlowStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
    })),
  );

  const isEmpty = nodes.length === 0;

  return (
    <section className={styles['flow-canvas']} aria-label="Flow canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
