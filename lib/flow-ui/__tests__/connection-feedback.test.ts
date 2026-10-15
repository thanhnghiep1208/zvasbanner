import { describe, expect, it } from 'vitest';
import type { FinalConnectionState, InternalNode } from '@xyflow/react';
import { REJECT_MESSAGES } from '@/lib/flow/connection-rules';
import { decompileJob } from '@/lib/flow/decompiler';
import { flatLegacy } from '@/lib/flow/__tests__/fixtures';
import { attemptFromConnectionEnd, checkConnection, rejectMessageForConnectionEnd } from '../connection-feedback';

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
});
