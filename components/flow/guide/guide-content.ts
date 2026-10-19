/**
 * Nội dung trang hướng dẫn /flow/guide. Port, nhãn, mô tả, số lượt AI đọc thẳng từ NODE_DEFINITIONS
 * (FlowGuide.tsx) nên không lệch registry; file này chỉ giữ phần viết tay: mức cần thiết theo từng
 * kiểu flow, các bước, dây và mẹo. Đổi node/port → kiểm lại (có test).
 */
import type { NodeType } from '@/lib/flow/schema';

/** Mức cần thiết của node trong 1 kiểu flow. `none` = không dùng trong kiểu flow đó. */
export type Need = 'required' | 'recommended' | 'optional' | 'none';

export const NEED_LABELS: Record<Need, string> = {
  required: 'Bắt buộc',
  recommended: 'Nên có',
  optional: 'Tuỳ chọn',
  none: 'Không dùng',
};

/** composed = Ghép layer (mặc định, mọi template trừ "Theo banner mẫu"); flat = AI vẽ cả banner. */
export const NEED: Record<NodeType, { composed: Need; flat: Need }> = {
  'product-asset': { composed: 'recommended', flat: 'recommended' },
  'reference-image': { composed: 'optional', flat: 'optional' },
  'brief': { composed: 'required', flat: 'required' },
  'text-layer': { composed: 'recommended', flat: 'recommended' },
  'brand-kit': { composed: 'optional', flat: 'optional' },
  'ratio': { composed: 'required', flat: 'required' },
  'style': { composed: 'recommended', flat: 'recommended' },
  'auto-layout': { composed: 'required', flat: 'none' },
  'generate-background': { composed: 'required', flat: 'none' },
  'generate-flat': { composed: 'none', flat: 'required' },
  'compose': { composed: 'required', flat: 'none' },
  'export': { composed: 'required', flat: 'required' },
};

/** Mẹo ngắn cho từng node: nối đi đâu (flow Ghép layer) + 1–2 ý cần nhớ. */
export const TIPS: Record<NodeType, { connect: string; tips: string[] }> = {
  'product-asset': {
    connect: 'Auto layout + Ghép layer',
    tips: ['Chọn loại: sản phẩm, logo hoặc trang trí.', 'PNG nền trong suốt → có bóng đổ tự động.'],
  },
  'reference-image': {
    connect: 'Tạo nền',
    tips: ['Tối đa 4MB. AI lấy màu, ánh sáng, hoạ tiết nền của mẫu.'],
  },
  'brief': {
    connect: 'Tạo nền',
    tips: ['Điền mục đích, đối tượng, thông điệp, ưu đãi, tone – AI chọn không khí nền theo đó.', '"Gợi ý chữ từ brief" viết sẵn tiêu đề, mô tả, CTA.'],
  },
  'text-layer': {
    connect: 'Auto layout + Ghép layer',
    tips: ['Mỗi dòng chữ 1 node: tiêu đề, tiêu đề phụ, CTA.', '"Tự động theo banner" tự chọn font, cỡ, màu dễ đọc.'],
  },
  'brand-kit': {
    connect: 'Tạo nền',
    tips: ['Màu hex, font và góc đặt logo của thương hiệu.'],
  },
  'ratio': {
    connect: 'Auto layout',
    tips: ['Thêm nhiều kích thước để xuất cùng lúc; mỗi kích thước tốn thêm lượt AI.'],
  },
  'style': {
    connect: 'Tạo nền',
    tips: ['Phong cách nền, đồng thời quyết định kiểu chữ tự động.'],
  },
  'auto-layout': {
    connect: 'Tạo nền + Ghép layer',
    tips: ['Báo "không đủ chỗ" → rút ngắn chữ hoặc bớt kích thước hẹp.'],
  },
  'generate-background': {
    connect: 'Ghép layer',
    tips: ['Chừa chỗ trống cho sản phẩm và chữ.', '"Hướng sáng" quyết định hướng bóng đổ.'],
  },
  'generate-flat': {
    connect: 'Xuất ảnh',
    tips: ['AI vẽ cả chữ và sản phẩm: có thể sai chính tả, lệch chi tiết.'],
  },
  'compose': {
    connect: 'Xuất ảnh',
    tips: ['Chỉ ảnh và chữ nối vào đây mới hiện trên banner.'],
  },
  'export': {
    connect: 'Điểm cuối',
    tips: ['PNG/JPG, ×1/×2. Mỗi flow đúng 1 node Xuất ảnh.'],
  },
};

/** Lỗi/cảnh báo hay gặp → cách sửa. Message gốc nằm ở lib/flow/validate.ts. */
export const COMMON_ISSUES: { title: string; fix: string; severity: 'error' | 'warning' }[] = [
  { severity: 'error', title: 'Thiếu input bắt buộc', fix: 'Chọn node, xem port nào thiếu, kéo dây từ node cùng màu.' },
  { severity: 'error', title: 'Không đủ chỗ', fix: 'Rút ngắn chữ, giảm "Cỡ tối thiểu", bớt ảnh hoặc kích thước hẹp.' },
  { severity: 'error', title: 'Lỗi ở Xuất ảnh', fix: 'Giữ đúng 1 node Xuất ảnh, nối từ đúng 1 nguồn.' },
  { severity: 'warning', title: 'Ảnh chưa nối', fix: 'Node viền vàng: nối ảnh vào Auto layout + Ghép layer.' },
  { severity: 'warning', title: 'Ảnh chưa tách nền', fix: 'Dùng PNG nền trong suốt để có bóng đổ.' },
  { severity: 'warning', title: 'Cần tải lại ảnh', fix: 'Project đã lưu không giữ ảnh – tải lại trước khi chạy.' },
];

/** Dây của 1 flow đầy đủ. `required` = thiếu dây này thì flow báo lỗi. */
export interface RecipeEdge {
  from: NodeType;
  to: NodeType;
  /** Port vào trên node đích (id port = kiểu port). */
  port: string;
  required: boolean;
}

/** 1 bước trên sơ đồ flow: các node thuộc bước đó, theo thứ tự hiển thị. */
export interface RecipeStage {
  title: string;
  hint: string;
  nodes: NodeType[];
}

export interface Recipe {
  id: 'composed' | 'flat';
  title: string;
  summary: string;
  aiCalls: string;
  templateId: string;
  templateName: string;
  stages: RecipeStage[];
  edges: RecipeEdge[];
}

const e = (from: NodeType, to: NodeType, port: string, required = false): RecipeEdge => ({ from, to, port, required });

const INPUT_NODES: NodeType[] = ['ratio', 'brief', 'product-asset', 'text-layer', 'style', 'brand-kit', 'reference-image'];

export const RECIPES: Recipe[] = [
  {
    id: 'composed',
    title: 'Ghép layer',
    summary: 'AI chỉ tạo nền. Sản phẩm giữ nguyên, chữ không sai chính tả.',
    aiCalls: '1 lượt AI / kích thước',
    templateId: 'product-hero',
    templateName: 'Sản phẩm nổi bật',
    stages: [
      { title: 'Chuẩn bị', hint: 'Kích thước, brief, ảnh, chữ', nodes: INPUT_NODES },
      { title: 'Xếp bố cục', hint: 'Tự động, không tốn AI', nodes: ['auto-layout'] },
      { title: 'Tạo nền', hint: 'AI vẽ nền', nodes: ['generate-background'] },
      { title: 'Ghép & xuất', hint: 'Ghép trên máy, tải ảnh', nodes: ['compose', 'export'] },
    ],
    edges: [
      e('ratio', 'auto-layout', 'ratio', true),
      e('product-asset', 'auto-layout', 'product'),
      e('text-layer', 'auto-layout', 'text'),
      e('auto-layout', 'generate-background', 'layout', true),
      e('brief', 'generate-background', 'brief', true),
      e('style', 'generate-background', 'style'),
      e('brand-kit', 'generate-background', 'brand'),
      e('reference-image', 'generate-background', 'image'),
      e('generate-background', 'compose', 'background', true),
      e('auto-layout', 'compose', 'layout', true),
      e('product-asset', 'compose', 'product'),
      e('text-layer', 'compose', 'text'),
      e('compose', 'export', 'composition', true),
    ],
  },
  {
    id: 'flat',
    title: 'Flat',
    summary: 'AI vẽ cả banner. Dùng khi cần bám bố cục banner mẫu.',
    aiCalls: '2 lượt AI / kích thước',
    templateId: 'reference-banner',
    templateName: 'Theo banner mẫu',
    stages: [
      { title: 'Chuẩn bị', hint: 'Kích thước, mô tả, banner mẫu', nodes: INPUT_NODES },
      { title: 'Tạo banner', hint: 'AI vẽ cả banner', nodes: ['generate-flat'] },
      { title: 'Xuất', hint: 'Tải ảnh', nodes: ['export'] },
    ],
    edges: [
      e('ratio', 'generate-flat', 'ratio', true),
      e('brief', 'generate-flat', 'brief', true),
      e('reference-image', 'generate-flat', 'image'),
      e('product-asset', 'generate-flat', 'product'),
      e('text-layer', 'generate-flat', 'text'),
      e('style', 'generate-flat', 'style'),
      e('brand-kit', 'generate-flat', 'brand'),
      e('generate-flat', 'export', 'raster', true),
    ],
  },
];
