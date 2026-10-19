import { describe, expect, it } from 'vitest';
import { buildBackgroundPrompt } from '../background/prompt';
import { parseBackgroundRequestShape, toBackgroundRequests, type BackgroundRequest } from '../background/request';
import { backgroundStylePhrase } from '../background/style';
import { buildComposition } from '../compose/plan';
import { decompileJob } from '../decompiler';
import { pendingAiCalls, runAll, type ImageCache } from '../executor';
import { planLayoutForJob } from '../layout/engine';
import { dominantColors, elementColors, harmonyPromptLines, mainColor, textPalette } from '../palette';
import { DEFAULT_STYLE } from '../schema';
import { composedFull, composedMinimal } from './fixtures';

/** RGBA: `n` pixel màu `rgb` (alpha 255) + `t` pixel trong suốt. */
const px = (parts: [number, number, number, number][], t = 0) => {
  const out: number[] = [];
  for (const [r, g, b, n] of parts) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  for (let i = 0; i < t; i++) out.push(0, 0, 0, 0);
  return out;
};

const ORANGE = '#F26B1D';
const withColors = (job: typeof composedMinimal, colors: string[]) =>
  ({ ...job, products: job.products.map((p) => ({ ...p, dominantColors: colors })) });
const plan = (job: typeof composedMinimal) => {
  const r = planLayoutForJob(job);
  if (!r.ok) throw new Error(r.message);
  return r.plan;
};

describe('bảng màu chung – màu chủ đạo', () => {
  it('bỏ pixel trong suốt, gộp màu gần nhau, bỏ màu < 6%, nhiều trước', () => {
    // Chai cam (60%) + nhãn kem (25%) + nắp đen (12%) + 3% xanh lẻ + nền trong suốt.
    const colors = dominantColors(px([[242, 107, 29, 50], [245, 110, 32, 10], [255, 250, 240, 25], [30, 30, 36, 12], [0, 0, 255, 3]], 200));
    expect(colors).toHaveLength(3);
    expect(colors[0]).toMatch(/^#F[0-9A-F]6[0-9A-F]1[0-9A-F]$/);
    expect(colors.some((c) => c.startsWith('#00'))).toBe(false);
    expect(dominantColors(px([], 10))).toEqual([]);
  });

  it('màu chính = màu có sắc nhiều nhất; gộp màu nhiều ảnh bỏ trùng', () => {
    expect(mainColor(['#FFFAF0', '#1E1E24', ORANGE])).toBe(ORANGE);
    expect(mainColor(['#FFFFFF', '#111111'])).toBeUndefined();
    expect(elementColors([[ORANGE, '#FFFAF0'], ['#F06A1E', '#0068FF']])).toEqual([ORANGE, '#FFFAF0', '#0068FF']);
  });

  it('màu chữ/CTA tự động: Brand kit trước, không có thì màu chính sản phẩm', () => {
    expect(textPalette(['#0068FF'], [ORANGE])).toEqual(['#0068FF']);
    expect(textPalette([], ['#FFFFFF', ORANGE])).toEqual([ORANGE]);
    expect(textPalette([], undefined)).toEqual([]);
    const base = { ...composedMinimal, brandKit: undefined, textLayers: composedMinimal.textLayers.map((l) => ({ ...l, autoStyle: true })) };
    const job = withColors(base, [ORANGE]);
    const comp = buildComposition(job, plan(job), job.ratios[0]!.id, 'data:image/png;base64,BG');
    const autos = comp.layers.flatMap((l) => ('auto' in l && l.auto ? [l.auto.palette] : []));
    expect(autos.length).toBeGreaterThan(0);
    for (const p of autos) expect(p).toEqual([ORANGE]);
  });
});

describe('prompt nền – hài hoà + phong cách', () => {
  it('có màu sản phẩm → dặn tránh phủ nền cùng tông, chỉ dùng làm điểm nhấn (cả 2 kiểu prompt)', () => {
    const job = withColors(composedMinimal, [ORANGE, '#FFFAF0']);
    const r = toBackgroundRequests(job, plan(job), { dataUrls: {} });
    const req = r.ok ? r.drafts[0]!.request : undefined;
    expect(req?.elementColors).toEqual([ORANGE, '#FFFAF0']);
    for (const guideStyle of ['natural', 'hatched'] as const) {
      const p = buildBackgroundPrompt({ ...req!, guideStyle });
      expect(p).toContain(`main colour ${ORANGE}`);
      expect(p).toContain(`do NOT fill large areas, especially behind the product, with ${ORANGE}`);
    }
    expect(harmonyPromptLines(undefined)).toEqual([]);
    const plain = toBackgroundRequests(composedMinimal, plan(composedMinimal), { dataUrls: {} });
    expect(plain.ok && 'elementColors' in plain.drafts[0]!.request).toBe(false);
  });

  it('phong cách nền: lựa chọn Tông/Hình khối/Hiệu ứng/Grain là yêu cầu; không có kiểu chữ', () => {
    const s = backgroundStylePhrase({ ...DEFAULT_STYLE, style: 'bold', backgroundConfig: { tones: ['midnight-luxury'], grains: ['subtle-grain'], shapes: ['central-glow'], effects: [] } }, ['flash-sale']);
    expect(s).toContain('Required background treatment: colour tones midnight navy/black with gold highlights; a soft central glow; a subtle film grain.');
    expect(s).toContain('Campaign feel: promotional energy');
    expect(s).not.toMatch(/typograph|font|callout|options/i);
    expect(backgroundStylePhrase(DEFAULT_STYLE)).not.toContain('Required background treatment');
  });

  it('server kiểm elementColors / sceneAnchor', () => {
    const r = toBackgroundRequests(composedMinimal, plan(composedMinimal), { dataUrls: {} });
    const body = { ...(r.ok ? r.drafts[0]!.request : {}), guideStyle: 'natural' };
    expect(parseBackgroundRequestShape({ ...body, elementColors: [ORANGE], sceneAnchor: 'data:image/png;base64,QUJD' })).not.toBeNull();
    expect(parseBackgroundRequestShape({ ...body, elementColors: ['orange'] })).toBeNull();
    expect(parseBackgroundRequestShape({ ...body, sceneAnchor: 'https://x/y.png' })).toBeNull();
  });
});

describe('đồng bộ nhiều kích thước – SCENE ANCHOR', () => {
  const runtime = { dataUrls: { 'ref-1': 'data:image/png;base64,R', 'ref-bg': 'data:image/png;base64,B' } };
  const memoryCache = (): ImageCache => { const m = new Map<string, string>(); return { get: (k) => m.get(k), set: (k, v) => { m.set(k, v); } }; };
  const deps = (calls: BackgroundRequest[], cache?: ImageCache) => ({
    sleep: async () => {}, cache, guideStyle: 'natural' as const, onRunInfo: () => {},
    generate: async () => { throw new Error('không dùng'); },
    generateBackground: async (r: BackgroundRequest) => { calls.push(r); return { ok: true as const, image: `data:image/png;base64,BG${calls.length}` }; },
  });

  it('kích thước đầu không có anchor; kích thước sau nhận nền đầu; prompt có luật cùng chiến dịch', async () => {
    const calls: BackgroundRequest[] = [];
    await runAll(decompileJob(composedFull), runtime, deps(calls));
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sceneAnchor).toBeUndefined();
    expect(calls[1]!.sceneAnchor).toBe('data:image/png;base64,BG1');
    expect(buildBackgroundPrompt(calls[1]!)).toContain('SCENE ANCHOR');
    expect(buildBackgroundPrompt(calls[0]!)).not.toContain('SCENE ANCHOR');
  });

  it('cache: chạy lại không gọi AI; pendingAiCalls tính đúng kích thước sau theo nền đầu', async () => {
    const graph = decompileJob(composedFull);
    const cache = memoryCache();
    const calls: BackgroundRequest[] = [];
    expect(pendingAiCalls(graph, runtime, cache, { guideStyle: 'natural' })).toEqual({ calls: 2, reused: 0 });
    await runAll(graph, runtime, deps(calls, cache));
    await runAll(graph, runtime, deps(calls, cache));
    expect(calls).toHaveLength(2);
    expect(pendingAiCalls(graph, runtime, cache, { guideStyle: 'natural' })).toEqual({ calls: 0, reused: 2 });
  });
});

describe('CTA giữ họ màu khi thiếu tương phản', () => {
  it('nền cam: CTA cam được làm đậm tới đủ tương phản ≥ 3 thay vì đổi sang trắng/đen', async () => {
    const { autoTextColors, contrastRatio, shadeForContrast } = await import('../text/auto-style');
    const bg = { r: 235, g: 120, b: 80, spread: 10 };
    const c = autoTextColors('cta', bg, [ORANGE], 32);
    expect(c.plateColor).not.toBe(ORANGE);
    expect(['#FFFFFF', '#141414']).not.toContain(c.plateColor);
    const rgb = [1, 3, 5].map((i) => parseInt(c.plateColor!.slice(i, i + 2), 16)) as [number, number, number];
    expect(contrastRatio(rgb, [235, 120, 80])).toBeGreaterThanOrEqual(3);
    expect(shadeForContrast('#808080', [128, 128, 128], 30)).toBeUndefined();
  });

  it('khối hài hoà màu đứng sau brief và ghi rõ thắng màu trong brief/style', () => {
    const job = withColors(composedMinimal, [ORANGE]);
    const r = toBackgroundRequests(job, plan(job), { dataUrls: {} });
    for (const guideStyle of ['natural', 'hatched'] as const) {
      const p = buildBackgroundPrompt({ ...(r.ok ? r.drafts[0]!.request : ({} as BackgroundRequest)), guideStyle });
      expect(p.indexOf('override any colour in the brief')).toBeGreaterThan(p.search(/Scene brief|=== BRIEF ===/));
    }
  });
});
