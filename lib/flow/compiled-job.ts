import type {
  ModelId, NodeParamsMap, RatioSpec, ShadowConfig, Transform,
} from './schema';

/**
 * CompiledJob – IR trung gian giữa graph và pipeline hiện có.
 * Graph → CompiledJob (compiler.ts) → canvasConfig (to-legacy-config.ts, viết khi có type thật).
 */
export interface CompiledJob {
  schemaVersion: 1;
  renderMode: 'composed' | 'flat';
  ratios: RatioSpec[];
  brief: NodeParamsMap['brief'];
  style?: NodeParamsMap['style'];
  brandKitId?: string;
  referenceAssetIds: string[];
  model: ModelId;
  products: NodeParamsMap['product-asset'][];
  textLayers: NodeParamsMap['text-layer'][];
  composed?: {
    lightDirectionDeg: number;
    strictNoText: boolean;
    layoutOverrides: Record<string, Record<string, Transform>>;
    shadow: ShadowConfig;
  };
  flat?: {
    strictPreserveMode: boolean;
    harmonyPass: boolean;
  };
  export: NodeParamsMap['export'];
}

export function estimateAiCalls(job: CompiledJob): number {
  const n = job.ratios.length;
  if (job.renderMode === 'composed') return n;
  return n * (job.flat?.harmonyPass ? 2 : 1);
}
