/**
 * Flow store – slice riêng, KHÔNG gộp vào store hiện có.
 * KHÔNG dùng persist middleware: graph chứa preview ảnh sẽ vượt quota localStorage.
 * Graph được lưu vào Postgres (JSONB + schemaVersion) từ bước 1.
 */
import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';

type FlowState = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  reset: () => void;
};

export const useFlowStore = create<FlowState>()((set) => ({
  nodes: [],
  edges: [],
  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  // Bước 1: thay bằng validate theo lib/flow/connection-rules.ts
  onConnect: (connection) =>
    set((s) => ({ edges: addEdge(connection, s.edges) })),
  reset: () => set({ nodes: [], edges: [] }),
}));
