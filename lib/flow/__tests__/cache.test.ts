import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { downstreamOf, hashString, nodeKeys, stableStringify } from '../cache-keys';
import { decompileJob } from '../decompiler';
import { pendingAiCalls, runAll, type ImageCache } from '../executor';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import type { BackgroundRequest } from '../background/request';
import type { FlowGraph } from '../schema';
import { composedFull } from './fixtures';
import { LEGACY_FIXTURES } from './fixtures/legacy';

const MINIAPP = { id: 'zalo-banner-miniapp', width: 1032, height: 810, platform: 'Zalo', name: 'Banner in Miniapp' };

function memoryCache(): ImageCache & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k), set: (k, v) => { map.set(k, v); } };
}

function flatGraph(extraSize = true) {
  const { job, runtime } = fromLegacyConfig(LEGACY_FIXTURES['logged-headline-cta']!.request);
  if (extraSize) job.ratios.push(MINIAPP);
  return { graph: decompileJob(job), runtime };
}

function flatDeps(cache?: ImageCache, forceNodes?: Set<string>) {
  const calls: GenerationRequest[] = [];
  let n = 0;
  return {
    calls,
    deps: {
      sleep: async () => {},
      cache,
      forceNodes,
      generate: async (r: GenerationRequest) => { calls.push(r); n++; return { ok: true as const, image: `img-${n}`, source: 'gemini' as const }; },
      onRunInfo: () => {},
    },
  };
}

const setParam = (g: FlowGraph, id: string, patch: object): FlowGraph => ({
  ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, ...patch } as never } : n)),
});

describe('cache-keys', () => {
  it('stableStringify không phụ thuộc thứ tự key, bỏ undefined', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(stableStringify({ a: [2, { d: 3 }], b: 1 }));
  });
  it('hashString 16 hex, khác nhau cho chuỗi khác nhau', () => {
    expect(hashString('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  const { graph } = flatGraph();
  const keys = nodeKeys(graph);

  it('mọi node có key; deterministic', () => {
    expect(Object.keys(keys).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    expect(nodeKeys(graph)).toEqual(keys);
  });

  it('đổi params ở brief → brief + downstream đổi key, nhánh khác giữ nguyên', () => {
    const after = nodeKeys(setParam(graph, 'n-brief', { prompt: 'khác' }));
    expect(after['n-brief']).not.toBe(keys['n-brief']);
    expect(after['n-generate-flat']).not.toBe(keys['n-generate-flat']);
    expect(after['n-export']).not.toBe(keys['n-export']);
    expect(after['n-ratio']).toBe(keys['n-ratio']);
    expect(after['n-style']).toBe(keys['n-style']);
  });

  it('kéo node (đổi position) không đổi key', () => {
    const moved = { ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: { x: n.position.x + 99, y: 7 } })) };
    expect(nodeKeys(moved)).toEqual(keys);
  });

  it('downstreamOf gồm chính node + mọi node phía sau', () => {
    expect([...downstreamOf(graph, 'n-brief')].sort()).toEqual(['n-brief', 'n-export', 'n-generate-flat'].sort());
  });
});

describe('executor cache (flat)', () => {
  it('chạy lại cùng graph → 0 lượt gọi API, cùng ảnh, reused = số kích thước', async () => {
    const { graph, runtime } = flatGraph();
    const cache = memoryCache();
    const first = flatDeps(cache);
    const out1 = await runAll(graph, runtime, first.deps);
    expect(first.calls).toHaveLength(2);
    const second = flatDeps(cache);
    const out2 = await runAll(graph, runtime, second.deps);
    expect(second.calls).toHaveLength(0);
    expect(out2.ok && out2.reused).toBe(2);
    expect(out2.ok && out2.results.map((r) => r.image)).toEqual(out1.ok && out1.results.map((r) => r.image));
  });

  it('đổi brief → cache trượt, gọi lại cả 2 kích thước', async () => {
    const { graph, runtime } = flatGraph();
    const cache = memoryCache();
    await runAll(graph, runtime, flatDeps(cache).deps);
    const again = flatDeps(cache);
    await runAll(setParam(graph, 'n-brief', { prompt: 'Brief mới' }), runtime, again.deps);
    expect(again.calls).toHaveLength(2);
  });

  it('"Chạy lại từ node" (forceNodes) bỏ qua cache; kích thước phụ theo ảnh đầu mới', async () => {
    const { graph, runtime } = flatGraph();
    const cache = memoryCache();
    await runAll(graph, runtime, flatDeps(cache).deps);
    const forced = flatDeps(cache, downstreamOf(graph, 'n-generate-flat'));
    const out = await runAll(graph, runtime, forced.deps);
    expect(forced.calls).toHaveLength(2);
    expect(forced.calls[1]!.layoutAdaptationFromBanner).toBe('img-1');
    expect(out.ok && out.reused).toBe(0);
  });

  it('node done mang key hiện tại (để UI so stale)', async () => {
    const { graph, runtime } = flatGraph(false);
    const states: Record<string, { key?: string; state: string }> = {};
    await runAll(graph, runtime, { ...flatDeps().deps, onRunInfo: (id, info) => { states[id] = info; } });
    expect(states['n-generate-flat']).toMatchObject({ state: 'done', key: nodeKeys(graph)['n-generate-flat'] });
  });
});

describe('executor cache (composed)', () => {
  const runtime = { dataUrls: { 'ref-1': 'data:image/png;base64,R', 'ref-bg': 'data:image/png;base64,B' } };
  const deps = (cache: ImageCache, calls: BackgroundRequest[]) => ({
    sleep: async () => {},
    cache,
    guideStyle: 'natural' as const,
    generate: async () => { throw new Error('không dùng'); },
    generateBackground: async (r: BackgroundRequest) => { calls.push(r); return { ok: true as const, image: `bg-${calls.length}` }; },
    onRunInfo: () => {},
  });

  it('nền đã có trong cache → không gọi lại', async () => {
    const graph = decompileJob(composedFull);
    const cache = memoryCache();
    const calls: BackgroundRequest[] = [];
    await runAll(graph, runtime, deps(cache, calls));
    expect(calls).toHaveLength(2);
    await runAll(graph, runtime, deps(cache, calls));
    expect(calls).toHaveLength(2);
    expect(pendingAiCalls(graph, runtime, cache, { guideStyle: 'natural' })).toEqual({ calls: 0, reused: 2 });
  });

  it('đổi MÀU chữ CTA (chỉ ảnh hưởng bước ghép) → vẫn trúng cache nền, 0 lượt AI', async () => {
    const graph = decompileJob(composedFull);
    const cache = memoryCache();
    const calls: BackgroundRequest[] = [];
    await runAll(graph, runtime, deps(cache, calls));
    const cta = graph.nodes.find((n) => n.id === 'n-text-cta')!;
    const recolored = setParam(graph, 'n-text-cta', { style: { ...(cta.params as { style: object }).style, fill: { kind: 'solid', color: '#00FF00' } } });
    expect(pendingAiCalls(recolored, runtime, cache, { guideStyle: 'natural' })).toEqual({ calls: 0, reused: 2 });
    await runAll(recolored, runtime, deps(cache, calls));
    expect(calls).toHaveLength(2);
  });

  it('đổi NỘI DUNG chữ → vùng chữ trong layout đổi → sinh nền lại', async () => {
    const graph = decompileJob(composedFull);
    const cache = memoryCache();
    const calls: BackgroundRequest[] = [];
    await runAll(graph, runtime, deps(cache, calls));
    await runAll(setParam(graph, 'n-text-sub', { content: 'Quà tặng cao cấp từ 499K cho cả gia đình ba thế hệ' }), runtime, deps(cache, calls));
    expect(calls).toHaveLength(4);
  });
});

describe('pendingAiCalls', () => {
  it('flat: lần đầu = estimate; sau khi chạy = 0; đổi brief = lại đầy đủ', async () => {
    const { graph, runtime } = flatGraph();
    const cache = memoryCache();
    expect(pendingAiCalls(graph, runtime, cache)).toEqual({ calls: 4, reused: 0 });
    await runAll(graph, runtime, flatDeps(cache).deps);
    expect(pendingAiCalls(graph, runtime, cache)).toEqual({ calls: 0, reused: 2 });
    expect(pendingAiCalls(setParam(graph, 'n-brief', { prompt: 'x' }), runtime, cache)).toEqual({ calls: 4, reused: 0 });
  });
  it('forceNodes → tính như chưa có cache', async () => {
    const { graph, runtime } = flatGraph();
    const cache = memoryCache();
    await runAll(graph, runtime, flatDeps(cache).deps);
    expect(pendingAiCalls(graph, runtime, cache, { forceNodes: new Set(['n-generate-flat']) })).toEqual({ calls: 4, reused: 0 });
  });
  it('graph lỗi → null', () => {
    const { graph, runtime } = flatGraph();
    expect(pendingAiCalls({ ...graph, edges: graph.edges.filter((e) => e.source !== 'n-brief') }, runtime, undefined)).toBeNull();
  });
});
