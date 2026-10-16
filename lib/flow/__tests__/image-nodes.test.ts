import { describe, expect, it } from 'vitest';
import { compileGraph } from '../compiler';
import { addImageNode, removeImageNode, setImageRole } from '../image-nodes';
import type { FlowAsset, FlowGraph, NodeParamsMap } from '../schema';
import { getTemplate, instantiateTemplate, setExposedValue } from '../template';
import { validateGraph } from '../validate';

const asset = (role: FlowAsset['role'], id: string = role): FlowAsset => ({
  assetId: id, url: 'blob:x', fileName: `${id}.png`, role, hasAlpha: true, originalDims: { width: 400, height: 300 },
});

function heroWithProduct(): FlowGraph {
  const t = instantiateTemplate(getTemplate('product-hero')!);
  return setExposedValue(t.graph, t.exposed[0]!, asset('image', 'sp') as NodeParamsMap['product-asset']);
}

const outEdges = (g: FlowGraph, id: string) => g.edges.filter((e) => e.source === id).map((e) => `${e.target}.${e.targetPort}`).sort();

describe('image-nodes (Simple view nhiều ảnh)', () => {
  it('thêm ảnh giữ pixel: nối giống ảnh sản phẩm có sẵn, graph không lỗi, compile ra 2 product', () => {
    const { graph, id } = addImageNode(heroWithProduct(), asset('logo'));
    expect(graph.nodes.find((n) => n.id === id)?.type).toBe('product-asset');
    expect(outEdges(graph, id)).toEqual(outEdges(graph, 'n-product-0'));
    expect(validateGraph(graph).filter((i) => i.severity === 'error')).toEqual([]);
    const res = compileGraph(graph);
    expect(res.ok && res.job.products.map((p) => p.role).sort()).toEqual(['image', 'logo']);
  });

  it('thêm ảnh tham chiếu: node reference-image nối vào ô image', () => {
    const { graph, id } = addImageNode(heroWithProduct(), asset('style-reference'));
    expect(graph.nodes.find((n) => n.id === id)?.type).toBe('reference-image');
    const edges = graph.edges.filter((e) => e.source === id);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((e) => e.sourcePort === 'image' && e.targetPort === 'image')).toBe(true);
    expect(validateGraph(graph).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('thêm nhiều ảnh: id không trùng, xếp dưới nhau', () => {
    const a = addImageNode(heroWithProduct(), asset('logo'));
    const b = addImageNode(a.graph, asset('decoration'));
    expect(a.id).not.toBe(b.id);
    const pos = (id: string) => b.graph.nodes.find((n) => n.id === id)!.position;
    expect(pos(b.id).y).toBeGreaterThan(pos(a.id).y);
  });

  it('đổi loại trong cùng nhóm chỉ đổi role, không đổi dây', () => {
    const g = heroWithProduct();
    const next = setImageRole(g, 'n-product-0', 'logo');
    expect(next.edges).toBe(g.edges);
    expect((next.nodes.find((n) => n.id === 'n-product-0')!.params as FlowAsset).role).toBe('logo');
  });

  it('đổi sang nhóm khác: đổi type, giữ ảnh, nối lại dây; đổi về như cũ', () => {
    const g = heroWithProduct();
    const ref = setImageRole(g, 'n-product-0', 'background');
    const node = ref.nodes.find((n) => n.id === 'n-product-0')!;
    expect(node.type).toBe('reference-image');
    expect((node.params as FlowAsset).fileName).toBe('sp.png');
    expect(ref.edges.filter((e) => e.source === 'n-product-0').every((e) => e.sourcePort === 'image')).toBe(true);
    const back = setImageRole(ref, 'n-product-0', 'image');
    expect(outEdges(back, 'n-product-0')).toEqual(outEdges(g, 'n-product-0'));
  });

  it('xoá ảnh xoá luôn dây', () => {
    const { graph, id } = addImageNode(heroWithProduct(), asset('logo'));
    const next = removeImageNode(graph, id);
    expect(next.nodes.some((n) => n.id === id)).toBe(false);
    expect(next.edges.some((e) => e.source === id)).toBe(false);
  });
});
