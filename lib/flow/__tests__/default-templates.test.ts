import { describe, expect, it } from 'vitest';
import { getAllPresets } from '@/lib/canvas-presets';
import { estimateAiCalls } from '../compiled-job';
import { compileGraph } from '../compiler';
import type { NodeParamsMap } from '../schema';
import { DEFAULT_TEMPLATES, getTemplate, instantiateTemplate, setExposedValue, validateTemplate } from '../template';
import { validateGraph } from '../validate';
import { toLegacyConfig } from '../legacy/to-legacy-config';

const uploaded: NodeParamsMap['product-asset'] = {
  assetId: 'a1', url: 'blob:x', fileName: 'sp.png', role: 'image', hasAlpha: true,
  originalDims: { width: 800, height: 800 },
};

const REFERENCE_ID = 'reference-banner';

describe('template mặc định (T5.3)', () => {
  it('3–5 template, id không trùng, getTemplate tìm được', () => {
    expect(DEFAULT_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_TEMPLATES.length).toBeLessThanOrEqual(6);
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

    it.skipIf(t.id === REFERENCE_ID)('flat, ảnh sản phẩm là field bắt buộc đầu tiên', () => {
      const job = compileGraph(t.graph);
      expect(job.ok && job.job.renderMode).toBe('flat');
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

    it.skipIf(t.id === REFERENCE_ID)('upload ảnh qua exposed → compile được, 2 lượt AI / kích thước', () => {
      const p = instantiateTemplate(t);
      const graph = setExposedValue(p.graph, p.exposed[0]!, uploaded);
      const res = compileGraph(graph);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.job.products[0]!.assetId).toBe('a1');
      expect(estimateAiCalls(res.job)).toBe(res.job.ratios.length * 2);
      expect(res.job.flat.strictPreserveMode).toBe(true);
      expect(toLegacyConfig(res.job, { dataUrls: { a1: 'data:image/png;base64,P' } }).ok).toBe(true);
    });
  });
});

describe('template Theo banner mẫu (flat)', () => {
  const t = getTemplate(REFERENCE_ID)!;
  const reference: NodeParamsMap['reference-image'] = {
    assetId: 'ref1', url: 'blob:x', fileName: 'mau.png', role: 'style-reference', hasAlpha: false,
    originalDims: { width: 1200, height: 628 },
  };

  it('flat, banner mẫu là field bắt buộc đầu tiên, không có ô sản phẩm trống bắt buộc', () => {
    const res = compileGraph(t.graph);
    expect(res.ok && res.job.renderMode).toBe('flat');
    expect(t.exposed[0]).toMatchObject({ control: 'asset', required: true, nodeId: 'n-ref-0' });
    expect(t.graph.nodes.find((n) => n.id === 'n-ref-0')?.type).toBe('reference-image');
    expect(t.graph.nodes.some((n) => n.type === 'product-asset')).toBe(false);
  });

  it('tải mẫu → request gửi ảnh mẫu là style-reference + chữ Headline/CTA, luôn giữ nguyên chủ thể; 2 lượt AI/kích thước', () => {
    const p = instantiateTemplate(t);
    let graph = setExposedValue(p.graph, p.exposed[0]!, reference);
    graph = setExposedValue(graph, p.exposed.find((e) => e.id === 'headline')!, 'QUÀ TẾT 2027');
    const res = compileGraph(graph);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.job.references.map((r) => r.role)).toEqual(['style-reference']);
    expect(estimateAiCalls(res.job)).toBe(res.job.ratios.length * 2);
    const legacy = toLegacyConfig(res.job, { dataUrls: { ref1: 'data:image/png;base64,AA' } });
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    const req = legacy.requests[0]!.request;
    expect(req.assets.map((a) => a.role)).toEqual(['style-reference']);
    expect(req.userPrompt).toContain('Headline: QUÀ TẾT 2027');
    expect(req.userPrompt).toContain('CTA: Mua ngay');
    expect(req.imageModel).toBe('nano-banana-2');
  });
});
