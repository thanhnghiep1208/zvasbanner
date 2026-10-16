/**
 * Adapter domain ↔ React Flow (T2.1).
 *
 * Domain (`lib/flow`) là source of truth; React Flow chỉ là lớp hiển thị.
 * - FlowNode → RF node: `type` = NodeType (map sang component qua `nodeTypes`), `data.params` = params.
 * - FlowEdge → RF edge: handle id = port id (`sourceHandle` = sourcePort, `targetHandle` = targetPort).
 * Field riêng của RF (selected, dragging, measured…) không đi ngược vào domain.
 */
import type { Connection, Edge, Node } from '@xyflow/react';
import type { ConnectionAttempt } from '@/lib/flow/connection-rules';
import { getDefinition } from '@/lib/flow/node-definitions';
import type { FlowEdge, FlowGraph, FlowNode, NodeParamsMap, NodeType } from '@/lib/flow/schema';
import { makeEdgeId } from '@/lib/flow/schema';
import type { NodeRunInfo } from '@/lib/flow/run-state';

export type FlowRFNodeData<T extends NodeType = NodeType> = {
  params: NodeParamsMap[T];
  /** Chỉ hiển thị; không đi ngược vào domain. */
  run?: NodeRunInfo;
};
export type FlowRFNode<T extends NodeType = NodeType> = Node<FlowRFNodeData<T>, T>;
export type FlowRFEdge = Edge;

/* ── Node ───────────────────────────────────────────────────── */

export function toRFNode<T extends NodeType>(node: FlowNode<T>): FlowRFNode<T> {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: { params: node.params },
  };
}

export function fromRFNode(node: Node): FlowNode {
  if (!node.type || !getDefinition(node.type)) {
    throw new Error(`RF node ${node.id}: type không hợp lệ (${String(node.type)}).`);
  }
  const data = node.data as Partial<FlowRFNodeData> | undefined;
  if (!data || data.params === undefined) {
    throw new Error(`RF node ${node.id}: thiếu data.params.`);
  }
  return {
    id: node.id,
    type: node.type as NodeType,
    params: data.params,
    position: { x: node.position.x, y: node.position.y },
  };
}

/* ── Edge ───────────────────────────────────────────────────── */

export function toRFEdge(edge: FlowEdge): FlowRFEdge {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourcePort,
    target: edge.target,
    targetHandle: edge.targetPort,
  };
}

export function fromRFEdge(edge: Edge): FlowEdge {
  if (!edge.sourceHandle || !edge.targetHandle) {
    throw new Error(`RF edge ${edge.id}: thiếu sourceHandle/targetHandle (handle id phải = port id).`);
  }
  return {
    id: edge.id,
    source: edge.source,
    sourcePort: edge.sourceHandle,
    target: edge.target,
    targetPort: edge.targetHandle,
  };
}

/* ── Graph ──────────────────────────────────────────────────── */

export function graphToRF(graph: FlowGraph): { nodes: FlowRFNode[]; edges: FlowRFEdge[] } {
  return { nodes: graph.nodes.map(toRFNode), edges: graph.edges.map(toRFEdge) };
}

export function rfToGraph(nodes: Node[], edges: Edge[]): FlowGraph {
  return { nodes: nodes.map(fromRFNode), edges: edges.map(fromRFEdge) };
}

/* ── Connection ─────────────────────────────────────────────── */

/**
 * Connection / Edge của RF (khi kéo dây, `isValidConnection`) → ConnectionAttempt cho `canConnect()`.
 * Trả `null` khi thiếu handle: không thể là kết nối hợp lệ vì mọi port đều có id.
 */
export function toConnectionAttempt(
  c: Pick<Connection, 'source' | 'target'> & {
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): ConnectionAttempt | null {
  if (!c.sourceHandle || !c.targetHandle) return null;
  return { source: c.source, sourcePort: c.sourceHandle, target: c.target, targetPort: c.targetHandle };
}

/** ConnectionAttempt đã qua `canConnect()` → FlowEdge với id xác định. */
export function attemptToEdge(a: ConnectionAttempt): FlowEdge {
  return { id: makeEdgeId(a.source, a.sourcePort, a.target, a.targetPort), ...a };
}
