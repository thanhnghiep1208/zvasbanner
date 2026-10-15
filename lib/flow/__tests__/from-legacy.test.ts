import { describe, expect, it } from 'vitest';
import type { GenerationRequest, UploadedAsset } from '@/lib/types';
import { composeUserPrompt } from '@/lib/client-generation';
import { fromLegacyConfig, splitComposedPrompt, toRatioSpec } from '../legacy/from-legacy-config';
import { decompileJob } from '../decompiler';
import { compileGraph } from '../compiler';

const uploaded = (id: string, role: UploadedAsset['role'], hasAlpha = true): UploadedAsset => ({
  id, role, hasAlpha,
  url: `blob:http://localhost:3000/${id}`,
  dataUrl: `data:image/png;base64,${id}`,
  fileName: `${id}.png`,
  originalDims: { width: 800, height: 600 },
});

/** Giống body buildGeneratePayloadFromStore() với state mặc định của store/editor.ts. */
const baseRequest = (patch: Partial<GenerationRequest> = {}): GenerationRequest => ({
  canvasConfig: { width: 1075, height: 645, platform: 'Zalo', name: 'Zalo OA Img' },
  assets: [],
  brandKit: { colors: [] },
  userPrompt: 'Banner khuyến mãi nồi chiên',
  styleControls: {
    style: 'minimalist', mood: 'professional', colorPalette: 'auto', fontStyle: 'modern',
    strictPreserveMode: true,
    backgroundConfig: { tones: [], grains: [], shapes: [], effects: [] },
  },
  imageModel: 'nano-banana-pro',
  marketingBrief: { campaignIntents: [], focalSubjects: [] },
  ...patch,
});

describe('toRatioSpec', () => {
  it('preset → preset id', () => {
    expect(toRatioSpec({ width: 1075, height: 645, platform: 'Zalo', name: 'Zalo OA Img' }).id)
      .toBe('social-zalo-oa-img');
  });
  it('custom → custom-<w>x<h>', () => {
    expect(toRatioSpec({ width: 1234, height: 567, platform: 'Custom', name: 'Custom' }))
      .toEqual({ id: 'custom-1234x567', width: 1234, height: 567, platform: 'Custom', name: 'Custom' });
  });
});

describe('splitComposedPrompt (ngược với composeUserPrompt)', () => {
  const cases = [
    { userPrompt: 'Nền bếp sáng', headline: 'Giảm 30%', subheadline: 'Chỉ cuối tuần', ctaText: 'Mua ngay' },
    { userPrompt: 'Nền bếp sáng', headline: '', subheadline: '', ctaText: 'Mua ngay' },
    { userPrompt: 'Nền bếp sáng', headline: 'Giảm 30%', subheadline: '', ctaText: '' },
    { userPrompt: 'Dòng 1\nHeadline: nằm giữa prompt\nDòng 3', headline: 'Thật', subheadline: '', ctaText: '' },
    { userPrompt: '', headline: 'Chỉ có headline', subheadline: '', ctaText: '' },
    { userPrompt: 'Không có text', headline: '', subheadline: '', ctaText: '' },
  ];
  for (const c of cases) {
    it(JSON.stringify(c), () => {
      expect(splitComposedPrompt(composeUserPrompt(c))).toEqual({
        prompt: c.userPrompt, headline: c.headline, subheadline: c.subheadline, cta: c.ctaText,
      });
    });
  }
  it('nhãn sai thứ tự ở cuối không bị tách', () => {
    expect(splitComposedPrompt('abc\nCTA: x\nHeadline: y')).toEqual({
      prompt: 'abc\nCTA: x', headline: 'y', subheadline: '', cta: '',
    });
  });
});

describe('fromLegacyConfig', () => {
  it('tách text từ userPrompt thành text layer theo thứ tự ưu tiên', () => {
    const { job } = fromLegacyConfig(baseRequest({
      userPrompt: composeUserPrompt({ userPrompt: 'Nền bếp', headline: 'Giảm 30%', subheadline: 'Cuối tuần', ctaText: 'Mua ngay' }),
    }));
    expect(job.brief.prompt).toBe('Nền bếp');
    expect(job.textLayers.map((t) => [t.role, t.content, t.priority])).toEqual([
      ['headline', 'Giảm 30%', 1], ['subheadline', 'Cuối tuần', 2], ['cta', 'Mua ngay', 3],
    ]);
  });

  it('có form text → dùng thẳng, không tách prompt', () => {
    const { job } = fromLegacyConfig(baseRequest({ userPrompt: 'bị bỏ qua' }), {
      form: { userPrompt: 'Prompt gốc\nHeadline: là prompt thật', headline: 'H', subheadline: '', ctaText: '' },
    });
    expect(job.brief.prompt).toBe('Prompt gốc\nHeadline: là prompt thật');
    expect(job.textLayers.map((t) => t.content)).toEqual(['H']);
  });

  it('chia asset theo role, giữ thứ tự, dataUrl vào runtime', () => {
    const { job, runtime } = fromLegacyConfig(baseRequest({
      assets: [
        uploaded('logo', 'logo'), uploaded('ref', 'style-reference', false),
        uploaded('sp', 'image'), uploaded('bg', 'background', false), uploaded('deco', 'decoration'),
      ],
    }));
    expect(job.products.map((p) => [p.assetId, p.role])).toEqual([['logo', 'logo'], ['sp', 'image'], ['deco', 'decoration']]);
    expect(job.references.map((r) => [r.assetId, r.role])).toEqual([['ref', 'style-reference'], ['bg', 'background']]);
    expect(Object.keys(runtime.dataUrls)).toEqual(['logo', 'ref', 'sp', 'bg', 'deco']);
    expect(JSON.stringify(job)).not.toContain('data:image');
  });

  it('strictPreserveMode tách khỏi style', () => {
    const req = baseRequest();
    req.styleControls.strictPreserveMode = false;
    const { job } = fromLegacyConfig(req);
    expect(job.flat).toEqual({ strictPreserveMode: false });
    expect(job.style).not.toHaveProperty('strictPreserveMode');
  });

  it('brandKit rỗng bị bỏ, có dữ liệu thì giữ', () => {
    expect(fromLegacyConfig(baseRequest()).job.brandKit).toBeUndefined();
    expect(fromLegacyConfig(baseRequest({ brandKit: { colors: [], fontPreference: 'serif' } })).job.brandKit)
      .toEqual({ colors: [], fontPreference: 'serif' });
  });

  it('thiếu marketingBrief → mảng rỗng', () => {
    const req = baseRequest();
    delete req.marketingBrief;
    expect(fromLegacyConfig(req).job.brief.marketingBrief).toEqual({ campaignIntents: [], focalSubjects: [] });
  });

  it('layoutAdaptationFromBanner vào runtime, không vào job', () => {
    const { job, runtime } = fromLegacyConfig(baseRequest({ layoutAdaptationFromBanner: 'data:image/png;base64,ref' }));
    expect(runtime.layoutAdaptationFromBanner).toBe('data:image/png;base64,ref');
    expect(JSON.stringify(job)).not.toContain('layoutAdaptation');
  });

  it('job → graph hợp lệ → compile ra lại đúng job', () => {
    const { job } = fromLegacyConfig(baseRequest({
      assets: [uploaded('sp', 'image', false), uploaded('ref', 'style-reference')],
      brandKit: { colors: ['#C8102E'] },
      userPrompt: composeUserPrompt({ userPrompt: 'Flash sale', headline: 'Giảm 50%', subheadline: '', ctaText: 'Mua' }),
    }));
    const res = compileGraph(decompileJob(job));
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    expect(res.job).toEqual(job);
    expect(res.warnings).toEqual([]);
  });
});
