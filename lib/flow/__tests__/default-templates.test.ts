import { describe, expect, it } from 'vitest';
import { getAllPresets } from '@/lib/canvas-presets';
import { estimateAiCalls } from '../compiled-job';
import { compileGraph } from '../compiler';
import type { NodeParamsMap } from '../schema';
import { DEFAULT_TEMPLATES, getTemplate, instantiateTemplate, setExposedValue, validateTemplate } from '../template';
import { validateGraph } from '../validate';

const uploaded: NodeParamsMap['product-asset'] = {
  assetId: 'a1', url: 'blob:x', fileName: 'sp.png', role: 'image', hasAlpha: true,
  originalDims: { width: 800, height: 800 },
};

describe('template mặc định (T5.3)', () => {
  it('3–5 template, id không trùng, getTemplate tìm được', () => {
    expect(DEFAULT_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_TEMPLATES.length).toBeLessThanOrEqual(5);
    expect(new Set(DEFAULT_TEMPLATES.map((t) => t.id)).size).toBe(DEFAULT_TEMPLATES.length);
    for (const t of DEFAULT_TEMPLATES) expect(getTemplate(t.id)).toBe(t);
  });

  describe.each(DEFAULT_TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, t) => {
    it('hợp lệ theo validateTemplate', () => {
      expect(validateTemplate(t)).toEqual([]);
    });

    it('chưa upload ảnh: không lỗi, không cảnh báo (kể cả chữ vừa mọi kích thước)', () => {
      expect(validateGraph(t.graph)).toEqual([]);
    });

    it('composed, ảnh sản phẩm là field bắt buộc đầu tiên', () => {
      const job = compileGraph(t.graph);
      expect(job.ok && job.job.renderMode).toBe('composed');
      const first = t.exposed[0]!;
      expect(first).toMatchObject({ control: 'asset', required: true });
      expect(t.graph.nodes.find((n) => n.id === first.nodeId)?.type).toBe('product-asset');
    });

    it('kích thước là preset có thật hoặc custom-<w>x<h> khớp kích thước', () => {
      const presets = new Map(getAllPresets().map((p) => [p.id, p]));
      const ratios = (t.graph.nodes.find((n) => n.type === 'ratio')!.params as NodeParamsMap['ratio']).ratios;
      for (const r of ratios) {
        const p = presets.get(r.id);
        if (p) expect([r.width, r.height, r.name]).toEqual([p.width, p.height, p.name]);
        else expect(r.id).toBe(`custom-${r.width}x${r.height}`);
      }
    });

    it('upload ảnh qua exposed → compile được, số lượt AI = số kích thước', () => {
      const p = instantiateTemplate(t);
      const graph = setExposedValue(p.graph, p.exposed[0]!, uploaded);
      const res = compileGraph(graph);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.job.products[0]!.assetId).toBe('a1');
      expect(estimateAiCalls(res.job)).toBe(res.job.ratios.length);
      expect(res.job.textLayers.every((l) => l.renderSource === 'layer')).toBe(true);
    });
  });
});
