import { describe, expect, it } from 'vitest';
import type { FinalConnectionState, InternalNode } from '@xyflow/react';
import { REJECT_MESSAGES } from '@/lib/flow/connection-rules';
import { decompileJob } from '@/lib/flow/decompiler';
import { flatLegacy } from '@/lib/flow/__tests__/fixtures';
import {
  attemptFromConnectionEnd, checkConnection, nearestValidConnection, rejectMessageForConnectionEnd, SAME_DIRECTION_MESSAGE,
  type HandlePoint,
} from '../connection-feedback';

const graph = decompileJob(flatLegacy);

type H = { nodeId: string; id: string; type: 'source' | 'target' };
/** Chỉ dựng các field mà connection-feedback đọc. */
const endState = (from: H | null, to: H | null, isValid: boolean | null) =>
  ({ fromHandle: from, toHandle: to, isValid }) as unknown as FinalConnectionState<InternalNode>;

describe('connection-feedback', () => {
  it('kéo xuôi output → input', () => {
    expect(attemptFromConnectionEnd(endState(
      { nodeId: 'n-brief', id: 'brief', type: 'source' },
      { nodeId: 'n-generate-flat', id: 'ratio', type: 'target' }, false,
    ))).toEqual({ source: 'n-brief', sourcePort: 'brief', target: 'n-generate-flat', targetPort: 'ratio' });
  });

  it('kéo ngược input → output vẫn ra đúng chiều source → target', () => {
    expect(attemptFromConnectionEnd(endState(
      { nodeId: 'n-generate-flat', id: 'ratio', type: 'target' },
      { nodeId: 'n-brief', id: 'brief', type: 'source' }, false,
    ))).toEqual({ source: 'n-brief', sourcePort: 'brief', target: 'n-generate-flat', targetPort: 'ratio' });
  });

  it('thả vào handle sai kiểu → message type-mismatch', () => {
    expect(rejectMessageForConnectionEnd(graph, endState(
      { nodeId: 'n-brief', id: 'brief', type: 'source' },
      { nodeId: 'n-generate-flat', id: 'ratio', type: 'target' }, false,
    ))).toBe(REJECT_MESSAGES['type-mismatch']);
  });

  it('thả ra vùng trống hoặc kết nối hợp lệ → không báo', () => {
    expect(rejectMessageForConnectionEnd(graph, endState({ nodeId: 'n-brief', id: 'brief', type: 'source' }, null, null))).toBeNull();
    expect(rejectMessageForConnectionEnd(graph, endState(
      { nodeId: 'n-brief', id: 'brief', type: 'source' },
      { nodeId: 'n-generate-flat', id: 'brief', type: 'target' }, true,
    ))).toBeNull();
  });

  it('checkConnection dùng cho isValidConnection', () => {
    expect(checkConnection(graph, { source: 'n-ratio', target: 'n-generate-flat', sourceHandle: 'ratio', targetHandle: 'ratio' }))
      .toEqual({ ok: false, reason: 'duplicate-edge' });
  });

  it('thả gần ô cùng chiều (ra–ra) → báo nối sai chiều, không phải "port không tồn tại"', () => {
    expect(rejectMessageForConnectionEnd(graph, endState(
      { nodeId: 'n-brief', id: 'brief', type: 'source' },
      { nodeId: 'n-ratio', id: 'ratio', type: 'source' }, false,
    ))).toBe(SAME_DIRECTION_MESSAGE);
  });
});

describe('nearestValidConnection (thả dây lệch)', () => {
  // Graph flat: thêm 1 text node mới chưa nối.
  const g = { ...graph, nodes: [...graph.nodes, { ...graph.nodes.find((n) => n.type === 'text-layer')!, id: 'n-new' }] };
  const from = { nodeId: 'n-new', handleId: 'text', type: 'source' as const };
  const handles: HandlePoint[] = [
    { nodeId: 'n-style', handleId: 'style', type: 'source', x: 100, y: 100 },          // gần nhất nhưng cùng chiều
    { nodeId: 'n-generate-flat', handleId: 'brief', type: 'target', x: 104, y: 104 },  // gần nhưng sai kiểu
    { nodeId: 'n-generate-flat', handleId: 'text', type: 'target', x: 120, y: 110 },   // hợp lệ
  ];

  it('bỏ qua ô gần hơn nhưng không nối được, chọn ô hợp lệ gần nhất', () => {
    expect(nearestValidConnection(g, from, { x: 100, y: 100 }, handles, 40))
      .toEqual({ source: 'n-new', sourceHandle: 'text', target: 'n-generate-flat', targetHandle: 'text' });
  });

  it('ngoài bán kính → null', () => {
    expect(nearestValidConnection(g, from, { x: 100, y: 100 }, handles, 15)).toBeNull();
  });

  it('kéo ngược từ ô vào → tìm ô ra', () => {
    const toIn = { nodeId: 'n-generate-flat', handleId: 'text', type: 'target' as const };
    const outs: HandlePoint[] = [{ nodeId: 'n-new', handleId: 'text', type: 'source', x: 0, y: 0 }];
    expect(nearestValidConnection(g, toIn, { x: 10, y: 0 }, outs, 40))
      .toEqual({ source: 'n-new', sourceHandle: 'text', target: 'n-generate-flat', targetHandle: 'text' });
  });
});

