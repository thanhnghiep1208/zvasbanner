import type { FlowStyle, ModelId, NodeParamsMap, RatioSpec } from './schema';
import type { BrandKit } from '@/lib/types';
import { NODE_DEFINITIONS } from './node-definitions';

/**
 * CompiledJob – IR trung gian giữa graph và pipeline hiện có.
 * Graph → CompiledJob (compiler.ts) → GenerationRequest (legacy/to-legacy-config.ts).
 */
export interface CompiledJob {
  schemaVersion: 1;
  /** Chỉ còn flat: AI tạo cả banner (chế độ Ghép layer đã gỡ 2026-10-20). */
  renderMode: 'flat';
  ratios: RatioSpec[];
  brief: NodeParamsMap['brief'];
  style?: FlowStyle;
  brandKit?: BrandKit;
  references: NodeParamsMap['reference-image'][];
  model: ModelId;
  products: NodeParamsMap['product-asset'][];
  textLayers: NodeParamsMap['text-layer'][];
  flat: {
    strictPreserveMode: boolean;
  };
  export: NodeParamsMap['export'];
}

/**
 * Kích thước thực sự cần sinh (T4.6): `export.ratioIds` ('all' hoặc tập con), giữ thứ tự của node Kích thước.
 * Chỉ sinh ảnh cho kích thước được xuất → không tốn lượt AI cho kích thước bỏ chọn.
 */
export function exportedRatios(job: CompiledJob): RatioSpec[] {
  const ids = job.export.ratioIds;
  return ids === 'all' ? job.ratios : job.ratios.filter((r) => ids.includes(r.id));
}

/** Số lần gọi model AI = số kích thước được xuất × aiCallsPerRatio của Tạo banner. */
export function estimateAiCalls(job: CompiledJob): number {
  return exportedRatios(job).length * NODE_DEFINITIONS['generate-flat'].aiCallsPerRatio;
}
