/**
 * Flow schema v1 – domain model thuần, KHÔNG phụ thuộc React Flow.
 * React Flow chỉ là lớp hiển thị; adapter sang RF node/edge ở bước 2.
 *
 * Type nghiệp vụ dùng lại từ `lib/types.ts` (Q6), không định nghĩa lại.
 * Mapping với GenerationRequest: xem `lib/flow/legacy/README.md`.
 */
import type { CampaignBrief } from './brief';
import type {
  AssetRole,
  BrandKit,
  CanvasConfig,
  ImageGenerationModel,
  MarketingBrief,
  StyleControls,
  UploadedAsset,
} from '@/lib/types';

import type { TextStyle } from './text/text-style';

export const FLOW_SCHEMA_VERSION = 1 as const;

/* ── Port types ─────────────────────────────────────────────── */
export type PortType =
  | 'product'      // asset sản phẩm, logo, trang trí – Tạo banner giữ nguyên chủ thể (strictPreserveMode)
  | 'image'        // ảnh gửi cho model làm tham chiếu (style-reference, nền ảnh)
  | 'brief'
  | 'text'         // text layer
  | 'brand'
  | 'ratio'
  | 'style'
  | 'raster';      // banner AI tạo (flat)

/* ── Shared value types ─────────────────────────────────────── */
export type ModelId = ImageGenerationModel;

/**
 * Một kích thước output. = CanvasConfig + id ổn định.
 * id = preset id trong `lib/canvas-presets.ts` (vd. 'social-zalo-oa-img'),
 * hoặc `custom-<w>x<h>` cho kích thước tự nhập.
 */
export interface RatioSpec extends CanvasConfig {
  id: string;
}

/** Tên role theo field của form (`headline`, `subheadline`, `ctaText` trong store/editor.ts). */
export type TextRole = 'headline' | 'subheadline' | 'cta' | 'custom';

/** Role asset giữ nguyên pixel → node product-asset (port 'product'). */
export type PixelAssetRole = Extract<AssetRole, 'image' | 'logo' | 'decoration'>;
/** Role asset gửi cho model làm tham chiếu → node reference-image (port 'image'). */
export type ReferenceAssetRole = Extract<AssetRole, 'style-reference' | 'background'>;

/**
 * Asset lưu trong graph = UploadedAsset bỏ `dataUrl` (chỉ có lúc chạy, không persist).
 * `id` đổi tên thành `assetId` để không lẫn với id node.
 */
export type FlowAsset<R extends AssetRole = AssetRole> =
  Omit<UploadedAsset, 'id' | 'dataUrl' | 'role'> & {
    assetId: string;
    role: R;
    /** Màu chủ đạo (hex) từng đo cho Ghép layer (đã gỡ). Không còn dùng; giữ để đọc project cũ. */
    dominantColors?: string[];
  };

/** StyleControls bỏ `strictPreserveMode` – đó là hành vi executor, nằm ở generate-flat. */
export type FlowStyle = Omit<StyleControls, 'strictPreserveMode'>;

/* ── Params theo node type ──────────────────────────────────── */
export interface NodeParamsMap {
  'product-asset': FlowAsset<PixelAssetRole>;
  'reference-image': FlowAsset<ReferenceAssetRole>;
  /** `campaign` (brief marketing, lib/flow/brief.ts) tuỳ chọn – project cũ không có. */
  'brief': { prompt: string; marketingBrief: MarketingBrief; campaign?: CampaignBrief };
  'text-layer': {
    layerId: string;
    role: TextRole;
    content: string;
    /*
     * Các field dưới đây từ chế độ Ghép layer (đã gỡ 2026-10-20). Flat để AI vẽ mọi chữ nên không dùng; giữ để project
     * và template cũ vẫn đọc được.
     */
    renderSource: 'layer' | 'ai';
    /** Số nhỏ = ưu tiên cao: thứ tự text trong graph. */
    priority: number;
    minFontSizePx: number;
    style: TextStyle;
    autoStyle?: boolean;
  };
  'brand-kit': BrandKit;
  'ratio': { ratios: RatioSpec[] };
  'style': FlowStyle;
  'generate-flat': { model: ModelId; strictPreserveMode: boolean };
  /** Theo `exportBanner()` trong lib/export.ts. `quality` chỉ áp dụng cho jpg. */
  'export': { format: 'png' | 'jpg'; quality: number; scale: 1 | 2; ratioIds: string[] | 'all' };
}

export type NodeType = keyof NodeParamsMap;

export interface FlowNode<T extends NodeType = NodeType> {
  id: string;
  type: T;
  params: NodeParamsMap[T];
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

/** Id edge xác định từ 2 đầu nối: cùng cặp port → cùng id (dùng để phát hiện trùng, diff ổn định). */
export function makeEdgeId(source: string, sourcePort: string, target: string, targetPort: string): string {
  return `e-${source}.${sourcePort}-${target}.${targetPort}`;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Giống defaultStyleControls trong store/editor.ts (bỏ strictPreserveMode). */
export const DEFAULT_STYLE: FlowStyle = {
  style: 'minimalist',
  mood: 'professional',
  colorPalette: 'auto',
  fontStyle: 'modern',
  backgroundConfig: { tones: [], grains: [], shapes: [], effects: [] },
};

/** Giống canvas mặc định của form (preset 'social-zalo-oa-img'). */
export const DEFAULT_RATIO: RatioSpec = {
  id: 'social-zalo-oa-img',
  width: 1075,
  height: 645,
  platform: 'Zalo',
  name: 'Zalo OA Img',
};
