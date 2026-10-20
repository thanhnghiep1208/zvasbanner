export type AnalyticsEventName =
  | "select_canvas"
  | "upload_asset"
  | "input_content"
  | "select_style"
  | "generate_banner"
  | "regenerate_banner"
  | "preview_banner"
  | "export_banner"
  | "open_canva"
  | "open_canva_success"
  | "open_canva_error";

export type AnalyticsBasePayload = {
  banner_id: string;
  user_id: string;
  timestamp?: number;
};

export type AnalyticsEventPayloadMap = {
  select_canvas: AnalyticsBasePayload & {
    canvas_preset_id: string;
    width: number;
    height: number;
  };
  upload_asset: AnalyticsBasePayload & {
    asset_role: "logo" | "image" | "background" | "decoration" | "style-reference";
    file_type: string;
    file_size_kb: number;
  };
  input_content: AnalyticsBasePayload & {
    field: "prompt" | "headline" | "subheadline" | "cta";
    length: number;
  };
  select_style: AnalyticsBasePayload & {
    style: string;
    mood: string;
    font_style: string;
    strict_preserve_mode: boolean;
  };
  generate_banner: AnalyticsBasePayload & {
    source: "gemini" | "placeholder";
    success: boolean;
    /** Router preset slug, e.g. `nano-banana-pro` / `nano-banana-2` (matches `ImageGenerationModel`). */
    image_model?: string;
    has_asset?: boolean;
    generation_time_ms?: number;
    regenerate_count?: number;
    cost_usd?: number;
    prompt_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    /** `extra_size_preview` = layout-adapt variants shown under canvas before download. */
    /** `flow_flat` / `flow_background` = Flow canvas (flat qua /api/generate, composed qua /api/flow/generate-background). */
    generation_context?: "editor" | "extra_size_download" | "extra_size_preview" | "flow_flat" | "flow_background";
    target_preset_id?: string;
    target_width?: number;
    target_height?: number;
  };
  regenerate_banner: AnalyticsBasePayload & {
    reason?: string;
  };
  preview_banner: AnalyticsBasePayload & {
    view: "canvas" | "full";
  };
  export_banner: AnalyticsBasePayload & {
    format: "png" | "jpg";
    scale: 1 | 2;
    quality?: number;
    /** Pixel dimensions of the exported file (may differ from editor canvas). */
    export_width?: number;
    export_height?: number;
    /** Preset id when export used a catalog size; `custom` when editor canvas is custom. */
    export_preset_id?: string;
    /** How the export was triggered from the UI. */
    export_variant?: "current_canvas" | "download_ai_extra";
  };
  open_canva: AnalyticsBasePayload;
  open_canva_success: AnalyticsBasePayload;
  open_canva_error: AnalyticsBasePayload;
};

/* ── Flow canvas (T6.3, SPEC 5.9, Q12) ──────────────────────────
 * Ghi qua POST /api/flow/track vào bảng flow_events (props JSONB) – không qua /api/track + banner_events
 * (cột cố định, allowlist 8 event cũ).
 */

export type FlowAnalyticsEventName =
  | "flow_opened"
  | "flow_run_started"
  | "flow_run_completed"
  | "flow_run_failed"
  | "flow_view_switched"
  | "flow_template_used";

/** "mixed" = Xuất ảnh nối cả Ghép layer và Tạo banner (flat). */
export type FlowRenderMode = "composed" | "flat" | "mixed";

/** Field chung: phiên mở trang /flow, project đang mở (nếu đã lưu), template của graph. */
export type FlowAnalyticsBase = {
  session_id: string;
  doc_id?: string | null;
  template_id?: string | null;
  timestamp?: number;
};

export type FlowAnalyticsPropsMap = {
  flow_opened: { source: "direct" | "template_url" | "doc" | "form" };
  flow_run_started: { ai_calls: number; reusable: number; render_mode: FlowRenderMode; ratio_count: number; from_node: boolean };
  flow_run_completed: { duration_ms: number; render_mode: FlowRenderMode; image_count: number; reused: number };
  flow_run_failed: { code: string; duration_ms: number; render_mode: FlowRenderMode | null };
  flow_view_switched: { view: "simple" | "canvas" };
  flow_template_used: { source: "default" | "url" | "picker" | "empty_canvas" };
};

export type FlowAnalyticsPayload<E extends FlowAnalyticsEventName> = FlowAnalyticsBase &
  FlowAnalyticsPropsMap[E] & { event: E };
