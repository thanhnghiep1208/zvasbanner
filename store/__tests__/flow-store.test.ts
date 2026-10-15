import { beforeEach, describe, expect, it } from 'vitest';
import { decompileJob } from '@/lib/flow/decompiler';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import { flatLegacy } from '@/lib/flow/__tests__/fixtures';
import { selectRFEdges, selectRFNodes, useFlowStore } from '../flow-store';

const store = () => useFlowStore.getState();

beforeEach(() => {
  store().reset();
  store().setGraph(decompileJob(flatLegacy));
});

describe('flow-store', () => {
  it('kéo node → cập nhật position trong graph domain, dragging chỉ ở ui', () => {
    store().onNodesChange([{ type: 'position', id: 'n-brief', position: { x: 50, y: 60 }, dragging: true }]);
    const node = store().graph.nodes.find((n) => n.id === 'n-brief')!;
    expect(node.position).toEqual({ x: 50, y: 60 });
    expect(node).not.toHaveProperty('dragging');
    expect(store().nodeUi['n-brief']).toEqual({ dragging: true });
  });

  it('select / dimensions không đổi graph', () => {
    const before = store().graph;
    store().onNodesChange([
      { type: 'select', id: 'n-brief', selected: true },
      { type: 'dimensions', id: 'n-brief', dimensions: { width: 240, height: 120 } },
    ]);
    expect(store().graph).toBe(before);
    const rf = selectRFNodes(store().graph, store().nodeUi).find((n) => n.id === 'n-brief')!;
    expect(rf).toMatchObject({ selected: true, measured: { width: 240, height: 120 } });
  });

  it('xoá node → xoá luôn edge nối vào nó', () => {
    store().onNodesChange([{ type: 'remove', id: 'n-ratio' }]);
    const { nodes, edges } = store().graph;
    expect(nodes.some((n) => n.id === 'n-ratio')).toBe(false);
    expect(edges.some((e) => e.source === 'n-ratio' || e.target === 'n-ratio')).toBe(false);
  });

  it('xoá / chọn edge', () => {
    const edge = store().graph.edges[0]!;
    store().onEdgesChange([{ type: 'select', id: edge.id, selected: true }]);
    expect(selectRFEdges(store().graph, store().edgeUi)[0]).toMatchObject({ id: edge.id, selected: true });
    store().onEdgesChange([{ type: 'remove', id: edge.id }]);
    expect(store().graph.edges.some((e) => e.id === edge.id)).toBe(false);
  });

  it('connect hợp lệ → thêm edge (handle id = port id)', () => {
    store().setGraph({
      ...store().graph,
      nodes: [...store().graph.nodes, {
        id: 'n-text-x', type: 'text-layer',
        params: { ...NODE_DEFINITIONS['text-layer'].defaultParams, layerId: 'x' }, position: { x: 0, y: 0 },
      }],
    });
    const res = store().connect({ source: 'n-text-x', sourceHandle: 'text', target: 'n-generate-flat', targetHandle: 'text' });
    expect(res).toEqual({ ok: true });
    expect(store().graph.edges.at(-1)).toMatchObject({
      source: 'n-text-x', sourcePort: 'text', target: 'n-generate-flat', targetPort: 'text',
    });
  });

  it('connect sai luật → không thêm edge, trả lý do', () => {
    const count = store().graph.edges.length;
    expect(store().connect({ source: 'n-brief', sourceHandle: 'brief', target: 'n-generate-flat', targetHandle: 'ratio' }))
      .toEqual({ ok: false, reason: 'type-mismatch' });
    expect(store().connect({ source: 'n-brief', sourceHandle: null, target: 'n-generate-flat', targetHandle: 'brief' }))
      .toEqual({ ok: false, reason: 'unknown-port' });
    expect(store().graph.edges).toHaveLength(count);
  });
});
