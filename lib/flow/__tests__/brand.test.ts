import { describe, expect, it } from 'vitest';
import { getPresetById, presetToCanvasConfig } from '@/lib/canvas-presets';
import { asLogoPosition, fontIdFromLabel, isHexColor, logoCornerRect } from '../brand';
import { planLayout, transformToRect } from '../layout';
import { runAll, REQUEST_BODY_BUDGET_BYTES } from '../executor';
import { decompileJob } from '../decompiler';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { validateGraph } from '../validate';
import type { FlowAsset, PixelAssetRole } from '../schema';
import { composedFull } from './fixtures';
import { LEGACY_FIXTURES } from './fixtures/legacy';

const ZALO = { id: 'social-zalo-oa-img', ...presetToCanvasConfig(getPresetById('social-zalo-oa-img')!) };
const asset = (assetId: string, role: PixelAssetRole): FlowAsset<PixelAssetRole> => ({
  assetId, role, hasAlpha: true, url: '', fileName: `${assetId}.png`, originalDims: { width: 400, height: 400 },
});

describe('brand – chuẩn hoá', () => {
  it('asLogoPosition chỉ nhận 4 góc', () => {
    expect(asLogoPosition('top-left')).toBe('top-left');
    expect(asLogoPosition('góc trên trái')).toBeUndefined();
    expect(asLogoPosition(undefined)).toBeUndefined();
  });
  it('fontIdFromLabel khớp nhãn hoặc id, không phân biệt hoa thường', () => {
    expect(fontIdFromLabel('Be Vietnam Pro')).toBe('be-vietnam-pro');
    expect(fontIdFromLabel('montserrat')).toBe('montserrat');
    expect(fontIdFromLabel('Comic Sans')).toBeUndefined();
  });
  it('logoCornerRect giữ kích thước, nằm trong lề 5%', () => {
    expect(logoCornerRect({ x: 0.3, y: 0.3, w: 0.1, h: 0.2 }, 'bottom-right')).toEqual({ x: 0.85, y: 0.75, w: 0.1, h: 0.2 });
  });
  it('isHexColor', () => {
    expect(isHexColor('#C8102E')).toBe(true);
    expect(isHexColor('#C8102E80')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});

describe('layout – góc logo của Brand kit', () => {
  it('góc trống → logo dời vào đúng góc', () => {
    const plan = planLayout({
      ratios: [ZALO], products: [asset('sp', 'image'), asset('logo', 'logo')], textLayers: [], overrides: {},
      logoPosition: 'bottom-left',
    });
    if (!plan.ok) throw new Error();
    const r = transformToRect(plan.plan.transforms[ZALO.id]!.logo!);
    expect(r.x).toBeLessThan(0.2);
    expect(r.y + r.h).toBeGreaterThan(0.85);
    expect(plan.plan.logoPositionIgnored).toEqual([]);
  });

  it('góc đè sản phẩm → giữ vị trí của bố cục, ghi nhận ratio bị bỏ qua', () => {
    const base = planLayout({ ratios: [ZALO], products: [asset('sp', 'image'), asset('logo', 'logo')], textLayers: [], overrides: {} });
    const res = planLayout({
      ratios: [ZALO], products: [asset('sp', 'image'), asset('logo', 'logo')], textLayers: [], overrides: {},
      logoPosition: 'top-right', // sản phẩm nằm bên phải
    });
    if (!res.ok || !base.ok) throw new Error();
    expect(res.plan.logoPositionIgnored).toEqual([ZALO.id]);
    expect(res.plan.transforms[ZALO.id]!.logo).toEqual(base.plan.transforms[ZALO.id]!.logo);
  });
});

describe('validateGraph – Brand kit', () => {
  it('màu không phải hex → lỗi brand-color-invalid trên node Brand kit', () => {
    const g = decompileJob({ ...composedFull, brandKit: { colors: ['#C8102E', 'đỏ'] } });
    expect(validateGraph(g).find((i) => i.code === 'brand-color-invalid')).toMatchObject({ severity: 'error', nodeId: 'n-brand' });
  });
  it('góc logo không áp được → cảnh báo trên node Brand kit', () => {
    const g = decompileJob({ ...composedFull, brandKit: { colors: [], logoPosition: 'top-right' } });
    const w = validateGraph(g).find((i) => i.code === 'logo-position-ignored');
    expect(w).toMatchObject({ severity: 'warning', nodeId: 'n-brand' });
  });
});

describe('executor – giới hạn body', () => {
  it('ảnh quá nặng → chặn trước khi gọi API, báo trên node ảnh', async () => {
    const { job, runtime } = fromLegacyConfig(LEGACY_FIXTURES['logged-full-text-logo']!.request);
    const huge = `data:image/png;base64,${'A'.repeat(REQUEST_BODY_BUDGET_BYTES)}`;
    for (const k of Object.keys(runtime.dataUrls)) runtime.dataUrls[k] = huge;
    let calls = 0;
    const states: [string, { state: string; message?: string }][] = [];
    const out = await runAll(decompileJob(job), runtime, {
      generate: async () => { calls++; return { ok: true, image: 'x', source: 'gemini' }; },
      onRunInfo: (id, info) => states.push([id, info]),
    });
    expect(out.ok).toBe(false);
    expect(calls).toBe(0);
    expect(states.find(([id]) => id === 'n-product-0')?.[1].message).toContain('vượt giới hạn 29MB');
  });
});
