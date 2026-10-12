import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS } from '../node-definitions';
import { canConnect } from '../connection-rules';
import { validateGraph } from '../validate';
import { compileGraph } from '../compiler';
import { decompileJob } from '../decompiler';
import { composedMinimal } from './fixtures';

describe('invariant: asset fidelity', () => {
  it('không executor non-legacy nào nhận port product', () => {
    const offenders = Object.values(NODE_DEFINITIONS)
      .filter((d) => d.kind === 'executor' && !d.legacy)
      .filter((d) => d.inputs.some((p) => p.type === 'product'))
      .map((d) => d.type);
    expect(offenders).toEqual([]);
  });
  it('mọi node có aiCallsPerRatio > 0 đều là executor', () => {
    const bad = Object.values(NODE_DEFINITIONS)
      .filter((d) => d.aiCallsPerRatio > 0 && d.kind !== 'executor');
    expect(bad).toEqual([]);
  });
});

describe('canConnect', () => {
  const graph = decompileJob(composedMinimal);

  it('product → generate-background bị chặn (không có port)', () => {
    expect(canConnect(graph, {
      source: 'n-product-0', sourcePort: 'product', target: 'n-generate', targetPort: 'product',
    })).toEqual({ ok: false, reason: 'unknown-port' });
  });
  it('sai kiểu bị chặn', () => {
    expect(canConnect(graph, {
      source: 'n-brief', sourcePort: 'brief', target: 'n-layout', targetPort: 'ratio',
    })).toEqual({ ok: false, reason: 'type-mismatch' });
  });
  it('port đơn đã có kết nối bị chặn', () => {
    const g = { ...graph, nodes: [...graph.nodes, {
      id: 'n-brief-2', type: 'brief' as const, params: { prompt: 'x', marketingBrief: { campaignIntents: [], focalSubjects: [] } }, position: { x: 0, y: 0 },
    }] };
    expect(canConnect(g, {
      source: 'n-brief-2', sourcePort: 'brief', target: 'n-generate', targetPort: 'brief',
    })).toEqual({ ok: false, reason: 'port-occupied' });
  });
  it('trùng edge bị chặn', () => {
    expect(canConnect(graph, {
      source: 'n-ratio', sourcePort: 'ratio', target: 'n-layout', targetPort: 'ratio',
    })).toEqual({ ok: false, reason: 'duplicate-edge' });
  });
  it('vòng lặp bị chặn', () => {
    const g = { ...graph, nodes: [...graph.nodes, {
      id: 'n-layout-2', type: 'auto-layout' as const, params: { overrides: {} }, position: { x: 0, y: 0 },
    }], edges: [...graph.edges, {
      id: 'tmp', source: 'n-layout', sourcePort: 'layout', target: 'n-layout-2', targetPort: 'ratio',
    }] };
    expect(canConnect(g, {
      source: 'n-layout-2', sourcePort: 'layout', target: 'n-generate', targetPort: 'layout',
    }).ok).toBe(false);
  });
  it('thêm text layer vào auto-layout hợp lệ (port multiple)', () => {
    const g = { ...graph, nodes: [...graph.nodes, {
      id: 'n-text-new', type: 'text-layer' as const,
      params: { ...NODE_DEFINITIONS['text-layer'].defaultParams, layerId: 'new' }, position: { x: 0, y: 0 },
    }] };
    expect(canConnect(g, {
      source: 'n-text-new', sourcePort: 'text', target: 'n-layout', targetPort: 'text',
    })).toEqual({ ok: true });
  });
});

describe('validateGraph', () => {
  it('thiếu brief → lỗi missing-input, compile thất bại', () => {
    const g = decompileJob(composedMinimal);
    g.edges = g.edges.filter((e) => e.source !== 'n-brief');
    expect(validateGraph(g).map((i) => i.code)).toContain('missing-input');
    expect(compileGraph(g).ok).toBe(false);
  });
  it('subheadline render AI → lỗi', () => {
    const g = decompileJob(composedMinimal);
    const t = g.nodes.find((n) => n.type === 'text-layer')!;
    (t.params as { role: string; renderSource: string }).role = 'subheadline';
    (t.params as { role: string; renderSource: string }).renderSource = 'ai';
    expect(validateGraph(g).map((i) => i.code)).toContain('ai-text-role');
  });
  it('2 node export → lỗi', () => {
    const g = decompileJob(composedMinimal);
    g.nodes.push({ ...g.nodes.find((n) => n.type === 'export')!, id: 'n-export-2' });
    expect(validateGraph(g).map((i) => i.code)).toContain('export-count');
  });
});
