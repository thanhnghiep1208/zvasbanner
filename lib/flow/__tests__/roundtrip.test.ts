import { describe, expect, it } from 'vitest';
import { compileGraph } from '../compiler';
import { decompileJob } from '../decompiler';
import { validateGraph } from '../validate';
import { estimateAiCalls } from '../compiled-job';
import { ALL_FIXTURES, flatFull, flatMinimal, flatLegacy } from './fixtures';

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
  it('product không alpha → không cảnh báo (AI vẽ cả banner, không có ghép/bóng)', () => {
    const res = compileGraph(decompileJob(flatLegacy));
    expect(res.ok && res.warnings.map((w) => w.code)).not.toContain('product-no-alpha');
  });
});

describe('estimateAiCalls', () => {
  // flatFull: 3 kích thước nhưng export chỉ chọn 2 → chỉ tốn 2 lượt (T4.6).
  it('2 call / kích thước được xuất', () => expect(estimateAiCalls(flatFull)).toBe(4));
  it('export "all" → tính mọi kích thước', () => expect(estimateAiCalls({ ...flatFull, export: { ...flatFull.export, ratioIds: 'all' } })).toBe(6));
  it('flat = 2 call / ratio (generate + harmony)', () => expect(estimateAiCalls(flatLegacy)).toBe(2));
});

describe('decompileJob', () => {
  it('graph không dùng chung object với job', () => {
    const g = decompileJob(flatMinimal);
    (g.nodes.find((n) => n.type === 'text-layer')!.params as { content: string }).content = 'đã sửa';
    expect(flatMinimal.textLayers[0]!.content).toBe('Giảm 30% cuối tuần');
  });
});
