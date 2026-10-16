import { describe, expect, it } from 'vitest';
import { assembleFullPrompt } from '../prompt-builder';
import type { GenerationRequest, UploadedAsset } from '../types';

const asset = (role: UploadedAsset['role']): UploadedAsset => ({
  id: role, url: 'blob:x', dataUrl: 'data:image/png;base64,AA', fileName: `${role}.png`, role, hasAlpha: true,
  originalDims: { width: 800, height: 600 },
});

const request = (assets: UploadedAsset[], extra: Partial<GenerationRequest> = {}): GenerationRequest => ({
  canvasConfig: { width: 1075, height: 645, platform: 'Zalo', name: 'Zalo OA Img' },
  assets,
  brandKit: { colors: [], fontPreference: '', logoPosition: 'top-left' },
  styleControls: {
    style: 'bold', mood: 'energetic', colorPalette: 'auto', fontStyle: 'sans', strictPreserveMode: true,
    backgroundConfig: { tones: [], grains: [], shapes: [], effects: [] },
  },
  userPrompt: 'Banner khuyến mãi\nHeadline: Giảm 50% toàn bộ\nCTA: Mua ngay',
  imageModel: 'nano-banana-2',
  ...extra,
} as GenerationRequest);

describe('prompt có Banner tham chiếu style', () => {
  it('bám bố cục + phong cách ảnh mẫu, đổi kích thước, thay đúng chữ của user', () => {
    const p = assembleFullPrompt(request([asset('image'), asset('style-reference')]));
    expect(p).toContain('Copy its LAYOUT');
    expect(p).toContain('Re-fit it to the target canvas');
    expect(p).toContain('Never keep the reference\'s original words');
    expect(p).toContain('=== REFERENCE BANNER: TEXT REPLACEMENT ===');
    expect(p).toContain('- Headline: Giảm 50% toàn bộ');
    expect(p).toContain('- CTA: Mua ngay');
    expect(p).toContain('Prioritize FAITHFULNESS to the reference banner');
    expect(p).toContain('overrides the style, mood, palette and typography settings');
    expect(p).not.toContain('Prioritize visual originality');
  });

  it('không có ảnh tham chiếu → prompt như cũ', () => {
    const p = assembleFullPrompt(request([asset('image')]));
    expect(p).not.toContain('REFERENCE BANNER');
    expect(p).toContain('Prioritize visual originality');
  });

  it('kích thước phụ (thích nghi từ ảnh đầu) giữ chỉ dẫn thích nghi, không dùng khối ảnh mẫu', () => {
    const p = assembleFullPrompt(request([asset('style-reference')], { layoutAdaptationFromBanner: 'data:image/png;base64,BB' }));
    expect(p).toContain('LAYOUT ADAPTATION');
    expect(p).not.toContain('TEXT REPLACEMENT');
  });
});
