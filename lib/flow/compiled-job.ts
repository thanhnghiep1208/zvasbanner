import type {
  FlowStyle, ModelId, NodeParamsMap, RatioSpec, ShadowConfig, Transform,
} from './schema';
import type { BrandKit } from '@/lib/types';
import { NODE_DEFINITIONS } from './node-definitions';

/**
 * CompiledJob – IR trung gian giữa graph và pipeline hiện có.
 * Graph → CompiledJob (compiler.ts) → GenerationRequest (legacy/to-legacy-config.ts).
 */
export interface CompiledJob {
  schemaVersion: 1;
  renderMode: 'composed' | 'flat';
  ratios: RatioSpec[];
  brief: NodeParamsMap['brief'];
  style?: FlowStyle;
  brandKit?: BrandKit;
  references: NodeParamsMap['reference-image'][];
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
  };
  export: NodeParamsMap['export'];
}

/** Số lần gọi model AI = số ratio × aiCallsPerRatio của executor tương ứng. */
export function estimateAiCalls(job: CompiledJob): number {
  const executor = job.renderMode === 'composed' ? 'generate-background' : 'generate-flat';
  return job.ratios.length * NODE_DEFINITIONS[executor].aiCallsPerRatio;
}
