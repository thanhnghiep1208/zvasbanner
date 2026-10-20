import type { FlowGraph, FlowNode } from './schema';

/**
 * Node Xuất ảnh nhận tối đa 2 nguồn (composition + raster): mỗi nguồn là 1 nhánh chạy riêng.
 * Tách graph thành 1 graph con / nguồn = node Xuất ảnh + mọi node phía trên nguồn đó.
 * 0–1 nguồn → trả nguyên graph (hành vi cũ).
 */
export function exportBranches(graph: FlowGraph): FlowGraph[] {
  const exportNode = graph.nodes.find((n) => n.type === 'export') as FlowNode<'export'> | undefined;
  if (!exportNode) return [graph];
  const sources = graph.edges.filter((e) => e.target === exportNode.id);
  if (sources.length <= 1) return [graph];

  const branches: FlowGraph[] = [];
  for (const edge of sources) {
    const keep = new Set([exportNode.id]);
    const stack = [edge.source];
    while (stack.length) {
      const id = stack.pop()!;
      if (keep.has(id)) continue;
      keep.add(id);
      for (const e of graph.edges) if (e.target === id) stack.push(e.source);
    }
    const nodes = graph.nodes.filter((n) => keep.has(n.id));
    // Kích thước xuất chọn riêng: chỉ giữ kích thước thuộc nhánh này; nhánh không có kích thước nào được xuất thì bỏ.
    const { ratioIds } = exportNode.params;
    let branchRatioIds = ratioIds;
    if (ratioIds !== 'all') {
      const known = new Set(nodes.filter((n) => n.type === 'ratio')
        .flatMap((n) => (n as FlowNode<'ratio'>).params.ratios.map((r) => r.id)));
      branchRatioIds = ratioIds.filter((id) => known.has(id));
      if (!branchRatioIds.length) continue;
    }
    branches.push({
      ...graph,
      nodes: nodes.map((n) => (n.id === exportNode.id
        ? { ...n, params: { ...exportNode.params, ratioIds: branchRatioIds } } as FlowNode
        : n)),
      edges: graph.edges.filter((e) => keep.has(e.target) && keep.has(e.source)
        && (e.target !== exportNode.id || e.id === edge.id)),
    });
  }
  return branches;
}
