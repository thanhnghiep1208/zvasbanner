import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { decompileJob } from '@/lib/flow/decompiler';
import { canConnect } from '@/lib/flow/connection-rules';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import { composedFull, flatLegacy } from '@/lib/flow/__tests__/fixtures';
import {
  attemptToEdge, fromRFEdge, fromRFNode, graphToRF, rfToGraph, toConnectionAttempt, toRFEdge, toRFNode,
} from '../rf-adapter';

describe('rf-adapter', () => {
  for (const [name, job] of Object.entries({ composedFull, flatLegacy })) {
    it(`round-trip graph → RF → graph (${name})`, () => {
      const graph = decompileJob(job);
      const { nodes, edges } = graphToRF(graph);
      expect(rfToGraph(nodes, edges)).toEqual(graph);
    });
  }

  it('handle id = port id', () => {
    const e = { id: 'e1', source: 'a', sourcePort: 'brief', target: 'b', targetPort: 'brief' };
    expect(toRFEdge(e)).toEqual({ id: 'e1', source: 'a', sourceHandle: 'brief', target: 'b', targetHandle: 'brief' });
    expect(fromRFEdge(toRFEdge(e))).toEqual(e);
  });

  it('RF node mang type domain + params trong data', () => {
    const n = { id: 'n1', type: 'ratio' as const, params: NODE_DEFINITIONS.ratio.defaultParams, position: { x: 1, y: 2 } };
    expect(toRFNode(n)).toEqual({ id: 'n1', type: 'ratio', position: { x: 1, y: 2 }, data: { params: n.params } });
  });

  it('field riêng của RF không đi vào domain', () => {
    const rf: Node = {
      ...toRFNode({ id: 'n1', type: 'brief', params: NODE_DEFINITIONS.brief.defaultParams, position: { x: 0, y: 0 } }),
      selected: true, dragging: true, measured: { width: 200, height: 80 },
    };
    expect(Object.keys(fromRFNode(rf)).sort()).toEqual(['id', 'params', 'position', 'type']);
  });

  it('RF node type lạ hoặc thiếu params → lỗi', () => {
    expect(() => fromRFNode({ id: 'x', type: 'unknown', position: { x: 0, y: 0 }, data: { params: {} } })).toThrow();
    expect(() => fromRFNode({ id: 'x', type: 'brief', position: { x: 0, y: 0 }, data: {} })).toThrow();
  });

  it('RF edge thiếu handle → lỗi', () => {
    const e: Edge = { id: 'e', source: 'a', target: 'b' };
    expect(() => fromRFEdge(e)).toThrow();
  });

  it('toConnectionAttempt: thiếu handle → null', () => {
    expect(toConnectionAttempt({ source: 'a', target: 'b', sourceHandle: null, targetHandle: 'x' })).toBeNull();
    expect(toConnectionAttempt({ source: 'a', target: 'b', sourceHandle: 'p', targetHandle: 'q' }))
      .toEqual({ source: 'a', sourcePort: 'p', target: 'b', targetPort: 'q' });
  });

  it('kết nối kéo trên RF đi qua canConnect rồi thành edge có id xác định', () => {
    const graph = decompileJob(flatLegacy);
    const attempt = toConnectionAttempt({
      source: 'n-ratio', sourceHandle: 'ratio', target: 'n-generate-flat', targetHandle: 'ratio',
    })!;
    expect(canConnect(graph, attempt)).toEqual({ ok: false, reason: 'duplicate-edge' });
    expect(attemptToEdge(attempt).id).toBe(graph.edges.find((e) => e.target === 'n-generate-flat' && e.targetPort === 'ratio')!.id);
  });
});
