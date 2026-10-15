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

/** Message toast khi thả dây vào handle không hợp lệ; `null` = không cần báo. */
export function rejectMessageForConnectionEnd(
  graph: FlowGraph,
  state: FinalConnectionState<InternalNode>,
): string | null {
  if (state.isValid !== false) return null;
  const attempt = attemptFromConnectionEnd(state);
  if (!attempt) return null;
  const res = canConnect(graph, attempt);
  return res.ok ? null : REJECT_MESSAGES[res.reason];
}
