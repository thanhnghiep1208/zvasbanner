/**
 * Nội dung trang hướng dẫn /flow/guide. Port, nhãn, mô tả, số lượt AI đọc thẳng từ NODE_DEFINITIONS
 * (FlowGuide.tsx) nên không lệch registry; file này chỉ giữ phần viết tay: mức cần thiết theo từng
 * kiểu flow và mẹo dùng. Đổi node/port → kiểm lại `NEED` và `TIPS` (có test).
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

/** Nối ra đâu + mẹo. Viết ngắn, theo đúng nhãn UI. */
export const TIPS: Record<NodeType, { connect: string; tips: string[] }> = {
  'product-asset': {
    connect: 'Composed: nối vào cả Auto layout và Ghép layer. Flat: nối vào Tạo banner (flat).',
    tips: [
      'Chọn "Loại ảnh": ảnh sản phẩm, logo hoặc trang trí. Mỗi ảnh là 1 node.',
      'Dùng PNG nền trong suốt để có bóng đổ tự động; ảnh còn nền gốc sẽ hiện cả viền nền trên banner.',
      'Pixel ảnh không đi qua AI ở chế độ composed: sản phẩm giữ nguyên màu, hình dạng, chữ trên bao bì.',
      'Kéo thả ảnh từ máy vào chỗ trống trên canvas để tạo node nhanh; thả lên node ảnh để thay ảnh.',
    ],
  },
  'reference-image': {
    connect: 'Nối vào Tạo nền (composed) hoặc Tạo banner (flat).',
    tips: [
      'Tối đa 4MB mỗi ảnh.',
      'Composed: AI dựng lại phần nền của mẫu (loại nền, màu, ánh sáng, hoạ tiết), bỏ chữ/logo/sản phẩm của mẫu. Bố cục vẫn do Auto layout.',
      'Muốn bám cả bố cục của mẫu: dùng template "Theo banner mẫu" (flat).',
    ],
  },
  'brief': {
    connect: 'Nối vào Tạo nền hoặc Tạo banner (flat).',
    tips: [
      'Mô tả bối cảnh nền: chất liệu, không gian, ánh sáng, tông màu. VD: "mặt bàn gỗ sồi, cây xanh mờ phía sau, nắng sớm".',
      'Không ghi chữ cần hiện trên banner vào đây – dùng node Text.',
      'Chọn mục tiêu chiến dịch (flash sale, ra mắt sản phẩm…) để AI chọn không khí phù hợp.',
    ],
  },
  'text-layer': {
    connect: 'Composed: nối vào cả Auto layout và Ghép layer. Flat: nối vào Tạo banner (flat).',
    tips: [
      'Mỗi dòng chữ là 1 node: Tiêu đề, Tiêu đề phụ, CTA (nút) hoặc Text khác.',
      '"Tự động theo banner" (mặc định bật): font, cỡ theo Phong cách + Brand kit, màu chữ chọn theo nền thật để đọc rõ. Tắt để chỉnh tay.',
      'Composed: chữ vẽ bằng font thật, không sai chính tả. Flat: AI vẽ chữ nên có thể sai.',
      'Chữ dài quá không vừa khung → lỗi "không đủ chỗ" trên Auto layout. Rút ngắn chữ hoặc giảm "Cỡ tối thiểu".',
    ],
  },
  'brand-kit': {
    connect: 'Nối vào Tạo nền hoặc Tạo banner (flat).',
    tips: [
      'Màu thương hiệu dạng hex (#E30613). Tiêu đề tự động ưu tiên màu thương hiệu nếu đủ tương phản.',
      'Font thương hiệu thắng font theo Phong cách.',
      'Góc logo: logo dời vào góc đã chọn nếu không đè lên sản phẩm/chữ; không thì giữ vị trí layout và báo cảnh báo.',
    ],
  },
  'ratio': {
    connect: 'Composed: nối vào Auto layout. Flat: nối vào Tạo banner (flat).',
    tips: [
      'Thêm nhiều kích thước để xuất cùng lúc (Zalo OA, Báo Mới, story…). Mỗi kích thước tự xếp lại bố cục.',
      'Mỗi kích thước tốn 1 lượt AI (composed) hoặc 2 lượt (flat). Số lượt hiện trên nút "Chạy tất cả".',
    ],
  },
  'style': {
    connect: 'Nối vào Tạo nền hoặc Tạo banner (flat).',
    tips: [
      'Phong cách, mood, bảng màu và kiểu chữ của nền.',
      'Ảnh hưởng cả chữ tự động: phong cách Nổi bật → chữ IN HOA, đậm, lớn; Sang trọng → chữ có chân.',
    ],
  },
  'auto-layout': {
    connect: 'Nhận Kích thước + Asset + Text; nối ra Tạo nền và Ghép layer.',
    tips: [
      'Tự xếp sản phẩm và chữ cho từng kích thước, không tốn lượt AI.',
      'Không đủ chỗ: co sản phẩm, rồi co chữ (chữ ưu tiên thấp co trước), rồi thử bố cục khác. Vẫn không vừa → báo lỗi, không tự bỏ phần tử.',
      'Kéo chỉnh tay vị trí ở từng kích thước được lưu riêng, luôn thắng bố cục tự động.',
    ],
  },
  'generate-background': {
    connect: 'Nhận Layout + Brief (+ Phong cách, Brand kit, Ảnh tham chiếu); nối ra Ghép layer.',
    tips: [
      'AI chỉ tạo nền, chừa chỗ trống đúng vùng sản phẩm và chữ của Auto layout.',
      '"Hướng sáng" quyết định hướng bóng đổ của sản phẩm khi ghép.',
      'Mặc định cấm chữ trên nền để không chồng lên text layer.',
    ],
  },
  'generate-flat': {
    connect: 'Nhận Kích thước + Brief (+ Asset, Text, Phong cách, Brand kit, Ảnh tham chiếu); nối ra Xuất ảnh.',
    tips: [
      'AI vẽ cả banner như form cũ, kèm 1 lượt chỉnh hài hoà → 2 lượt AI mỗi kích thước.',
      'Sản phẩm và chữ đi qua AI: có thể lệch chi tiết hoặc sai chính tả. Dùng khi cần bám bố cục banner mẫu.',
      'Không dùng chung với Auto layout / Tạo nền / Ghép layer trong cùng 1 flow.',
    ],
  },
  'compose': {
    connect: 'Nhận Nền + Layout (+ Asset, Text); nối ra Xuất ảnh.',
    tips: [
      'Ghép trên máy bạn, không tốn lượt AI: nền + sản phẩm + bóng đổ + chữ.',
      'Bóng đổ: Tự động (theo hướng sáng), Tuỳ chỉnh (độ mờ, độ nhoè, lệch) hoặc Tắt.',
      'Chỉ asset và text nối vào đây mới xuất hiện trên banner.',
    ],
  },
  'export': {
    connect: 'Nhận Bản ghép (từ Ghép layer) hoặc Ảnh (từ Tạo banner flat) – đúng 1 nguồn.',
    tips: [
      'PNG hoặc JPG, chất lượng, độ phân giải ×1/×2.',
      'Chọn xuất tất cả hoặc một số kích thước.',
      'Mỗi flow cần đúng 1 node Xuất ảnh.',
    ],
  },
};

/** Lỗi/cảnh báo hay gặp → cách sửa. Message gốc nằm ở lib/flow/validate.ts. */
export const COMMON_ISSUES: { title: string; fix: string; severity: 'error' | 'warning' }[] = [
  { severity: 'error', title: 'Thiếu input bắt buộc', fix: 'Node có port bắt buộc chưa nối. Mở Inspector của node để xem port nào thiếu, kéo dây từ node cùng màu port.' },
  { severity: 'error', title: 'Cần đúng 1 node Xuất ảnh', fix: 'Xoá node Xuất ảnh thừa, hoặc thêm 1 node nếu chưa có.' },
  { severity: 'error', title: 'Xuất ảnh cần đúng 1 nguồn', fix: 'Nối Xuất ảnh với Ghép layer hoặc Tạo banner (flat), không nối cả hai.' },
  { severity: 'error', title: 'Không đủ chỗ (Auto layout)', fix: 'Rút ngắn chữ, giảm "Cỡ tối thiểu" của chữ, bớt ảnh, hoặc bỏ kích thước quá hẹp/dài.' },
  { severity: 'error', title: 'Graph có vòng lặp', fix: 'Dây chỉ đi một chiều từ đầu vào tới Xuất ảnh. Xoá dây quay ngược.' },
  { severity: 'warning', title: 'Ảnh chưa nối vào node nào', fix: 'Node ảnh viền vàng: kéo dây từ ảnh vào Auto layout + Ghép layer (hoặc Tạo nền với ảnh tham chiếu).' },
  { severity: 'warning', title: 'Ảnh sản phẩm chưa tách nền', fix: 'Dùng PNG nền trong suốt để có bóng đổ tự động và không lộ nền gốc.' },
  { severity: 'warning', title: 'Cần tải lại ảnh', fix: 'Project đã lưu không giữ ảnh. Tải lại ảnh vào các node ảnh trước khi chạy.' },
];

/** Dây của 1 flow đầy đủ. `required` = thiếu dây này thì flow báo lỗi. */
export interface RecipeEdge {
  from: NodeType;
  to: NodeType;
  /** Port vào trên node đích (id port = kiểu port). */
  port: string;
  required: boolean;
}

export interface Recipe {
  id: 'composed' | 'flat';
  title: string;
  summary: string;
  aiCalls: string;
  templateId: string;
  templateName: string;
  edges: RecipeEdge[];
}

const e = (from: NodeType, to: NodeType, port: string, required = false): RecipeEdge => ({ from, to, port, required });

export const RECIPES: Recipe[] = [
  {
    id: 'composed',
    title: 'Ghép layer (mặc định)',
    summary: 'AI chỉ tạo nền. Sản phẩm giữ nguyên pixel, chữ vẽ bằng font thật, bố cục tự xếp theo từng kích thước.',
    aiCalls: '1 lượt AI mỗi kích thước',
    templateId: 'product-hero',
    templateName: 'Sản phẩm nổi bật',
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
    title: 'Flat – AI vẽ cả banner',
    summary: 'Giống form cũ: AI vẽ nền, sản phẩm và chữ trong 1 ảnh. Dùng khi cần bám bố cục của banner mẫu.',
    aiCalls: '2 lượt AI mỗi kích thước',
    templateId: 'reference-banner',
    templateName: 'Theo banner mẫu',
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
