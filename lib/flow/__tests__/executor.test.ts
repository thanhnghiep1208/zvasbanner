import { describe, expect, it } from 'vitest';
import type { GenerationRequest } from '@/lib/types';
import { runAll, type GenerateResult } from '../executor';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { decompileJob } from '../decompiler';
import type { NodeRunInfo } from '../run-state';
import { composedMinimal } from './fixtures';
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

  it('composed → báo chưa hỗ trợ, không gọi API', async () => {
    const { calls, deps, last } = setup();
    const out = await runAll(decompileJob(composedMinimal), { dataUrls: {} }, deps);
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(last('n-compose')?.message).toContain('composed');
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
