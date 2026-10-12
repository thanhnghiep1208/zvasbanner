import type { CompiledJob } from '../compiled-job';
import type { FlowAsset, PixelAssetRole, ReferenceAssetRole } from '../schema';
import { DEFAULT_RATIO, DEFAULT_SHADOW, DEFAULT_STYLE } from '../schema';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { LEGACY_FIXTURES } from './fixtures/legacy';

/**
 * Composed: chưa có pipeline thật (Q3, Q8) nên 2 fixture composed là mẫu tự dựng.
 * Flat: lấy từ payload thật của form, xem ./fixtures/legacy.
 */

const asset = <R extends PixelAssetRole | ReferenceAssetRole>(
  assetId: string, role: R, hasAlpha: boolean,
): FlowAsset<R> => ({
  assetId, role, hasAlpha,
  url: `https://example.test/${assetId}.png`,
  fileName: `${assetId}.png`,
  originalDims: { width: 1024, height: 1024 },
});

/** Composed tối giản: 1 sản phẩm, 1 ratio, chỉ headline. */
export const composedMinimal: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'composed',
  ratios: [DEFAULT_RATIO],
  brief: { prompt: 'Nền bếp sáng, tông gỗ ấm', marketingBrief: { campaignIntents: ['product-launch'], focalSubjects: ['product'] } },
  references: [],
  model: 'nano-banana-2',
  products: [asset('asset-noi-chien', 'image', true)],
  textLayers: [{
    layerId: 'headline', role: 'headline', content: 'Giảm 30% cuối tuần',
    renderSource: 'layer', priority: 1, minFontSizePx: 28,
  }],
  composed: { lightDirectionDeg: 315, strictNoText: true, layoutOverrides: {}, shadow: DEFAULT_SHADOW },
  export: { format: 'png', quality: 0.9, scale: 1, ratioIds: 'all' },
};

/** Composed đầy đủ: sản phẩm + logo, 3 ratio, override tay, shadow custom, headline AI, style + brand + ref. */
export const composedFull: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'composed',
  ratios: [
    { id: 'social-zalo-oa-img', width: 1075, height: 645, platform: 'Zalo', name: 'Zalo OA Img' },
    { id: 'custom-1080x1920', width: 1080, height: 1920, platform: 'Custom', name: 'Custom' },
    { id: 'custom-1080x1080', width: 1080, height: 1080, platform: 'Custom', name: 'Custom' },
  ],
  brief: { prompt: 'Campaign Tết, đỏ vàng, sang trọng', marketingBrief: { campaignIntents: ['event'], focalSubjects: ['product', 'text'] } },
  style: { ...DEFAULT_STYLE, style: 'luxury', mood: 'festive', colorPalette: 'warm' },
  brandKit: { colors: ['#C8102E', '#FFD700'], fontPreference: 'serif' },
  references: [asset('ref-1', 'style-reference', false), asset('ref-bg', 'background', false)],
  model: 'nano-banana-pro',
  products: [
    asset('asset-hop-qua', 'image', true),
    asset('asset-logo', 'logo', true),
  ],
  textLayers: [
    { layerId: 'headline', role: 'headline', content: 'Tết Sum Vầy', renderSource: 'ai', priority: 1, minFontSizePx: 32 },
    { layerId: 'sub', role: 'subheadline', content: 'Quà tặng cao cấp từ 499K', renderSource: 'layer', priority: 2, minFontSizePx: 16 },
    { layerId: 'cta', role: 'cta', content: 'Mua ngay', renderSource: 'layer', priority: 3, minFontSizePx: 14 },
  ],
  composed: {
    lightDirectionDeg: 45,
    strictNoText: true,
    layoutOverrides: {
      'custom-1080x1920': { 'asset-hop-qua': { cx: 0.5, cy: 0.62, w: 0.7, h: 0.4, rotationDeg: 0 } },
    },
    shadow: { mode: 'custom', opacity: 0.5, blurPx: 32, offsetX: 6, offsetY: 12 },
  },
  export: { format: 'jpg', quality: 0.8, scale: 2, ratioIds: ['custom-1080x1920', 'social-zalo-oa-img'] },
};

/** Flat legacy – job sinh từ payload thật của form (fixture logged-full-text-logo). */
export const flatLegacy: CompiledJob = fromLegacyConfig(LEGACY_FIXTURES['logged-full-text-logo']!.request).job;

export const ALL_FIXTURES = { composedMinimal, composedFull, flatLegacy };
