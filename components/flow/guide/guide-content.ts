/**
 * Nội dung trang hướng dẫn /flow/guide. Port, nhãn, mô tả, số lượt AI đọc thẳng từ NODE_DEFINITIONS
 * (FlowGuide.tsx) nên không lệch registry; file này chỉ giữ phần viết tay: mức cần thiết theo từng
 * node, các bước, dây và mẹo. Đổi node/port → kiểm lại (có test).
 */
import type { NodeType } from '@/lib/flow/schema';

/** Mức cần thiết của node trong flow. */
export type Need = 'required' | 'recommended' | 'optional';

export const NEED_LABELS: Record<Need, string> = {
  required: 'Bắt buộc',
  recommended: 'Nên có',
  optional: 'Tuỳ chọn',
};

/** Mức cần thiết của từng node trong flow Tạo banner. */
export const NEED: Record<NodeType, Need> = {
  'product-asset': 'recommended',
  'reference-image': 'optional',
  'brief': 'required',
  'text-layer': 'recommended',
  'brand-kit': 'optional',
  'ratio': 'required',
  'style': 'recommended',
  'generate-flat': 'required',
  'export': 'required',
};

/** Mẹo ngắn cho từng node: nối đi đâu + 1–2 ý cần nhớ. */
export const TIPS: Record<NodeType, { connect: string; tips: string[] }> = {
  'product-asset': {
    connect: 'Tạo banner',
    tips: ['Chọn loại: sản phẩm, logo hoặc trang trí.', 'AI giữ nguyên hình dạng, màu; PNG nền trong suốt cho kết quả sạch nhất.'],
  },
  'reference-image': {
    connect: 'Tạo banner',
    tips: ['Tối đa 4MB. Banner mẫu: AI làm lại theo bố cục, phong cách của mẫu.'],
  },
  'brief': {
    connect: 'Tạo banner',
    tips: ['Điền mục đích, đối tượng, thông điệp, ưu đãi, tone – AI vẽ banner theo đó.', '"Gợi ý chữ từ brief" viết sẵn tiêu đề, mô tả, CTA.'],
  },
  'text-layer': {
    connect: 'Tạo banner',
    tips: ['Mỗi dòng chữ 1 node: tiêu đề, tiêu đề phụ, CTA (mỗi loại 1 node).', 'AI vẽ đúng nội dung; kiểm lại chính tả trên kết quả.'],
  },
  'brand-kit': {
    connect: 'Tạo banner',
    tips: ['Màu hex, font và góc đặt logo của thương hiệu.'],
  },
  'ratio': {
    connect: 'Tạo banner',
    tips: ['Thêm nhiều kích thước để xuất cùng lúc; kích thước sau dựng lại theo banner đầu.'],
  },
  'style': {
    connect: 'Tạo banner',
    tips: ['Phong cách, mood, bảng màu, kiểu chữ của banner.'],
  },
  'generate-flat': {
    connect: 'Xuất ảnh',
    tips: ['AI vẽ cả banner: nền, sản phẩm, chữ, rồi chỉnh hài hoà.', 'Chữ có thể sai chính tả: bấm Thử lại nếu cần.'],
  },
  'export': {
    connect: 'Điểm cuối',
    tips: ['PNG/JPG, ×1/×2, chọn kích thước cần xuất. Mỗi flow đúng 1 node Xuất ảnh.'],
  },
};

/** Lỗi/cảnh báo hay gặp → cách sửa. Message gốc nằm ở lib/flow/validate.ts. */
export const COMMON_ISSUES: { title: string; fix: string; severity: 'error' | 'warning' }[] = [
  { severity: 'error', title: 'Node viền đỏ nét đứt "Thiếu dây"', fix: 'Kéo dây từ node cùng màu vào ô có dấu *. Nút "N node cần bổ sung" trên header đưa bạn tới từng node.' },
  { severity: 'error', title: 'Lỗi ở Xuất ảnh', fix: 'Giữ đúng 1 node Xuất ảnh, nối từ Tạo banner.' },
  { severity: 'warning', title: 'Node viền vàng nét đứt', fix: '"Chưa có thông tin": điền nội dung hoặc tải ảnh. "Chưa nối": kéo dây từ ô bên phải vào Tạo banner.' },
  { severity: 'warning', title: 'Text không được gửi', fix: 'Mỗi loại tiêu đề chính, tiêu đề phụ, CTA chỉ dùng 1 node Text.' },
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

export const RECIPE: Recipe = {
  title: 'Tạo banner',
  summary: 'AI vẽ cả banner từ brief, ảnh sản phẩm và chữ của bạn.',
  aiCalls: '2 lượt AI / kích thước',
  templateId: 'product-hero',
  templateName: 'Sản phẩm nổi bật',
  stages: [
    { title: 'Chuẩn bị', hint: 'Kích thước, brief, ảnh, chữ', nodes: INPUT_NODES },
    { title: 'Tạo banner', hint: 'AI vẽ cả banner', nodes: ['generate-flat'] },
    { title: 'Xuất', hint: 'Tải ảnh', nodes: ['export'] },
  ],
  edges: [
    e('ratio', 'generate-flat', 'ratio', true),
    e('brief', 'generate-flat', 'brief', true),
    e('product-asset', 'generate-flat', 'product'),
    e('text-layer', 'generate-flat', 'text'),
    e('style', 'generate-flat', 'style'),
    e('brand-kit', 'generate-flat', 'brand'),
    e('reference-image', 'generate-flat', 'image'),
    e('generate-flat', 'export', 'raster', true),
  ],
};
