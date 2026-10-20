import type { CompiledJob } from '../compiled-job';
import type { FlowAsset, PixelAssetRole, ReferenceAssetRole } from '../schema';
import { DEFAULT_RATIO, DEFAULT_STYLE } from '../schema';
import { fromLegacyConfig } from '../legacy/from-legacy-config';
import { defaultTextStyle } from '../text/text-style';
import { LEGACY_FIXTURES } from './fixtures/legacy';

/**
 * flatMinimal / flatFull: mẫu tự dựng (trước là fixture của Ghép layer, đã gỡ 2026-10-20).
 * flatLegacy: lấy từ payload thật của form, xem ./fixtures/legacy.
 */

const asset = <R extends PixelAssetRole | ReferenceAssetRole>(
  assetId: string, role: R, hasAlpha: boolean,
): FlowAsset<R> => ({
  assetId, role, hasAlpha,
  url: `https://example.test/${assetId}.png`,
  fileName: `${assetId}.png`,
  originalDims: { width: 1024, height: 1024 },
});

/** Tối giản: 1 sản phẩm, 1 ratio, chỉ headline. */
export const flatMinimal: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'flat',
  ratios: [DEFAULT_RATIO],
  brief: { prompt: 'Nền bếp sáng, tông gỗ ấm', marketingBrief: { campaignIntents: ['product-launch'], focalSubjects: ['product'] } },
  references: [],
  model: 'nano-banana-2',
  products: [asset('asset-noi-chien', 'image', true)],
  textLayers: [{
    layerId: 'headline', role: 'headline', content: 'Giảm 30% cuối tuần',
    renderSource: 'layer', priority: 1, minFontSizePx: 28, style: defaultTextStyle('headline'),
  }],
  flat: { strictPreserveMode: true },
  export: { format: 'png', quality: 0.9, scale: 1, ratioIds: 'all' },
};

/** Đầy đủ: sản phẩm + logo, 3 ratio (xuất 2), style + brand + 2 ảnh tham chiếu, đủ 3 vai trò chữ. */
export const flatFull: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'flat',
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
    { layerId: 'headline', role: 'headline', content: 'Tết Sum Vầy', renderSource: 'layer', priority: 1, minFontSizePx: 32,
      style: { ...defaultTextStyle('headline'), fontSizePx: 88, fill: { kind: 'solid', color: '#FFD700' },
        stroke: { color: '#7A0019', widthPx: 3 }, shadow: { color: '#00000080', blurPx: 12, offsetX: 0, offsetY: 4 } } },
    { layerId: 'sub', role: 'subheadline', content: 'Quà tặng cao cấp từ 499K', renderSource: 'layer', priority: 2, minFontSizePx: 16, style: defaultTextStyle('subheadline') },
    { layerId: 'cta', role: 'cta', content: 'Mua ngay', renderSource: 'layer', priority: 3, minFontSizePx: 14,
      style: { ...defaultTextStyle('cta'), plate: { color: '#C8102E', paddingX: 40, paddingY: 18, radiusPx: 999 } } },
  ],
  flat: { strictPreserveMode: true },
  export: { format: 'jpg', quality: 0.8, scale: 2, ratioIds: ['custom-1080x1920', 'social-zalo-oa-img'] },
};

/** Flat legacy – job sinh từ payload thật của form (fixture logged-full-text-logo). */
export const flatLegacy: CompiledJob = fromLegacyConfig(LEGACY_FIXTURES['logged-full-text-logo']!.request).job;

export const ALL_FIXTURES = { flatMinimal, flatFull, flatLegacy };
