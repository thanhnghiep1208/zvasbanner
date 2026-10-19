import { describe, expect, it } from 'vitest';
import { compileGraph } from '../compiler';
import { addImageNode, filledImageNodes, placeLogo, removeAllImages, removeImageNode, setImageRole } from '../image-nodes';
import type { FlowAsset, FlowGraph, NodeParamsMap } from '../schema';
import { getTemplate, instantiateTemplate, setExposedValue } from '../template';
import { ASSET_UNCONNECTED_MESSAGE, validateGraph } from '../validate';

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

  it('xoá tất cả ảnh: ô ảnh template chỉ làm trống (giữ node + dây), ảnh thêm thì xoá; node trống không tính', () => {
    const base = heroWithProduct();
    const { graph, id } = addImageNode(base, asset('logo'));
    expect(filledImageNodes(graph).map((n) => n.id).sort()).toEqual([id, 'n-product-0'].sort());
    const next = removeAllImages(graph, new Set(['n-product-0']));
    const kept = next.nodes.find((n) => n.id === 'n-product-0')!;
    expect((kept.params as FlowAsset).assetId).toBe('');
    expect((kept.params as FlowAsset).role).toBe('image');
    expect(next.edges.filter((e) => e.source === 'n-product-0')).toEqual(base.edges.filter((e) => e.source === 'n-product-0'));
    expect(next.nodes.some((n) => n.id === id)).toBe(false);
    expect(filledImageNodes(next)).toEqual([]);
  });
});

describe('cảnh báo ảnh chưa nối (asset-unconnected)', () => {
  it('ảnh không có dây ra → cảnh báo trên node đó; nối rồi thì hết', () => {
    const base = heroWithProduct();
    const lone = { id: 'n-lone', type: 'reference-image', position: { x: 0, y: 0 },
      params: { ...asset('style-reference', 'lone') } } as FlowGraph['nodes'][number];
    const graph = { ...base, nodes: [...base.nodes, lone] };
    const warn = validateGraph(graph).filter((i) => i.code === 'asset-unconnected');
    expect(warn).toEqual([{ severity: 'warning', code: 'asset-unconnected', nodeId: 'n-lone', message: ASSET_UNCONNECTED_MESSAGE }]);
    expect(validateGraph(base).some((i) => i.code === 'asset-unconnected')).toBe(false);
    // Ảnh thêm từ Simple view được nối sẵn → không cảnh báo.
    expect(validateGraph(addImageNode(base, asset('logo')).graph).some((i) => i.code === 'asset-unconnected')).toBe(false);
  });
});

describe('placeLogo (logo lấy từ website)', () => {
  const { assetId, url, fileName, hasAlpha, originalDims } = asset('logo', 'web-logo');
  const logo = { assetId, url, fileName, hasAlpha, originalDims };
  it('chưa có node Logo → thêm node Logo, nối như ảnh giữ pixel, không lỗi', () => {
    const { graph, id } = placeLogo(heroWithProduct(), logo);
    const n = graph.nodes.find((x) => x.id === id)!;
    expect(n.type).toBe('product-asset');
    expect((n.params as NodeParamsMap['product-asset']).role).toBe('logo');
    expect(outEdges(graph, id)).toEqual(outEdges(graph, 'n-product-0'));
    expect(validateGraph(graph).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('node Logo còn trống → điền vào đó, giữ id và dây; Logo đã có ảnh → thêm node mới', () => {
    const base = addImageNode(heroWithProduct(), { ...asset('logo', ''), assetId: '' });
    const filled = placeLogo(base.graph, logo);
    expect(filled.id).toBe(base.id);
    expect(filled.graph.nodes.length).toBe(base.graph.nodes.length);
    expect(outEdges(filled.graph, base.id)).toEqual(outEdges(base.graph, base.id));
    expect((filled.graph.nodes.find((n) => n.id === base.id)!.params as NodeParamsMap['product-asset']).assetId).toBe('web-logo');
    const again = placeLogo(filled.graph, { ...logo, assetId: 'web-logo-2' });
    expect(again.id).not.toBe(base.id);
    expect(again.graph.nodes.length).toBe(base.graph.nodes.length + 1);
  });
});
