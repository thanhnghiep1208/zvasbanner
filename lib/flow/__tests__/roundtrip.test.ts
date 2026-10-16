import { describe, expect, it } from 'vitest';
import { compileGraph } from '../compiler';
import { decompileJob } from '../decompiler';
import { validateGraph } from '../validate';
import { estimateAiCalls } from '../compiled-job';
import { ALL_FIXTURES, composedFull, composedMinimal, flatLegacy } from './fixtures';

describe('round-trip CompiledJob → graph → CompiledJob', () => {
  for (const [name, job] of Object.entries(ALL_FIXTURES)) {
    it(name, () => {
      const graph = decompileJob(job);
      expect(validateGraph(graph).filter((i) => i.severity === 'error')).toEqual([]);
      const res = compileGraph(graph);
      if (!res.ok) throw new Error(JSON.stringify(res.errors));
      expect(res.job).toEqual(job);
    });
  }
});

describe('warnings', () => {
  it('headline AI trong composed → warning', () => {
    const res = compileGraph(decompileJob(composedFull));
    expect(res.ok && res.warnings.map((w) => w.code)).toContain('ai-text-in-composed');
  });
  it('product không alpha đi vào Compose → warning', () => {
    const job = { ...composedMinimal, products: [{ ...composedMinimal.products[0]!, hasAlpha: false }] };
    const res = compileGraph(decompileJob(job));
    expect(res.ok && res.warnings.map((w) => w.code)).toContain('product-no-alpha');
  });
  it('flat: product không alpha → không cảnh báo (không có auto shadow)', () => {
    const res = compileGraph(decompileJob(flatLegacy));
    expect(res.ok && res.warnings.map((w) => w.code)).not.toContain('product-no-alpha');
  });
});

describe('estimateAiCalls', () => {
  // composedFull: 3 kích thước nhưng export chỉ chọn 2 → chỉ tốn 2 lượt (T4.6).
  it('composed = 1 call / kích thước được xuất', () => expect(estimateAiCalls(composedFull)).toBe(2));
  it('export "all" → tính mọi kích thước', () => expect(estimateAiCalls({ ...composedFull, export: { ...composedFull.export, ratioIds: 'all' } })).toBe(3));
  it('flat = 2 call / ratio (generate + harmony)', () => expect(estimateAiCalls(flatLegacy)).toBe(2));
});

describe('decompileJob', () => {
  it('graph không dùng chung object với job', () => {
    const g = decompileJob(composedMinimal);
    (g.nodes.find((n) => n.type === 'text-layer')!.params as { content: string }).content = 'đã sửa';
    expect(composedMinimal.textLayers[0]!.content).toBe('Giảm 30% cuối tuần');
  });
});
