import type { NodeParamsMap, NodeType, PortType } from './schema';
import { DEFAULT_RATIO, DEFAULT_SHADOW, DEFAULT_STYLE } from './schema';
import { TEXT_ROLE_DEFAULTS } from './text/text-style';

export type NodeKind = 'input' | 'config' | 'layout' | 'executor' | 'output';

export interface PortDef {
  id: string;
  type: PortType;
  required: boolean;
  /** Cho phép nhiều edge vào cùng port (vd. nhiều text layer). */
  multiple: boolean;
}

export interface NodeDefinition<T extends NodeType = NodeType> {
  type: T;
  kind: NodeKind;
  label: string;
  /** Mô tả 1 dòng cho thư viện node và Inspector. */
  description: string;
  inputs: PortDef[];
  outputs: { id: string; type: PortType }[];
  defaultParams: NodeParamsMap[T];
  /** Số lần gọi model AI mỗi ratio. 0 = chạy client-side. */
  aiCallsPerRatio: number;
  /** Executor legacy được phép nhận 'product' (chỉ path flat migrate). */
  legacy?: boolean;
}

const inPort = (id: string, type: PortType, required = false, multiple = false): PortDef => ({
  id, type, required, multiple,
});
const out = (id: string, type: PortType) => ({ id, type });

/** Nhãn hiển thị theo kiểu port (port id = kiểu port trong registry hiện tại). */
export const PORT_TYPE_LABELS: Record<PortType, string> = {
  product: 'Asset giữ pixel',
  image: 'Ảnh tham chiếu',
  brief: 'Brief',
  text: 'Text',
  brand: 'Brand kit',
  ratio: 'Kích thước',
  style: 'Phong cách',
  layout: 'Layout',
  background: 'Nền',
  composition: 'Bản ghép',
  raster: 'Ảnh',
};

type Registry = { [K in NodeType]: NodeDefinition<K> };

export const NODE_DEFINITIONS: Registry = {
  'product-asset': {
    type: 'product-asset', kind: 'input', label: 'Asset (giữ pixel)',
    description: 'Ảnh sản phẩm, logo, trang trí – giữ nguyên pixel.',
    inputs: [], outputs: [out('product', 'product')],
    defaultParams: {
      assetId: '', url: '', fileName: '', role: 'image', hasAlpha: false,
      originalDims: { width: 0, height: 0 },
    },
    aiCallsPerRatio: 0,
  },
  'reference-image': {
    type: 'reference-image', kind: 'input', label: 'Ảnh tham chiếu',
    description: 'Ảnh tham chiếu style hoặc nền cho AI.',
    inputs: [], outputs: [out('image', 'image')],
    defaultParams: {
      assetId: '', url: '', fileName: '', role: 'style-reference', hasAlpha: false,
      originalDims: { width: 0, height: 0 },
    },
    aiCallsPerRatio: 0,
  },
  'brief': {
    type: 'brief', kind: 'input', label: 'Brief',
    description: 'Mô tả banner và mục tiêu chiến dịch.',
    inputs: [], outputs: [out('brief', 'brief')],
    defaultParams: { prompt: '', marketingBrief: { campaignIntents: [], focalSubjects: [] } },
    aiCallsPerRatio: 0,
  },
  'text-layer': {
    type: 'text-layer', kind: 'input', label: 'Text',
    description: 'Tiêu đề, tiêu đề phụ, CTA hoặc text khác.',
    inputs: [], outputs: [out('text', 'text')],
    defaultParams: {
      layerId: '', role: 'headline', content: '', renderSource: 'layer',
      priority: 1, minFontSizePx: TEXT_ROLE_DEFAULTS.headline.minFontSizePx,
      style: TEXT_ROLE_DEFAULTS.headline.style,
    },
    aiCallsPerRatio: 0,
  },
  'brand-kit': {
    type: 'brand-kit', kind: 'config', label: 'Brand kit',
    description: 'Màu, font, vị trí logo của thương hiệu.',
    inputs: [], outputs: [out('brand', 'brand')],
    defaultParams: { colors: [] }, aiCallsPerRatio: 0,
  },
  'ratio': {
    type: 'ratio', kind: 'config', label: 'Kích thước',
    description: 'Các kích thước banner cần xuất.',
    inputs: [], outputs: [out('ratio', 'ratio')],
    defaultParams: { ratios: [DEFAULT_RATIO] }, aiCallsPerRatio: 0,
  },
  'style': {
    type: 'style', kind: 'config', label: 'Phong cách',
    description: 'Phong cách, mood, bảng màu, kiểu chữ.',
    inputs: [], outputs: [out('style', 'style')],
    defaultParams: DEFAULT_STYLE, aiCallsPerRatio: 0,
  },
  'auto-layout': {
    type: 'auto-layout', kind: 'layout', label: 'Auto layout',
    description: 'Tự xếp sản phẩm và chữ theo từng kích thước.',
    inputs: [
      inPort('ratio', 'ratio', true),
      inPort('product', 'product', false, true),
      inPort('text', 'text', false, true),
    ],
    outputs: [out('layout', 'layout')],
    defaultParams: { overrides: {} }, aiCallsPerRatio: 0,
  },
  'generate-background': {
    type: 'generate-background', kind: 'executor', label: 'Tạo nền',
    description: 'AI tạo nền, chừa chỗ cho sản phẩm và chữ.',
    inputs: [
      inPort('layout', 'layout', true),
      inPort('brief', 'brief', true),
      inPort('style', 'style'),
      inPort('brand', 'brand'),
      inPort('image', 'image', false, true),
    ],
    outputs: [out('background', 'background')],
    defaultParams: { model: 'nano-banana-2', lightDirectionDeg: 315, strictNoText: true },
    aiCallsPerRatio: 1,
  },
  'generate-flat': {
    type: 'generate-flat', kind: 'executor', label: 'Tạo banner (flat)', legacy: true,
    description: 'AI tạo cả banner như form hiện tại.',
    inputs: [
      inPort('ratio', 'ratio', true),
      inPort('brief', 'brief', true),
      inPort('product', 'product', false, true),
      inPort('text', 'text', false, true),
      inPort('style', 'style'),
      inPort('brand', 'brand'),
      inPort('image', 'image', false, true),
    ],
    outputs: [out('raster', 'raster')],
    defaultParams: { model: 'nano-banana-2', strictPreserveMode: true },
    // Generate + harmony pass server luôn chạy ngay sau (app/api/generate/route.ts) – Q4.
    aiCallsPerRatio: 2,
  },
  'compose': {
    type: 'compose', kind: 'output', label: 'Ghép layer',
    description: 'Ghép nền, sản phẩm, chữ và bóng đổ.',
    inputs: [
      inPort('background', 'background', true),
      inPort('layout', 'layout', true),
      inPort('product', 'product', false, true),
      inPort('text', 'text', false, true),
    ],
    outputs: [out('composition', 'composition')],
    defaultParams: { shadow: DEFAULT_SHADOW }, aiCallsPerRatio: 0,
  },
  'export': {
    type: 'export', kind: 'output', label: 'Xuất ảnh',
    description: 'Định dạng, chất lượng, tải ảnh kết quả.',
    inputs: [inPort('composition', 'composition'), inPort('raster', 'raster')],
    outputs: [],
    defaultParams: { format: 'png', quality: 0.9, scale: 1, ratioIds: 'all' }, aiCallsPerRatio: 0,
  },
};

export function getDefinition(type: string): NodeDefinition | undefined {
  return (NODE_DEFINITIONS as Record<string, NodeDefinition>)[type];
}
