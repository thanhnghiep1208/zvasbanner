import type { FlowGraph } from './schema';
import { getDefinition } from './node-definitions';

export interface ConnectionAttempt {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

export type ConnectionResult =
  | { ok: true }
  | { ok: false; reason: ConnectionRejectReason };

export type ConnectionRejectReason =
  | 'self-loop'
  | 'unknown-node'
  | 'unknown-port'
  | 'type-mismatch'
  | 'port-occupied'
  | 'duplicate-edge'
  | 'creates-cycle';

/** Message hiển thị khi user kéo dây không hợp lệ. */
export const REJECT_MESSAGES: Record<ConnectionRejectReason, string> = {
  'self-loop': 'Không nối node vào chính nó.',
  'unknown-node': 'Node không tồn tại.',
  'unknown-port': 'Port không tồn tại trên node này.',
  'type-mismatch': 'Hai port khác kiểu dữ liệu.',
  'port-occupied': 'Port này chỉ nhận 1 kết nối. Xoá kết nối cũ trước.',
  'duplicate-edge': 'Kết nối này đã tồn tại.',
  'creates-cycle': 'Kết nối tạo vòng lặp.',
};

export function canConnect(graph: FlowGraph, c: ConnectionAttempt): ConnectionResult {
  if (c.source === c.target) return { ok: false, reason: 'self-loop' };

  const src = graph.nodes.find((n) => n.id === c.source);
  const tgt = graph.nodes.find((n) => n.id === c.target);
  if (!src || !tgt) return { ok: false, reason: 'unknown-node' };

  const srcPort = getDefinition(src.type)?.outputs.find((p) => p.id === c.sourcePort);
  const tgtPort = getDefinition(tgt.type)?.inputs.find((p) => p.id === c.targetPort);
  if (!srcPort || !tgtPort) return { ok: false, reason: 'unknown-port' };
  if (srcPort.type !== tgtPort.type) return { ok: false, reason: 'type-mismatch' };

  const incoming = graph.edges.filter(
    (e) => e.target === c.target && e.targetPort === c.targetPort,
  );
  if (incoming.some((e) => e.source === c.source && e.sourcePort === c.sourcePort)) {
    return { ok: false, reason: 'duplicate-edge' };
  }
  if (!tgtPort.multiple && incoming.length > 0) return { ok: false, reason: 'port-occupied' };

  if (reachable(graph, c.target, c.source)) return { ok: false, reason: 'creates-cycle' };
  return { ok: true };
}

/** from → … → to theo chiều edge? */
export function reachable(graph: FlowGraph, from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of graph.edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}
