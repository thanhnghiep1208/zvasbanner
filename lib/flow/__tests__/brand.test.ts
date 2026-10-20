import { describe, expect, it } from 'vitest';
import { asLogoPosition, fontIdFromLabel, isHexColor } from '../brand';
import { runAll, REQUEST_BODY_BUDGET_BYTES } from '../executor';
import { decompileJob } from '../decompiler';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { validateGraph } from '../validate';
import { flatFull } from './fixtures';
import { LEGACY_FIXTURES } from './fixtures/legacy';

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
  it('isHexColor', () => {
    expect(isHexColor('#C8102E')).toBe(true);
    expect(isHexColor('#C8102E80')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});

describe('validateGraph – Brand kit', () => {
  it('màu không phải hex → lỗi brand-color-invalid trên node Brand kit', () => {
    const g = decompileJob({ ...flatFull, brandKit: { colors: ['#C8102E', 'đỏ'] } });
    expect(validateGraph(g).find((i) => i.code === 'brand-color-invalid')).toMatchObject({ severity: 'error', nodeId: 'n-brand' });
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
