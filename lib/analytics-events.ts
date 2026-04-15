export type AnalyticsEventName =
  | "select_canvas"
  | "upload_asset"
  | "input_content"
  | "select_style"
  | "generate_banner"
  | "regenerate_banner"
  | "preview_banner"
  | "export_banner";

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
    has_asset?: boolean;
    generation_time_ms?: number;
    regenerate_count?: number;
    cost_usd?: number;
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
  };
};
