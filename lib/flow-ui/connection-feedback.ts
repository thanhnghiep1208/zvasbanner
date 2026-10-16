/**
 * Phản hồi khi user kéo dây (T2.2): dùng chung luật `canConnect()` của domain cho
 * `isValidConnection` (tô xám handle không nối được) và cho toast khi thả dây vào handle sai.
 */
import type { FinalConnectionState, InternalNode } from '@xyflow/react';
import {
  canConnect, REJECT_MESSAGES, type ConnectionAttempt, type ConnectionResult,
} from '@/lib/flow/connection-rules';
import type { FlowGraph } from '@/lib/flow/schema';
import { toConnectionAttempt } from './rf-adapter';

type ConnectionLike = Parameters<typeof toConnectionAttempt>[0];

/** Kết nối thiếu handle không thể hợp lệ vì mọi port đều có id. */
export function checkConnection(graph: FlowGraph, c: ConnectionLike): ConnectionResult {
  const attempt = toConnectionAttempt(c);
  if (!attempt) return { ok: false, reason: 'unknown-port' };
  return canConnect(graph, attempt);
}

/**
 * Trạng thái lúc thả dây (`onConnectEnd`) → attempt theo chiều source → target.
 * User có thể kéo từ handle input ngược về output; React Flow ghi lại handle bắt đầu ở `fromHandle`.
 * Trả `null` khi không thả lên handle nào (thả ra vùng trống).
 */
export function attemptFromConnectionEnd(state: FinalConnectionState<InternalNode>): ConnectionAttempt | null {
  const { fromHandle, toHandle } = state;
  if (!fromHandle || !toHandle || !fromHandle.id || !toHandle.id) return null;
  const [src, tgt] = fromHandle.type === 'source' ? [fromHandle, toHandle] : [toHandle, fromHandle];
  return { source: src.nodeId, sourcePort: src.id!, target: tgt.nodeId, targetPort: tgt.id! };
}

export const SAME_DIRECTION_MESSAGE = 'Nối ô ra (bên phải node) vào ô vào (bên trái node khác).';

/** Message toast khi thả dây vào handle không hợp lệ; `null` = không cần báo. */
export function rejectMessageForConnectionEnd(
  graph: FlowGraph,
  state: FinalConnectionState<InternalNode>,
): string | null {
  if (state.isValid !== false) return null;
  // Thả gần ô cùng chiều (ra–ra / vào–vào): không phải "port không tồn tại", chỉ là nối sai chiều.
  if (state.fromHandle && state.toHandle && state.fromHandle.type === state.toHandle.type) return SAME_DIRECTION_MESSAGE;
  const attempt = attemptFromConnectionEnd(state);
  if (!attempt) return null;
  const res = canConnect(graph, attempt);
  return res.ok ? null : REJECT_MESSAGES[res.reason];
}

/** Ô nối trên canvas (toạ độ canvas, tâm chấm) – lấy từ handleBounds của React Flow. */
export interface HandlePoint {
  nodeId: string;
  handleId: string;
  type: 'source' | 'target';
  x: number;
  y: number;
}

/**
 * Thả dây lệch: React Flow chỉ xét ô GẦN NHẤT (kể cả ô cùng chiều/không nối được) → hay trượt khi các node sát nhau.
 * Tìm ô gần chỗ thả nhất mà NỐI ĐƯỢC (cùng luật canConnect) trong bán kính `radius` (toạ độ canvas).
 * Trả Connection theo chiều source → target, hoặc null.
 */
export function nearestValidConnection(
  graph: FlowGraph,
  from: { nodeId: string; handleId: string; type: 'source' | 'target' },
  point: { x: number; y: number },
  handles: readonly HandlePoint[],
  radius: number,
): { source: string; sourceHandle: string; target: string; targetHandle: string } | null {
  let best: { c: { source: string; sourceHandle: string; target: string; targetHandle: string }; d: number } | null = null;
  for (const h of handles) {
    if (h.type === from.type || h.nodeId === from.nodeId) continue;
    const d = Math.hypot(h.x - point.x, h.y - point.y);
    if (d > radius || (best && d >= best.d)) continue;
    const c = from.type === 'source'
      ? { source: from.nodeId, sourceHandle: from.handleId, target: h.nodeId, targetHandle: h.handleId }
      : { source: h.nodeId, sourceHandle: h.handleId, target: from.nodeId, targetHandle: from.handleId };
    if (checkConnection(graph, c).ok) best = { c, d };
  }
  return best?.c ?? null;
}
