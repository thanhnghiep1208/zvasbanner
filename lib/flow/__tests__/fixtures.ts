import type { CompiledJob } from '../compiled-job';
import { DEFAULT_SHADOW } from '../schema';

/**
 * TODO: thay 3 fixture này bằng 3 config THẬT lấy từ Postgres (sau khi qua adapter legacy → CompiledJob).
 */

/** Composed tối giản: 1 sản phẩm, 1 ratio, chỉ headline. */
export const composedMinimal: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'composed',
  ratios: [{ id: '1:1', width: 1080, height: 1080 }],
  brief: { prompt: 'Nền bếp sáng, tông gỗ ấm', chips: ['lifestyle'] },
  referenceAssetIds: [],
  model: 'gemini-flash',
  products: [{ assetId: 'asset-noi-chien', hasAlpha: true }],
  textLayers: [{
    layerId: 'headline', role: 'headline', content: 'Giảm 30% cuối tuần',
    renderSource: 'layer', priority: 1, minFontSizePx: 28,
  }],
  composed: { lightDirectionDeg: 315, strictNoText: true, layoutOverrides: {}, shadow: DEFAULT_SHADOW },
  export: { format: 'png', ratioIds: 'all' },
};

/** Composed đầy đủ: 2 sản phẩm, 3 ratio, override tay, shadow custom, headline AI, style + brand + ref. */
export const composedFull: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'composed',
  ratios: [
    { id: '1:1', width: 1080, height: 1080 },
    { id: '9:16', width: 1080, height: 1920 },
    { id: '16:9', width: 1920, height: 1080 },
  ],
  brief: { prompt: 'Campaign Tết, đỏ vàng, sang trọng', chips: ['tet', 'premium'] },
  style: { presetId: 'luxury-warm' },
  brandKitId: 'brand-vng',
  referenceAssetIds: ['ref-1', 'ref-2'],
  model: 'gemini-pro',
  products: [
    { assetId: 'asset-hop-qua', hasAlpha: true },
    { assetId: 'asset-chai', hasAlpha: true },
  ],
  textLayers: [
    { layerId: 'headline', role: 'headline', content: 'Tết Sum Vầy', renderSource: 'ai', priority: 1, minFontSizePx: 32 },
    { layerId: 'sub', role: 'subline', content: 'Quà tặng cao cấp từ 499K', renderSource: 'layer', priority: 2, minFontSizePx: 16 },
    { layerId: 'cta', role: 'cta', content: 'Mua ngay', renderSource: 'layer', priority: 3, minFontSizePx: 14 },
  ],
  composed: {
    lightDirectionDeg: 45,
    strictNoText: true,
    layoutOverrides: {
      '9:16': { 'asset-hop-qua': { cx: 0.5, cy: 0.62, w: 0.7, h: 0.4, rotationDeg: 0 } },
    },
    shadow: { mode: 'custom', opacity: 0.5, blurPx: 32, offsetX: 6, offsetY: 12 },
  },
  export: { format: 'jpg', ratioIds: ['9:16', '1:1'] },
};

/** Flat legacy có harmony pass – dạng project cũ sau migrate. */
export const flatLegacy: CompiledJob = {
  schemaVersion: 1,
  renderMode: 'flat',
  ratios: [{ id: '4:5', width: 1080, height: 1350 }],
  brief: { prompt: 'Banner flash sale', chips: [] },
  referenceAssetIds: [],
  model: 'gemini-pro',
  products: [{ assetId: 'asset-giay', hasAlpha: false }],
  textLayers: [],
  flat: { strictPreserveMode: true, harmonyPass: true },
  export: { format: 'png', ratioIds: 'all' },
};

export const ALL_FIXTURES = { composedMinimal, composedFull, flatLegacy };
