import { beforeEach, describe, expect, it } from 'vitest';
import { decompileJob } from '@/lib/flow/decompiler';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import { flatLegacy } from '@/lib/flow/__tests__/fixtures';
import { displayRunInfo, freePosition, nextNodeId, selectRFEdges, selectRFNodes, selectSingleSelectedNode, useFlowStore } from '../flow-store';

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

  it('addNode: params mặc định (bản sao), id ổn định, chỉ chọn node mới', () => {
    store().onNodesChange([{ type: 'select', id: 'n-brief', selected: true }]);
    const id = store().addNode('text-layer', { x: 10, y: 20 });
    expect(id).toBe('n-text-layer-1');
    expect(store().addNode('text-layer', { x: 0, y: 0 })).toBe('n-text-layer-2');
    const node = store().graph.nodes.find((n) => n.id === id)!;
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect((node.params as { layerId: string }).layerId).toBe(id);
    expect(node.params).not.toBe(NODE_DEFINITIONS['text-layer'].defaultParams);
    expect(selectSingleSelectedNode(store().graph, store().nodeUi)?.id).toBe('n-text-layer-2');
  });

  it('updateNodeParams gộp nông vào params, node khác giữ nguyên object', () => {
    const other = store().graph.nodes.find((n) => n.id === 'n-ratio');
    store().updateNodeParams<'brief'>('n-brief', { prompt: 'Mới' });
    const brief = store().graph.nodes.find((n) => n.id === 'n-brief')!;
    expect(brief.params).toMatchObject({ prompt: 'Mới', marketingBrief: { campaignIntents: ['flash-sale'] } });
    expect(store().graph.nodes.find((n) => n.id === 'n-ratio')).toBe(other);
  });

  it('selectSingleSelectedNode: 0 hoặc >1 node chọn → null', () => {
    expect(selectSingleSelectedNode(store().graph, store().nodeUi)).toBeNull();
    store().onNodesChange([
      { type: 'select', id: 'n-brief', selected: true },
      { type: 'select', id: 'n-ratio', selected: true },
    ]);
    expect(selectSingleSelectedNode(store().graph, store().nodeUi)).toBeNull();
  });

  it('nextNodeId lấp chỗ trống nhỏ nhất', () => {
    const g = { nodes: [{ id: 'n-ratio-1' }, { id: 'n-ratio-3' }], edges: [] } as never;
    expect(nextNodeId(g, 'ratio')).toBe('n-ratio-2');
  });

  it('setAssetData lưu dataUrl theo assetId, reset xoá', () => {
    store().setAssetData('a1', 'data:image/png;base64,x');
    expect(store().assetData).toEqual({ a1: 'data:image/png;base64,x' });
    store().reset();
    expect(store().assetData).toEqual({});
  });

  it('freePosition lệch chéo khi chỗ đã có node', () => {
    const g = { nodes: [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: 32, y: 32 } }], edges: [] } as never;
    expect(freePosition(g, { x: 0, y: 0 })).toEqual({ x: 64, y: 64 });
    expect(freePosition(g, { x: 500, y: 0 })).toEqual({ x: 500, y: 0 });
  });

  it('displayRunInfo: done + key khác key hiện tại → stale (giữ preview); key trùng / chưa có key → giữ nguyên', () => {
    const done = { state: 'done' as const, key: 'k1', previewUrl: 'p' };
    expect(displayRunInfo(done, 'k2')).toEqual({ state: 'stale', key: 'k1', previewUrl: 'p' });
    expect(displayRunInfo(done, 'k1')).toBe(done);
    expect(displayRunInfo({ state: 'done' }, 'k2')).toEqual({ state: 'done' });
    expect(displayRunInfo({ state: 'error', key: 'k1', message: 'x' }, 'k2')).toMatchObject({ state: 'error' });
    expect(displayRunInfo(undefined, 'k1')).toBeUndefined();
  });

  it('loadTemplate: graph + exposed (bản sao); setExposed ghi thẳng vào graph; setGraph bỏ exposed', () => {
    const template = {
      id: 't1', name: 'T', description: '', graph: decompileJob(flatLegacy),
      exposed: [{ id: 'brief', nodeId: 'n-brief', path: ['prompt'], label: 'Mô tả', control: 'textarea' as const }],
    };
    store().loadTemplate(template);
    expect(store().templateId).toBe('t1');
    expect(store().exposed.map((e) => e.id)).toEqual(['brief']);
    store().setExposed(store().exposed[0]!, 'Brief từ Simple view');
    expect((store().graph.nodes.find((n) => n.id === 'n-brief')!.params as { prompt: string }).prompt).toBe('Brief từ Simple view');
    expect((template.graph.nodes.find((n) => n.id === 'n-brief')!.params as { prompt: string }).prompt).not.toBe('Brief từ Simple view');
    store().setGraph(decompileJob(flatLegacy));
    expect(store().exposed).toEqual([]);
    expect(store().templateId).toBeNull();
  });

  it('view: graph thường → canvas, không vào được simple; template có exposed → mở simple, đổi qua lại được', () => {
    expect(store().view).toBe('canvas');
    store().setView('simple');
    expect(store().view).toBe('canvas');
    store().loadTemplate({
      id: 't', name: 'T', description: '', graph: decompileJob(flatLegacy),
      exposed: [{ id: 'b', nodeId: 'n-brief', path: ['prompt'], label: 'Mô tả', control: 'textarea' }],
    });
    expect(store().view).toBe('simple');
    store().setView('canvas');
    expect(store().view).toBe('canvas');
    store().setView('simple');
    expect(store().view).toBe('simple');
  });
});
