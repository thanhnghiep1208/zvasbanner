import type { NodeParamsMap, NodeType, PortType } from './schema';
import { DEFAULT_RATIO, DEFAULT_SHADOW, DEFAULT_STYLE } from './schema';

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

type Registry = { [K in NodeType]: NodeDefinition<K> };

export const NODE_DEFINITIONS: Registry = {
  'product-asset': {
    type: 'product-asset', kind: 'input', label: 'Product asset',
    inputs: [], outputs: [out('product', 'product')],
    defaultParams: {
      assetId: '', url: '', fileName: '', role: 'image', hasAlpha: false,
      originalDims: { width: 0, height: 0 },
    },
    aiCallsPerRatio: 0,
  },
  'reference-image': {
    type: 'reference-image', kind: 'input', label: 'Reference image',
    inputs: [], outputs: [out('image', 'image')],
    defaultParams: {
      assetId: '', url: '', fileName: '', role: 'style-reference', hasAlpha: false,
      originalDims: { width: 0, height: 0 },
    },
    aiCallsPerRatio: 0,
  },
  'brief': {
    type: 'brief', kind: 'input', label: 'Brief',
    inputs: [], outputs: [out('brief', 'brief')],
    defaultParams: { prompt: '', marketingBrief: { campaignIntents: [], focalSubjects: [] } },
    aiCallsPerRatio: 0,
  },
  'text-layer': {
    type: 'text-layer', kind: 'input', label: 'Text layer',
    inputs: [], outputs: [out('text', 'text')],
    defaultParams: {
      layerId: '', role: 'headline', content: '', renderSource: 'layer',
      priority: 1, minFontSizePx: 14,
    },
    aiCallsPerRatio: 0,
  },
  'brand-kit': {
    type: 'brand-kit', kind: 'config', label: 'Brand kit',
    inputs: [], outputs: [out('brand', 'brand')],
    defaultParams: { colors: [] }, aiCallsPerRatio: 0,
  },
  'ratio': {
    type: 'ratio', kind: 'config', label: 'Ratio',
    inputs: [], outputs: [out('ratio', 'ratio')],
    defaultParams: { ratios: [DEFAULT_RATIO] }, aiCallsPerRatio: 0,
  },
  'style': {
    type: 'style', kind: 'config', label: 'Style',
    inputs: [], outputs: [out('style', 'style')],
    defaultParams: DEFAULT_STYLE, aiCallsPerRatio: 0,
  },
  'auto-layout': {
    type: 'auto-layout', kind: 'layout', label: 'Auto layout',
    inputs: [
      inPort('ratio', 'ratio', true),
      inPort('product', 'product', false, true),
      inPort('text', 'text', false, true),
    ],
    outputs: [out('layout', 'layout')],
    defaultParams: { overrides: {} }, aiCallsPerRatio: 0,
  },
  'generate-background': {
    type: 'generate-background', kind: 'executor', label: 'Generate background',
    inputs: [
      inPort('layout', 'layout', true),
      inPort('brief', 'brief', true),
      inPort('style', 'style'),
      inPort('brand', 'brand'),
      inPort('image', 'image', false, true),
    ],
    outputs: [out('background', 'background')],
    defaultParams: { model: 'nano-banana-pro', lightDirectionDeg: 315, strictNoText: true },
    aiCallsPerRatio: 1,
  },
  'generate-flat': {
    type: 'generate-flat', kind: 'executor', label: 'Generate (flat, legacy)', legacy: true,
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
    defaultParams: { model: 'nano-banana-pro', strictPreserveMode: true },
    aiCallsPerRatio: 1,
  },
  'harmony-pass': {
    type: 'harmony-pass', kind: 'executor', label: 'Harmony pass',
    inputs: [inPort('raster', 'raster', true)],
    outputs: [out('raster', 'raster')],
    defaultParams: {}, aiCallsPerRatio: 1,
  },
  'compose': {
    type: 'compose', kind: 'output', label: 'Compose',
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
    type: 'export', kind: 'output', label: 'Export',
    inputs: [inPort('composition', 'composition'), inPort('raster', 'raster')],
    outputs: [],
    defaultParams: { format: 'png', quality: 0.9, scale: 1, ratioIds: 'all' }, aiCallsPerRatio: 0,
  },
};

export function getDefinition(type: string): NodeDefinition | undefined {
  return (NODE_DEFINITIONS as Record<string, NodeDefinition>)[type];
}
