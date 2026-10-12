/**
 * Flow schema v1 – domain model thuần, KHÔNG phụ thuộc React Flow.
 * React Flow chỉ là lớp hiển thị; adapter sang RF node/edge ở bước 2.
 */
export const FLOW_SCHEMA_VERSION = 1 as const;

/* ── Port types ─────────────────────────────────────────────── */
export type PortType =
  | 'product'      // pixel gốc của sản phẩm – KHÔNG bao giờ đi vào executor AI (trừ legacy flat)
  | 'image'        // ảnh tham chiếu style/mood
  | 'brief'
  | 'text'         // text layer
  | 'brand'
  | 'ratio'
  | 'style'
  | 'layout'       // LayoutPlan: transform theo ratio + layout guide cho Gemini
  | 'background'   // background plate đã sinh, theo ratio
  | 'composition'  // ComposedDoc theo ratio
  | 'raster';      // ảnh flat (legacy)

/* ── Shared value types ─────────────────────────────────────── */
export type ModelId = 'gemini-pro' | 'gemini-flash';

export interface RatioSpec {
  id: string;        // '1:1', '9:16', 'fb-cover' …
  width: number;     // px
  height: number;    // px
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

export type TextRole = 'headline' | 'subline' | 'cta' | 'custom';

/* ── Params theo node type ──────────────────────────────────── */
export interface NodeParamsMap {
  'product-asset': { assetId: string; hasAlpha: boolean };
  'reference-image': { assetId: string };
  'brief': { prompt: string; chips: string[] };
  'text-layer': {
    layerId: string;
    role: TextRole;
    content: string;
    /** 'ai' chỉ hợp lệ với role = 'headline' */
    renderSource: 'layer' | 'ai';
    /** Số nhỏ = ưu tiên cao. Auto Layout giữ đủ mọi layer, priority chỉ quyết định thứ tự co giãn. */
    priority: number;
    minFontSizePx: number;
    /** Passthrough sang TextLayer model hiện có (typography/fill/stroke/shadow/plate). */
    typography?: Record<string, unknown>;
  };
  'brand-kit': { brandKitId: string };
  'ratio': { ratios: RatioSpec[] };
  'style': { presetId?: string; description?: string };
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
  'harmony-pass': Record<string, never>;
  'compose': { shadow: ShadowConfig };
  'export': { format: 'png' | 'jpg' | 'webp'; ratioIds: string[] | 'all' };
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
