import { describe, expect, it } from 'vitest';
import { graphAttention, nodeAttention } from '../attention';
import { decompileJob } from '../decompiler';
import type { FlowGraph, FlowNode } from '../schema';
import { getTemplate, instantiateTemplate } from '../template';
import { flatFull } from './fixtures';

const node = (g: FlowGraph, id: string) => g.nodes.find((n) => n.id === id)! as FlowNode;
const setParams = (g: FlowGraph, id: string, patch: object): FlowGraph => ({
  ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, ...patch } } as FlowNode : n)),
});

describe('nodeAttention', () => {
  const g = decompileJob(flatFull);

  it('graph đủ thông tin, đủ dây → không node nào cần chú ý', () => {
    expect(graphAttention(g).size).toBe(0);
  });

  it('ảnh trống → "Chưa có thông tin" (warning)', () => {
    const g2 = setParams(g, 'n-product-0', { assetId: '', fileName: '', url: '' });
    expect(nodeAttention(g2, node(g2, 'n-product-0'))).toMatchObject({ level: 'warning', label: 'Chưa có thông tin', issues: [{ kind: 'empty' }] });
  });

  it('text / brief / kích thước / brand kit trống', () => {
    let g2 = setParams(g, 'n-text-sub', { content: '  ' });
    g2 = setParams(g2, 'n-brief', { prompt: '', marketingBrief: { campaignIntents: [], focalSubjects: [] } });
    g2 = setParams(g2, 'n-ratio', { ratios: [] });
    g2 = setParams(g2, 'n-brand', { colors: [], fontPreference: undefined, logoPosition: undefined });
    for (const id of ['n-text-sub', 'n-brief', 'n-ratio', 'n-brand']) {
      expect(nodeAttention(g2, node(g2, id))?.issues.map((i) => i.kind), id).toEqual(['empty']);
    }
  });

  it('node chưa nối ra → "Chưa nối"', () => {
    const g2 = { ...g, edges: g.edges.filter((e) => e.source !== 'n-style') };
    expect(nodeAttention(g2, node(g2, 'n-style'))).toMatchObject({ level: 'warning', label: 'Chưa nối', issues: [{ kind: 'unconnected' }] });
  });

  it('thiếu dây bắt buộc → "Thiếu dây" (error), liệt kê port; nguồn mất dây ra cũng báo chưa nối', () => {
    const g2 = { ...g, edges: g.edges.filter((e) => e.source !== 'n-brief') };
    const a = nodeAttention(g2, node(g2, 'n-generate-flat'))!;
    expect(a).toMatchObject({ level: 'error', label: 'Thiếu dây' });
    expect(a.issues[0]!.message).toContain('Brief');
    expect(nodeAttention(g2, node(g2, 'n-brief'))?.issues.map((i) => i.kind)).toEqual(['unconnected']);
  });

  it('template mới mở: chỉ ô ảnh sản phẩm trống cần chú ý', () => {
    const t = instantiateTemplate(getTemplate('product-hero')!);
    expect([...graphAttention(t.graph).keys()]).toEqual(['n-product-0']);
  });
});
