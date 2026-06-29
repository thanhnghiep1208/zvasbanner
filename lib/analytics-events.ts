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
    generation_context?: "editor" | "extra_size_download" | "extra_size_preview";
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
