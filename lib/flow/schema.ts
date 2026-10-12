/**
 * Flow schema v1 – domain model thuần, KHÔNG phụ thuộc React Flow.
 * React Flow chỉ là lớp hiển thị; adapter sang RF node/edge ở bước 2.
 *
 * Type nghiệp vụ dùng lại từ `lib/types.ts` (Q6), không định nghĩa lại.
 * Mapping với GenerationRequest: xem `lib/flow/legacy/README.md`.
 */
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
  | 'product'      // asset giữ nguyên pixel (sản phẩm, logo, trang trí) – KHÔNG bao giờ đi vào executor AI (trừ legacy flat)
  | 'image'        // ảnh gửi cho model làm tham chiếu (style-reference, nền ảnh)
  | 'brief'
  | 'text'         // text layer
  | 'brand'
  | 'ratio'
  | 'style'
  | 'layout'       // LayoutPlan: transform theo ratio + layout guide cho Gemini
  | 'background'   // background plate đã sinh, theo ratio
  | 'composition'  // ảnh đã compose theo ratio
  | 'raster';      // ảnh flat (legacy)

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

/** Toạ độ chuẩn hoá 0–1 theo canvas của từng ratio, neo tại tâm phần tử. */
export interface Transform {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotationDeg: number;
}

export interface ShadowConfig {
  mode: 'auto' | 'custom' | 'off';
  opacity: number;   // 0–1
  blurPx: number;
  offsetX: number;   // px tại 1080 base, scale theo ratio
  offsetY: number;
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
  Omit<UploadedAsset, 'id' | 'dataUrl' | 'role'> & { assetId: string; role: R };

/** StyleControls bỏ `strictPreserveMode` – đó là hành vi executor, nằm ở generate-flat. */
export type FlowStyle = Omit<StyleControls, 'strictPreserveMode'>;

/* ── Params theo node type ──────────────────────────────────── */
export interface NodeParamsMap {
  'product-asset': FlowAsset<PixelAssetRole>;
  'reference-image': FlowAsset<ReferenceAssetRole>;
  'brief': { prompt: string; marketingBrief: MarketingBrief };
  'text-layer': {
    layerId: string;
    role: TextRole;
    content: string;
    /** 'ai' chỉ hợp lệ với role = 'headline' */
    renderSource: 'layer' | 'ai';
    /** Số nhỏ = ưu tiên cao. Auto Layout giữ đủ mọi layer, priority chỉ quyết định thứ tự co giãn. */
    priority: number;
    minFontSizePx: number;
    /** Model text layer mới (Q2), xem lib/flow/text/text-style.ts. */
    style: TextStyle;
  };
  'brand-kit': BrandKit;
  'ratio': { ratios: RatioSpec[] };
  'style': FlowStyle;
  'auto-layout': {
    /** overrides[ratioId][elementId] – elementId = assetId (product) | layerId (text). */
    overrides: Record<string, Record<string, Transform>>;
  };
  'generate-background': {
    model: ModelId;
    /** Hướng sáng chỉ định trong prompt; Compose dùng lại để đặt auto shadow. 315 = trên-trái. */
    lightDirectionDeg: number;
    strictNoText: boolean;
  };
  'generate-flat': { model: ModelId; strictPreserveMode: boolean };
  'compose': { shadow: ShadowConfig };
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

export const DEFAULT_SHADOW: ShadowConfig = {
  mode: 'auto',
  opacity: 0.35,
  blurPx: 24,
  offsetX: 0,
  offsetY: 8,
};

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
