/**
 * Flow store – slice riêng, KHÔNG gộp vào store hiện có.
 * KHÔNG dùng persist middleware (SPEC 2.5): graph lưu Postgres qua StoredFlowDoc (T6.1).
 *
 * `graph` (domain) là source of truth. Trạng thái chỉ dùng cho hiển thị của React Flow
 * (đang chọn, đang kéo, kích thước đo được) để riêng trong `nodeUi`/`edgeUi`, không đi vào graph.
 * RF nodes/edges được dẫn xuất bằng `selectRFNodes`/`selectRFEdges`.
 */
import { create } from 'zustand';
import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import type { ConnectionResult } from '@/lib/flow/connection-rules';
import type { FlowGraph } from '@/lib/flow/schema';
import { attemptToEdge, toConnectionAttempt, toRFEdge, toRFNode, type FlowRFNode } from '@/lib/flow-ui/rf-adapter';
import { checkConnection } from '@/lib/flow-ui/connection-feedback';

type NodeUi = Pick<Node, 'selected' | 'dragging' | 'measured'>;
type EdgeUi = Pick<Edge, 'selected'>;

type FlowState = {
  graph: FlowGraph;
  nodeUi: Record<string, NodeUi>;
  edgeUi: Record<string, EdgeUi>;
  setGraph: (graph: FlowGraph) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Thêm edge nếu `canConnect()` cho phép; trả kết quả để UI báo lỗi. */
  connect: (connection: Connection) => ConnectionResult;
  reset: () => void;
};

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

export const useFlowStore = create<FlowState>()((set, get) => ({
  graph: EMPTY_GRAPH,
  nodeUi: {},
  edgeUi: {},

  setGraph: (graph) => set({ graph, nodeUi: {}, edgeUi: {} }),

  onNodesChange: (changes) =>
    set((s) => {
      let nodes = s.graph.nodes;
      let edges = s.graph.edges;
      const nodeUi = { ...s.nodeUi };
      const edgeUi = { ...s.edgeUi };
      const removed = new Set<string>();

      for (const c of changes) {
        switch (c.type) {
          case 'position':
            if (c.position) {
              const position = { x: c.position.x, y: c.position.y };
              nodes = nodes.map((n) => (n.id === c.id ? { ...n, position } : n));
            }
            nodeUi[c.id] = { ...nodeUi[c.id], dragging: c.dragging };
            break;
          case 'dimensions':
            if (c.dimensions) nodeUi[c.id] = { ...nodeUi[c.id], measured: c.dimensions };
            break;
          case 'select':
            nodeUi[c.id] = { ...nodeUi[c.id], selected: c.selected };
            break;
          case 'remove':
            removed.add(c.id);
            break;
          // 'add' / 'replace': node chỉ được thêm/thay qua action của store, không qua React Flow.
        }
      }

      if (removed.size) {
        nodes = nodes.filter((n) => !removed.has(n.id));
        const dropped = edges.filter((e) => removed.has(e.source) || removed.has(e.target));
        edges = edges.filter((e) => !dropped.includes(e));
        for (const id of removed) delete nodeUi[id];
        for (const e of dropped) delete edgeUi[e.id];
      }
      // Chỉ đổi ui (select, dimensions, dragging) → giữ nguyên object graph để không dẫn xuất lại.
      const graph = nodes === s.graph.nodes && edges === s.graph.edges ? s.graph : { nodes, edges };
      return { graph, nodeUi, edgeUi };
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      let edges = s.graph.edges;
      const edgeUi = { ...s.edgeUi };
      for (const c of changes) {
        if (c.type === 'select') edgeUi[c.id] = { selected: c.selected };
        if (c.type === 'remove') {
          edges = edges.filter((e) => e.id !== c.id);
          delete edgeUi[c.id];
        }
      }
      return { graph: edges === s.graph.edges ? s.graph : { ...s.graph, edges }, edgeUi };
    }),

  connect: (connection) => {
    const { graph } = get();
    const result = checkConnection(graph, connection);
    if (result.ok) {
      const edge = attemptToEdge(toConnectionAttempt(connection)!);
      set({ graph: { ...graph, edges: [...graph.edges, edge] } });
    }
    return result;
  },

  reset: () => set({ graph: EMPTY_GRAPH, nodeUi: {}, edgeUi: {} }),
}));

/* ── Selectors (gọi trong useMemo theo graph + ui) ──────────── */

export function selectRFNodes(graph: FlowGraph, nodeUi: Record<string, NodeUi>): FlowRFNode[] {
  return graph.nodes.map((n) => ({ ...toRFNode(n), ...nodeUi[n.id] }));
}

export function selectRFEdges(graph: FlowGraph, edgeUi: Record<string, EdgeUi>): Edge[] {
  return graph.edges.map((e) => ({ ...toRFEdge(e), ...edgeUi[e.id] }));
}
