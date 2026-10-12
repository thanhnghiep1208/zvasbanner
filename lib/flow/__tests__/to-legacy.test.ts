import { describe, expect, it } from 'vitest';
import type { GenerationRequest, UploadedAsset } from '@/lib/types';
import { composeUserPrompt } from '@/lib/client-generation';
import { parseGenerationRequest } from '@/lib/validate-generation';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { composeLegacyPrompt, toLegacyConfig } from '../legacy/to-legacy-config';
import { decompileJob } from '../decompiler';
import { compileGraph } from '../compiler';
import { composedMinimal, flatLegacy } from './fixtures';

const uploaded = (id: string, role: UploadedAsset['role'], hasAlpha = true): UploadedAsset => ({
  id, role, hasAlpha,
  url: `blob:http://localhost:3000/${id}`,
  dataUrl: `data:image/png;base64,${id}`,
  fileName: `${id}.png`,
  originalDims: { width: 800, height: 600 },
});

const request = (patch: Partial<GenerationRequest> = {}): GenerationRequest => ({
  canvasConfig: { width: 1075, height: 645, platform: 'Zalo', name: 'Zalo OA Img' },
  assets: [uploaded('sp', 'image'), uploaded('logo', 'logo'), uploaded('ref', 'style-reference', false)],
  brandKit: { colors: ['#C8102E'], fontPreference: 'serif' },
  userPrompt: composeUserPrompt({ userPrompt: 'Flash sale', headline: 'Giảm 50%', subheadline: 'Hôm nay', ctaText: 'Mua ngay' }),
  styleControls: {
    style: 'bold', mood: 'energetic', colorPalette: 'brand', fontStyle: 'display',
    strictPreserveMode: false,
    backgroundConfig: { tones: ['warm-sunset'], grains: [], shapes: ['central-glow'], effects: [] },
  },
  imageModel: 'nano-banana-2',
  marketingBrief: { campaignIntents: ['flash-sale'], focalSubjects: ['product'] },
  ...patch,
});

const byId = (assets: UploadedAsset[]) => [...assets].sort((a, b) => a.id.localeCompare(b.id));
const normalize = (r: GenerationRequest) => ({ ...r, assets: byId(r.assets) });

describe('composeLegacyPrompt khớp composeUserPrompt gốc', () => {
  const cases = [
    { userPrompt: '  Nền bếp  ', headline: ' H ', subheadline: '', ctaText: 'C' },
    { userPrompt: '', headline: '', subheadline: 'S', ctaText: '' },
    { userPrompt: 'Dòng 1\nDòng 2', headline: 'H', subheadline: 'S', ctaText: 'C' },
    { userPrompt: '', headline: '', subheadline: '', ctaText: '' },
  ];
  for (const c of cases) {
    it(JSON.stringify(c), () => expect(composeLegacyPrompt(c)).toBe(composeUserPrompt(c)));
  }
});

describe('toLegacyConfig', () => {
  it('round-trip request → job → request (thứ tự asset theo nhóm role)', () => {
    const req = request();
    const { job, runtime } = fromLegacyConfig(req);
    const res = toLegacyConfig(job, runtime);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.warnings).toEqual([]);
    expect(res.requests).toHaveLength(1);
    expect(res.requests[0]!.ratioId).toBe('social-zalo-oa-img');
    expect(normalize(res.requests[0]!.request)).toEqual(normalize(req));
  });

  it('round-trip qua graph: request → job → graph → job → request', () => {
    const req = request({ layoutAdaptationFromBanner: 'data:image/png;base64,approved' });
    const { job, runtime } = fromLegacyConfig(req);
    const compiled = compileGraph(decompileJob(job));
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
    const res = toLegacyConfig(compiled.job, runtime);
    if (!res.ok) throw new Error(res.error.message);
    expect(normalize(res.requests[0]!.request)).toEqual(normalize(req));
  });

  it('request sinh ra qua được parser của server', () => {
    const res = toLegacyConfig(fromLegacyConfig(request()).job, fromLegacyConfig(request()).runtime);
    if (!res.ok) throw new Error(res.error.message);
    expect(parseGenerationRequest(JSON.parse(JSON.stringify(res.requests[0]!.request)))).not.toBeNull();
  });

  it('nhiều ratio → mỗi ratio 1 request, canvasConfig không có id', () => {
    const { job, runtime } = fromLegacyConfig(request());
    job.ratios.push({ id: 'custom-1080x1920', width: 1080, height: 1920, platform: 'Custom', name: 'Custom' });
    const res = toLegacyConfig(job, runtime);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.requests.map((r) => r.ratioId)).toEqual(['social-zalo-oa-img', 'custom-1080x1920']);
    expect(res.requests[1]!.request.canvasConfig).toEqual({ width: 1080, height: 1920, platform: 'Custom', name: 'Custom' });
  });

  it('composed → lỗi, không tự chuyển sang flat', () => {
    const res = toLegacyConfig(composedMinimal);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.code).toBe('composed-not-supported');
  });

  it('thiếu dataUrl → warning missing-asset-data, request vẫn hợp lệ', () => {
    const res = toLegacyConfig(flatLegacy);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.warnings.map((w) => [w.code, w.refs])).toEqual([['missing-asset-data', ['asset-giay']]]);
    expect(res.requests[0]!.request.assets[0]).not.toHaveProperty('dataUrl');
  });

  it('text layer role custom / role trùng → warning unmapped-text', () => {
    const { job, runtime } = fromLegacyConfig(request());
    const base = job.textLayers[0]!;
    job.textLayers.push(
      { ...base, layerId: 'headline-2', content: 'Headline thứ hai' },
      { ...base, layerId: 'note', role: 'custom', content: 'Ghi chú' },
    );
    const res = toLegacyConfig(job, runtime);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.warnings.map((w) => [w.code, w.refs])).toEqual([['unmapped-text', ['headline-2', 'note']]]);
    expect(res.requests[0]!.request.userPrompt).not.toContain('Headline thứ hai');
  });

  it('thiếu style / brandKit → mặc định của form', () => {
    const { job, runtime } = fromLegacyConfig(request());
    delete job.style;
    delete job.brandKit;
    const res = toLegacyConfig(job, runtime);
    if (!res.ok) throw new Error(res.error.message);
    const r = res.requests[0]!.request;
    expect(r.brandKit).toEqual({ colors: [] });
    expect(r.styleControls).toEqual({
      style: 'minimalist', mood: 'professional', colorPalette: 'auto', fontStyle: 'modern',
      strictPreserveMode: false,
      backgroundConfig: { tones: [], grains: [], shapes: [], effects: [] },
    });
  });
});
