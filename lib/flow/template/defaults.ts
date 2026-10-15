/**
 * Template mặc định (T5.3). Mọi template đi qua Compose (SPEC 3 #4).
 *
 * Mỗi template dựng từ một CompiledJob rồi `decompileJob` → id node xác định (n-product-0, n-text-<layerId>,
 * n-brief, n-ratio, n-style, n-brand, n-generate, n-compose, n-export), nên `exposed` trỏ thẳng id đó.
 * Ảnh sản phẩm để trống – user tải lên ở Simple view (field bắt buộc).
 */
import type { CompiledJob } from '../compiled-job';
import { decompileJob } from '../decompiler';
import type { FlowAsset, PixelAssetRole, RatioSpec, TextRole } from '../schema';
import { DEFAULT_SHADOW, DEFAULT_STYLE } from '../schema';
import { defaultTextStyle, TEXT_ROLE_DEFAULTS, type TextStyle } from '../text/text-style';
import type { ExposedOption, ExposedParam, FlowTemplate } from './template';

/* ── Mảnh dựng chung ─────────────────────────────────────────── */

const emptyProduct = (): FlowAsset<PixelAssetRole> => ({
  assetId: '', url: '', fileName: '', role: 'image', hasAlpha: false, originalDims: { width: 0, height: 0 },
});

const ratio = (id: string, name: string, width: number, height: number, platform: string): RatioSpec =>
  ({ id, name, width, height, platform });

/** Preset có sẵn trong lib/canvas-presets.ts (id giữ nguyên để form và canvas khớp nhau). */
const R = {
  zaloOa: ratio('social-zalo-oa-img', 'Zalo OA Img', 1075, 645, 'Zalo'),
  zaloFeed: ratio('zalo-app-feed', 'Zalo App Feed', 1024, 533, 'Zalo'),
  zaloMiniapp: ratio('zalo-banner-miniapp', 'Banner in Miniapp', 1032, 810, 'Zalo'),
  mp3Home: ratio('mp3-home', 'MP3 Home', 1071, 357, 'MP3'),
  baomoiRect: ratio('baomoi-medium-rectangle', 'Báo Mới Medium Rectangle', 300, 250, 'Báo Mới'),
  square: ratio('custom-1080x1080', 'Custom', 1080, 1080, 'Custom'),
  portrait: ratio('custom-1080x1350', 'Custom', 1080, 1350, 'Custom'),
  story: ratio('custom-1080x1920', 'Custom', 1080, 1920, 'Custom'),
};

function text(
  layerId: string, role: TextRole, content: string, priority: number, style: Partial<TextStyle> = {},
): CompiledJob['textLayers'][number] {
  return {
    layerId, role, content, renderSource: 'layer', priority,
    minFontSizePx: TEXT_ROLE_DEFAULTS[role].minFontSizePx,
    style: { ...defaultTextStyle(role), ...style },
  };
}

function job(over: Partial<CompiledJob> & Pick<CompiledJob, 'brief' | 'ratios' | 'textLayers'>): CompiledJob {
  return {
    schemaVersion: 1,
    renderMode: 'composed',
    references: [],
    model: 'nano-banana-2',
    products: [emptyProduct()],
    composed: { lightDirectionDeg: 315, strictNoText: true, layoutOverrides: {}, shadow: DEFAULT_SHADOW },
    export: { format: 'png', quality: 0.9, scale: 1, ratioIds: 'all' },
    ...over,
  };
}

/** Nhãn không emoji (lib/flow không import component). Giá trị = CampaignIntent trong lib/types.ts. */
export const INTENT_OPTIONS: ExposedOption[] = [
  { value: 'flash-sale', label: 'Flash sale' },
  { value: 'product-launch', label: 'Ra mắt sản phẩm' },
  { value: 'brand-awareness', label: 'Nhận thức thương hiệu' },
  { value: 'event', label: 'Sự kiện / Ngày lễ' },
];

/* ── Field dùng lại giữa các template ────────────────────────── */

const G = { image: 'Hình ảnh', content: 'Nội dung', look: 'Phong cách', size: 'Kích thước' } as const;

const fProduct: ExposedParam = {
  id: 'product', nodeId: 'n-product-0', path: [], label: 'Ảnh sản phẩm', control: 'asset', required: true, group: G.image,
  hint: 'Nên dùng PNG nền trong suốt để có bóng đổ tự nhiên.',
};
const fText = (layerId: string, label: string, required = false): ExposedParam => ({
  id: layerId, nodeId: `n-text-${layerId}`, path: ['content'], label, control: 'text', required, group: G.content,
});
const fTextColor = (layerId: string, label: string): ExposedParam => ({
  id: `${layerId}-color`, nodeId: `n-text-${layerId}`, path: ['style', 'fill', 'color'], label, control: 'color', group: G.look,
});
const fBrief = (placeholder: string): ExposedParam => ({
  id: 'brief', nodeId: 'n-brief', path: ['prompt'], label: 'Mô tả bối cảnh nền', control: 'textarea', group: G.content,
  placeholder, hint: 'Chỉ mô tả nền và không khí; sản phẩm và chữ giữ nguyên, không do AI vẽ.',
});
const fIntents: ExposedParam = {
  id: 'intents', nodeId: 'n-brief', path: ['marketingBrief', 'campaignIntents'], label: 'Mục tiêu chiến dịch',
  control: 'chips', options: INTENT_OPTIONS, group: G.content,
};
const fRatios = (hint?: string): ExposedParam => ({
  id: 'ratios', nodeId: 'n-ratio', path: ['ratios'], label: 'Kích thước', control: 'ratios', group: G.size, hint,
});

/* ── Template ────────────────────────────────────────────────── */

const productHero: FlowTemplate = {
  id: 'product-hero',
  name: 'Sản phẩm nổi bật',
  description: '1 sản phẩm ở trung tâm, tiêu đề + mô tả ngắn, nền tối giản. 1 kích thước.',
  graph: decompileJob(job({
    brief: {
      prompt: 'Mặt bàn đá sáng trong studio, ánh sáng tự nhiên dịu, phông nền trơn tông kem',
      marketingBrief: { campaignIntents: ['product-launch'], focalSubjects: ['product'] },
    },
    style: { ...DEFAULT_STYLE, style: 'minimalist', mood: 'calm', colorPalette: 'auto', fontStyle: 'modern' },
    ratios: [R.zaloOa],
    textLayers: [
      text('headline', 'headline', 'Tên sản phẩm của bạn', 1),
      text('sub', 'subheadline', 'Một câu nói lên điểm khác biệt', 2, { fill: { kind: 'solid', color: '#444444' } }),
    ],
  })),
  exposed: [
    fProduct,
    fText('headline', 'Tiêu đề chính', true),
    fText('sub', 'Mô tả ngắn'),
    fBrief('VD: mặt bàn gỗ sồi, cây xanh mờ phía sau, nắng sớm'),
    fTextColor('headline', 'Màu tiêu đề'),
    { id: 'style', nodeId: 'n-style', path: ['style'], label: 'Phong cách nền', control: 'select', group: G.look,
      options: [
        { value: 'minimalist', label: 'Tối giản' }, { value: 'luxury', label: 'Sang trọng' },
        { value: 'playful', label: 'Vui tươi' }, { value: 'corporate', label: 'Doanh nghiệp' },
        { value: 'bold', label: 'Nổi bật' },
      ] },
    fRatios(),
  ],
};

const saleMultiRatio: FlowTemplate = {
  id: 'sale-multi-ratio',
  name: 'Khuyến mãi đa kích thước',
  description: 'Banner sale có nút CTA, xuất cùng lúc cho Zalo, MP3 và Báo Mới. Mỗi kích thước tự xếp lại bố cục.',
  graph: decompileJob(job({
    brief: {
      prompt: 'Nền đỏ cam rực rỡ, ánh sáng sân khấu, hiệu ứng confetti nhẹ phía xa, cảm giác khẩn trương',
      marketingBrief: { campaignIntents: ['flash-sale'], focalSubjects: ['product', 'text'] },
    },
    style: { ...DEFAULT_STYLE, style: 'bold', mood: 'energetic', colorPalette: 'warm', fontStyle: 'display' },
    ratios: [R.zaloOa, R.zaloFeed, R.mp3Home, R.baomoiRect],
    textLayers: [
      text('headline', 'headline', 'GIẢM ĐẾN 50%', 1, {
        fontFamily: 'montserrat', textTransform: 'uppercase', fill: { kind: 'solid', color: '#FFFFFF' },
        shadow: { color: '#00000066', blurPx: 12, offsetX: 0, offsetY: 4 },
      }),
      text('sub', 'subheadline', 'Chỉ 3 ngày cuối tuần', 2, {
        fontFamily: 'montserrat', fill: { kind: 'solid', color: '#FFF4E0' },
      }),
      text('cta', 'cta', 'Mua ngay', 3, {
        fontFamily: 'montserrat', fill: { kind: 'solid', color: '#C1121F' },
        plate: { color: '#FFD60A', paddingX: 36, paddingY: 16, radiusPx: 999 },
      }),
    ],
  })),
  exposed: [
    fProduct,
    fText('headline', 'Tiêu đề khuyến mãi', true),
    fText('sub', 'Thời gian / điều kiện'),
    fText('cta', 'Nút kêu gọi'),
    fBrief('VD: nền đỏ cam, confetti, ánh đèn sân khấu'),
    fIntents,
    fTextColor('headline', 'Màu tiêu đề'),
    { id: 'cta-plate', nodeId: 'n-text-cta', path: ['style', 'plate', 'color'], label: 'Màu nút', control: 'color', group: G.look },
    fRatios('Mỗi kích thước tốn 1 lượt AI để sinh nền.'),
  ],
};

const socialPost: FlowTemplate = {
  id: 'social-post',
  name: 'Bài đăng mạng xã hội',
  description: 'Khung vuông và dọc cho feed/story, tiêu đề lớn phong cách vui tươi.',
  graph: decompileJob(job({
    brief: {
      prompt: 'Không gian lifestyle tươi sáng, màu pastel, đồ vật trang trí đơn giản, ánh nắng ấm',
      marketingBrief: { campaignIntents: ['brand-awareness'], focalSubjects: ['product', 'scene'] },
    },
    style: { ...DEFAULT_STYLE, style: 'playful', mood: 'energetic', colorPalette: 'auto', fontStyle: 'sans' },
    ratios: [R.square, R.portrait],
    textLayers: [
      text('headline', 'headline', 'Ngày mới thêm vui', 1, { fontFamily: 'be-vietnam-pro', fontSizePx: 84 }),
      text('cta', 'cta', 'Khám phá ngay', 2, {
        fontFamily: 'be-vietnam-pro', plate: { color: '#111111', paddingX: 32, paddingY: 16, radiusPx: 999 },
      }),
    ],
  })),
  exposed: [
    fProduct,
    fText('headline', 'Tiêu đề', true),
    fText('cta', 'Nút kêu gọi'),
    fBrief('VD: góc bàn cà phê sáng sớm, màu pastel'),
    fIntents,
    fTextColor('headline', 'Màu tiêu đề'),
    fRatios('Có thể thêm 1080×1920 cho story.'),
  ],
};

const eventBrand: FlowTemplate = {
  id: 'event-brand',
  name: 'Sự kiện theo thương hiệu',
  description: 'Banner lễ/sự kiện dùng màu thương hiệu, chữ có chân sang trọng. Zalo OA + Miniapp.',
  graph: decompileJob(job({
    brief: {
      prompt: 'Không khí lễ hội sang trọng, ánh đèn bokeh vàng ấm, chất liệu nhung và kim loại',
      marketingBrief: { campaignIntents: ['event'], focalSubjects: ['product', 'text'] },
    },
    style: { ...DEFAULT_STYLE, style: 'luxury', mood: 'festive', colorPalette: 'brand', fontStyle: 'serif' },
    brandKit: { colors: ['#7A0019', '#E9C46A'] },
    ratios: [R.zaloOa, R.zaloMiniapp],
    textLayers: [
      text('headline', 'headline', 'Mừng Xuân Sum Vầy', 1, {
        fontFamily: 'noto-serif', fill: { kind: 'solid', color: '#E9C46A' },
        shadow: { color: '#00000080', blurPx: 10, offsetX: 0, offsetY: 3 },
      }),
      text('sub', 'subheadline', 'Quà tặng cao cấp từ 499K', 2, {
        fontFamily: 'noto-serif', fill: { kind: 'solid', color: '#FFFFFF' },
      }),
    ],
  })),
  exposed: [
    fProduct,
    fText('headline', 'Tên sự kiện', true),
    fText('sub', 'Thông điệp phụ'),
    fBrief('VD: đèn lồng đỏ, hoa mai, ánh vàng ấm'),
    fTextColor('headline', 'Màu tiêu đề'),
    fTextColor('sub', 'Màu thông điệp phụ'),
    fRatios(),
  ],
};

/** Thứ tự = thứ tự hiện trong UI chọn template; phần tử đầu là mặc định khi mở /flow (T5.4). */
export const DEFAULT_TEMPLATES: readonly FlowTemplate[] = [productHero, saleMultiRatio, socialPost, eventBrand];

export function getTemplate(id: string): FlowTemplate | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.id === id);
}
