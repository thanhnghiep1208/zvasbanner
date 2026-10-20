import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { decompileJob } from '../decompiler';
import { compileAll } from '../compiler';
import { exportBranches } from '../branches';
import { pendingAiCalls, runAll } from '../executor';
import { validateGraph } from '../validate';
import type { BackgroundRequest } from '../background/request';
import type { FlowEdge, FlowGraph, FlowNode } from '../schema';
import { composedMinimal } from './fixtures';

/** Canvas có cả 2 luồng: Ghép layer và Tạo banner (flat) cùng nối vào Xuất ảnh. */
function mixedGraph(): FlowGraph {
  const g = decompileJob(composedMinimal);
  const flat = { id: 'n-flat', type: 'generate-flat', position: { x: 0, y: 0 },
    params: { model: 'nano-banana-2', strictPreserveMode: true } } as FlowNode;
  const edge = (source: string, sourcePort: string, target: string, targetPort: string): FlowEdge =>
    ({ id: `e-${source}-${target}-${targetPort}`, source, sourcePort, target, targetPort });
  return {
    ...g,
    nodes: [...g.nodes, flat],
    edges: [
      ...g.edges,
      edge('n-ratio', 'ratio', 'n-flat', 'ratio'),
      edge('n-brief', 'brief', 'n-flat', 'brief'),
      edge('n-product-0', 'product', 'n-flat', 'product'),
      edge('n-text-headline', 'text', 'n-flat', 'text'),
      edge('n-flat', 'raster', 'n-export', 'raster'),
    ],
  };
}

const runtime = { dataUrls: { 'asset-noi-chien': 'data:image/png;base64,P' } };

describe('Xuất ảnh nối 2 nguồn', () => {
  it('hợp lệ, tách 2 nhánh, mỗi nhánh 1 job', () => {
    const graph = mixedGraph();
    expect(validateGraph(graph).filter((i) => i.severity === 'error')).toEqual([]);
    const branches = exportBranches(graph);
    expect(branches).toHaveLength(2);
    expect(branches[1]!.nodes.some((n) => n.type === 'compose')).toBe(false);
    const compiled = compileAll(graph);
    expect(compiled.ok && compiled.branches.map((b) => b.job.renderMode)).toEqual(['composed', 'flat']);
  });

  it('chưa nối nguồn nào → lỗi', () => {
    const graph = mixedGraph();
    graph.edges = graph.edges.filter((e) => e.target !== 'n-export');
    expect(validateGraph(graph).some((i) => i.code === 'export-source')).toBe(true);
  });

  it('chạy cả 2 nhánh, gộp kết quả gắn nhãn nhánh; lượt AI = tổng 2 nhánh', async () => {
    const graph = mixedGraph();
    expect(pendingAiCalls(graph, runtime, undefined)).toEqual({ calls: 1 + 2, reused: 0 });
    const bg: BackgroundRequest[] = [];
    const flat: GenerationRequest[] = [];
    const out = await runAll(graph, runtime, {
      sleep: async () => {},
      onRunInfo: () => {},
      guideStyle: 'natural',
      generateBackground: async (r) => { bg.push(r); return { ok: true, image: 'bg' }; },
      generate: async (r) => { flat.push(r); return { ok: true, image: 'flat', source: 'gemini' }; },
    });
    expect(bg).toHaveLength(1);
    expect(flat).toHaveLength(1);
    expect(out.ok && out.results.map((r) => [r.branch, r.image])).toEqual([['composed', 'bg'], ['flat', 'flat']]);
  });

  it('1 nhánh lỗi vẫn chạy nhánh còn lại', async () => {
    const out = await runAll(mixedGraph(), runtime, {
      sleep: async () => {},
      onRunInfo: () => {},
      guideStyle: 'natural',
      generateBackground: async () => ({ ok: false, error: 'Gemini quá tải' }),
      generate: async () => ({ ok: true, image: 'flat', source: 'gemini' }),
    });
    expect(out.ok).toBe(false);
    expect(out.results.map((r) => r.branch)).toEqual(['flat']);
  });
});
