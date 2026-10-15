import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { runAll, type GenerateResult } from '../executor';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { decompileJob } from '../decompiler';
import type { NodeRunInfo } from '../run-state';
import { composedFull, composedMinimal } from './fixtures';
import type { BackgroundRequest } from '../background/request';
import { LEGACY_FIXTURES } from './fixtures/legacy';

const fx = LEGACY_FIXTURES['logged-full-text-logo']!;

function setup(results: GenerateResult[] = [{ ok: true, image: 'data:image/png;base64,R1', source: 'gemini' }]) {
  const calls: GenerationRequest[] = [];
  const states: [string, NodeRunInfo][] = [];
  const queue = [...results];
  const deps = {
    generate: async (r: GenerationRequest) => { calls.push(r); return queue.shift()!; },
    onRunInfo: (id: string, info: NodeRunInfo) => { states.push([id, info]); },
  };
  return { calls, states, deps, last: (id: string) => states.filter(([n]) => n === id).at(-1)?.[1] };
}

describe('runAll', () => {
  it('flat 1 ratio: gửi đúng request của form, node generate + export → done', async () => {
    const { job, runtime } = fromLegacyConfig(fx.request);
    const { calls, deps, last } = setup();
    const out = await runAll(decompileJob(job), runtime, deps);
    expect(out).toMatchObject({ ok: true, results: [{ ratioId: 'social-zalo-oa-img', image: 'data:image/png;base64,R1' }] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.userPrompt).toBe(fx.request.userPrompt);
    expect(calls[0]!.layoutAdaptationFromBanner).toBeUndefined();
    expect(last('n-generate-flat')).toEqual({ state: 'done', previewUrl: 'data:image/png;base64,R1' });
    expect(last('n-export')).toMatchObject({ state: 'done' });
  });

  it('nhiều ratio: ratio sau thích nghi từ ảnh ratio đầu, chạy tuần tự', async () => {
    const { job, runtime } = fromLegacyConfig(fx.request);
    job.ratios.push({ id: 'zalo-banner-miniapp', width: 1032, height: 810, platform: 'Zalo', name: 'Banner in Miniapp' });
    const { calls, deps } = setup([
      { ok: true, image: 'img-1', source: 'gemini' },
      { ok: true, image: 'img-2', source: 'gemini' },
    ]);
    const out = await runAll(decompileJob(job), runtime, deps);
    expect(out.ok && out.results.map((r) => r.ratioId)).toEqual(['social-zalo-oa-img', 'zalo-banner-miniapp']);
    expect(calls[1]!.layoutAdaptationFromBanner).toBe('img-1');
    expect(calls[1]!.canvasConfig).toMatchObject({ width: 1032, height: 810 });
  });

  it('API lỗi → node generate error kèm message, dừng các ratio sau', async () => {
    const { job, runtime } = fromLegacyConfig(fx.request);
    job.ratios.push({ id: 'zalo-banner-miniapp', width: 1032, height: 810, platform: 'Zalo', name: 'Banner in Miniapp' });
    const { calls, deps, last } = setup([
      { ok: true, image: 'img-1', source: 'gemini' },
      { ok: false, error: '[E-GEN-429] Gemini API đang bị giới hạn tốc độ (429).' },
    ]);
    const out = await runAll(decompileJob(job), runtime, deps);
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(2);
    expect(last('n-generate-flat')).toEqual({
      state: 'error', previewUrl: 'img-1',
      message: 'Kích thước 2/2: [E-GEN-429] Gemini API đang bị giới hạn tốc độ (429).',
    });
  });

  it('server trả placeholder → coi là lỗi, hiện lý do', async () => {
    const { job, runtime } = fromLegacyConfig(fx.request);
    const { deps, last } = setup([{ ok: true, image: 'ph', source: 'placeholder', placeholderError: 'Gemini timeout' }]);
    expect((await runAll(decompileJob(job), runtime, deps)).ok).toBe(false);
    expect(last('n-generate-flat')).toMatchObject({ state: 'error', message: 'Gemini timeout' });
  });

  it('thiếu dataUrl ảnh → không gọi API, báo trên node asset', async () => {
    const { job } = fromLegacyConfig(fx.request);
    const { calls, deps, last } = setup();
    const out = await runAll(decompileJob(job), { dataUrls: {} }, deps);
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(last('n-product-0')).toEqual({ state: 'error', message: 'Cần tải lại ảnh trước khi chạy.' });
  });

  it('graph lỗi validate → không gọi API, lỗi gắn vào node', async () => {
    const { job, runtime } = fromLegacyConfig(fx.request);
    const g = decompileJob(job);
    g.edges = g.edges.filter((e) => e.source !== 'n-brief');
    const { calls, deps, last } = setup();
    const out = await runAll(g, runtime, deps);
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(last('n-generate-flat')).toMatchObject({ state: 'error' });
  });

  it('text không map được → vẫn chạy, trả warning trên node text', async () => {
    const { job, runtime } = fromLegacyConfig(fx.request);
    job.textLayers.push({ ...job.textLayers[0]!, layerId: 'extra', role: 'custom', content: 'Thêm' });
    const { calls, deps } = setup();
    const out = await runAll(decompileJob(job), runtime, deps);
    expect(calls).toHaveLength(1);
    expect(out.ok && out.warnings.map((w) => w.nodeId)).toContain('n-text-extra');
  });
});

describe('runAll – composed (T4.2)', () => {
  const PRODUCT_PIXELS = 'data:image/png;base64,PRODUCTPIXELS';
  const runtimeFor = (job: typeof composedFull) => ({
    dataUrls: Object.fromEntries([
      ...job.products.map((p) => [p.assetId, PRODUCT_PIXELS] as const),
      ...job.references.map((r) => [r.assetId, 'data:image/png;base64,REF'] as const),
    ]),
  });

  function setupBg(fail = false) {
    const bgCalls: BackgroundRequest[] = [];
    const guides: number[] = [];
    const states: [string, NodeRunInfo][] = [];
    const deps = {
      generate: async () => { throw new Error('composed không được gọi /api/generate'); },
      onRunInfo: (id: string, info: NodeRunInfo) => { states.push([id, info]); },
      renderGuide: (_c: unknown, guide: unknown[]) => { guides.push(guide.length); return 'data:image/png;base64,GUIDE'; },
      generateBackground: async (r: BackgroundRequest) => {
        bgCalls.push(r);
        return fail ? { ok: false as const, error: 'Gemini quá tải' } : { ok: true as const, image: `bg-${bgCalls.length}` };
      },
    };
    return { deps, bgCalls, guides, last: (id: string) => states.filter(([n]) => n === id).at(-1)?.[1] };
  }

  it('mỗi ratio: vẽ guide + 1 lần sinh nền; KHÔNG có pixel sản phẩm trong request', async () => {
    const { deps, bgCalls, guides, last } = setupBg();
    const out = await runAll(decompileJob(composedFull), runtimeFor(composedFull), deps);
    expect(out.ok && out.results.map((r) => r.ratioId)).toEqual(composedFull.ratios.map((r) => r.id));
    expect(bgCalls).toHaveLength(3);
    expect(guides.every((n) => n > 0)).toBe(true);
    for (const r of bgCalls) {
      expect(r.guideImage).toBe('data:image/png;base64,GUIDE');
      expect(JSON.stringify(r)).not.toContain('PRODUCTPIXELS');
      expect(r.references.map((x) => x.role)).toEqual(['style-reference', 'background']);
      expect(r.guide.some((g) => g.kind === 'product')).toBe(true);
    }
    expect(last('n-layout')).toEqual({ state: 'done' });
    expect(last('n-generate')).toEqual({ state: 'done', previewUrl: 'bg-1' });
  });

  it('headline AI → request có aiHeadline trỏ đúng vùng trong guide', async () => {
    const { deps, bgCalls } = setupBg();
    await runAll(decompileJob(composedFull), runtimeFor(composedFull), deps);
    expect(bgCalls[0]!.aiHeadline).toEqual({ elementId: 'headline', content: 'Tết Sum Vầy' });
    expect(bgCalls[0]!.guide.some((g) => g.elementId === 'headline')).toBe(true);
  });

  it('sinh nền lỗi → node Sinh nền error, dừng', async () => {
    const { deps, bgCalls, last } = setupBg(true);
    const out = await runAll(decompileJob(composedFull), runtimeFor(composedFull), deps);
    expect(out.ok).toBe(false);
    expect(bgCalls).toHaveLength(1);
    expect(last('n-generate')).toMatchObject({ state: 'error', message: 'Kích thước 1/3: Gemini quá tải' });
  });

  it('ảnh tham chiếu thiếu dữ liệu → không gọi API, báo trên node ảnh tham chiếu', async () => {
    const { deps, bgCalls, last } = setupBg();
    const out = await runAll(decompileJob(composedFull), { dataUrls: {} }, deps);
    expect(out.ok).toBe(false);
    expect(bgCalls).toHaveLength(0);
    expect(last('n-ref-0')).toEqual({ state: 'error', message: 'Cần tải lại ảnh trước khi chạy.' });
  });

  it('thiếu deps sinh nền → lỗi rõ trên node Sinh nền', async () => {
    const { deps } = setup();
    const states: [string, NodeRunInfo][] = [];
    const out = await runAll(decompileJob(composedMinimal), { dataUrls: {} }, { ...deps, onRunInfo: (id, i) => states.push([id, i]) });
    expect(out.ok).toBe(false);
    expect(states.find(([id]) => id === 'n-generate')?.[1].state).toBe('error');
  });

  it('không có composeRatio → trả ảnh nền kèm cảnh báo trên node Ghép layer', async () => {
    const { deps } = setupBg();
    const out = await runAll(decompileJob(composedMinimal), runtimeFor(composedMinimal), deps);
    expect(out.ok && out.warnings.map((w) => w.nodeId)).toContain('n-compose');
  });

  it('có composeRatio (T4.3): ghép từng ratio từ nền, kết quả là ảnh ghép, node Ghép layer → Xong', async () => {
    const { deps, last } = setupBg();
    const composed: { ratioId: string; background: string }[] = [];
    const out = await runAll(decompileJob(composedFull), runtimeFor(composedFull), {
      ...deps,
      composeRatio: async ({ ratioId, background, dataUrls }) => {
        expect(Object.values(dataUrls)).toContain(PRODUCT_PIXELS); // pixel sản phẩm chỉ dùng ở bước ghép
        composed.push({ ratioId, background });
        return `composed-${ratioId}`;
      },
    });
    expect(composed.map((c) => c.background)).toEqual(['bg-1', 'bg-2', 'bg-3']);
    expect(out.ok && out.results.map((r) => r.image)).toEqual(composedFull.ratios.map((r) => `composed-${r.id}`));
    expect(out.ok && out.warnings.map((w) => w.nodeId)).not.toContain('n-compose');
    expect(last('n-compose')).toMatchObject({ state: 'done' });
    expect(last('n-generate')).toEqual({ state: 'done', previewUrl: 'bg-1' });
  });

  it('thiếu ảnh sản phẩm → chặn trước khi gọi AI, báo trên node sản phẩm', async () => {
    const { deps, bgCalls, last } = setupBg();
    const runtime = runtimeFor(composedFull);
    delete runtime.dataUrls['asset-hop-qua'];
    const out = await runAll(decompileJob(composedFull), runtime, { ...deps, composeRatio: async () => 'x' });
    expect(out.ok).toBe(false);
    expect(bgCalls).toHaveLength(0);
    expect(last('n-product-0')).toEqual({ state: 'error', message: 'Cần tải lại ảnh trước khi chạy.' });
  });

  it('ghép lỗi → node Ghép layer error, nền vẫn giữ preview', async () => {
    const { deps, last } = setupBg();
    const out = await runAll(decompileJob(composedMinimal), runtimeFor(composedMinimal), {
      ...deps, composeRatio: async () => { throw new Error('Không đọc được ảnh.'); },
    });
    expect(out.ok).toBe(false);
    expect(last('n-compose')).toMatchObject({ state: 'error', message: 'Không đọc được ảnh.' });
    expect(last('n-generate')).toEqual({ state: 'done', previewUrl: 'bg-1' });
  });
});
