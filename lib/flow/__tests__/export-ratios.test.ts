import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { exportedRatios } from '../compiled-job';
import { decompileJob } from '../decompiler';
import { runAll, type GenerateResult } from '../executor';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { adaptationRetryPrompt } from '../legacy/to-legacy-config';
import { validateGraph } from '../validate';
import { composedFull } from './fixtures';
import { LEGACY_FIXTURES } from './fixtures/legacy';

const MINIAPP = { id: 'zalo-banner-miniapp', width: 1032, height: 810, platform: 'Zalo', name: 'Banner in Miniapp' };

/** Job flat từ payload thật (fixture logged-headline-cta) + 1 kích thước phụ. */
function flatJob() {
  const { job, runtime } = fromLegacyConfig(LEGACY_FIXTURES['logged-headline-cta']!.request); // nano-banana-pro, strict on
  job.ratios.push(MINIAPP);
  return { job, runtime };
}

function run(job: ReturnType<typeof flatJob>['job'], runtime: ReturnType<typeof flatJob>['runtime'], results: GenerateResult[]) {
  const calls: GenerationRequest[] = [];
  const queue = [...results];
  return runAll(decompileJob(job), runtime, {
    sleep: async () => {},
    generate: async (r) => { calls.push(r); return queue.shift()!; },
    onRunInfo: () => {},
  }).then((out) => ({ out, calls }));
}

describe('exportedRatios', () => {
  it("'all' → mọi kích thước; tập con → giữ thứ tự của node Kích thước", () => {
    expect(exportedRatios({ ...composedFull, export: { ...composedFull.export, ratioIds: 'all' } }).map((r) => r.id))
      .toEqual(composedFull.ratios.map((r) => r.id));
    expect(exportedRatios(composedFull).map((r) => r.id)).toEqual(['social-zalo-oa-img', 'custom-1080x1920']);
  });
});

describe('flat nhiều kích thước – parity với "Biến thể kích thước" của form', () => {
  it('kích thước đầu giữ model của job; mọi kích thước luôn giữ nguyên chủ thể; kích thước phụ ép Nano Banana 2.1 + thích nghi ảnh đầu', async () => {
    const { job, runtime } = flatJob();
    job.model = 'nano-banana-pro';
    job.flat = { strictPreserveMode: false };
    const { out, calls } = await run(job, runtime, [
      { ok: true, image: 'img-1', source: 'gemini' },
      { ok: true, image: 'img-2', source: 'gemini' },
    ]);
    expect(out.ok).toBe(true);
    // Node tắt "giữ nguyên" vẫn bị ép bật: logo/sản phẩm không được đổi tỉ lệ, màu, hình dạng.
    expect(calls[0]).toMatchObject({ imageModel: 'nano-banana-pro', styleControls: { strictPreserveMode: true } });
    expect(calls[0]!.layoutAdaptationFromBanner).toBeUndefined();
    expect(calls[1]).toMatchObject({
      imageModel: 'nano-banana-2', styleControls: { strictPreserveMode: true }, layoutAdaptationFromBanner: 'img-1',
      canvasConfig: { width: 1032, height: 810 },
    });
  });

  it('kích thước phụ ra placeholder → thử lại 1 lần với prompt "layout translation"', async () => {
    const { job, runtime } = flatJob();
    const { out, calls } = await run(job, runtime, [
      { ok: true, image: 'img-1', source: 'gemini' },
      { ok: true, image: 'ph', source: 'placeholder' },
      { ok: true, image: 'img-2', source: 'gemini' },
    ]);
    expect(out.ok && out.results.map((r) => r.image)).toEqual(['img-1', 'img-2']);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.userPrompt).toBe(adaptationRetryPrompt(job));
    expect(calls[2]!.layoutAdaptationFromBanner).toBe('img-1');
  });

  it('adaptationRetryPrompt cùng format retryPrompt của form', () => {
    const { job } = flatJob();
    expect(adaptationRetryPrompt(job)).toBe(
      'Layout translation only: keep same campaign look and content hierarchy.\nHeadline: Giảm giá 50%\nCTA: mua ngay',
    );
  });

  it('chỉ sinh kích thước được xuất; kích thước xuất đầu tiên làm ảnh gốc', async () => {
    const { job, runtime } = flatJob();
    job.export = { ...job.export, ratioIds: [MINIAPP.id] };
    const { out, calls } = await run(job, runtime, [{ ok: true, image: 'only', source: 'gemini' }]);
    expect(out.ok && out.results.map((r) => r.ratioId)).toEqual([MINIAPP.id]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.canvasConfig).toMatchObject({ width: 1032, height: 810 });
    expect(calls[0]!.layoutAdaptationFromBanner).toBeUndefined();
  });
});

describe('validateGraph – kích thước xuất', () => {
  it('tập rỗng → lỗi export-ratio-empty', () => {
    const g = decompileJob({ ...composedFull, export: { ...composedFull.export, ratioIds: [] } });
    expect(validateGraph(g).map((i) => i.code)).toContain('export-ratio-empty');
  });
  it('kích thước đã xoá khỏi node Kích thước → lỗi export-ratio-unknown', () => {
    const g = decompileJob({ ...composedFull, export: { ...composedFull.export, ratioIds: ['social-zalo-oa-img', 'da-xoa'] } });
    const issue = validateGraph(g).find((i) => i.code === 'export-ratio-unknown');
    expect(issue).toMatchObject({ severity: 'error', nodeId: 'n-export' });
    expect(issue!.message).toContain('da-xoa');
  });
  it('fixture composedFull (tập con hợp lệ) không lỗi', () => {
    expect(validateGraph(decompileJob(composedFull)).map((i) => i.code).filter((c) => c.startsWith('export-'))).toEqual([]);
  });
});
