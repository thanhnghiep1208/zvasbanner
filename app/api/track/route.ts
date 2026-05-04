import { NextResponse } from "next/server";
import type { AnalyticsEventName } from "@/lib/analytics-events";
import { ensureAnalyticsSchemaReady, getDbPool } from "@/lib/db";
import { requireUserJson } from "@/lib/require-user";

type TrackRequestBody = {
  event: AnalyticsEventName;
  banner_id: string;
  timestamp: number;
  [key: string]: unknown;
};

type BannerEventInsert = {
  event_name: AnalyticsEventName;
  user_id: string;
  banner_id: string;
  timestamp: number;
  style: string | null;
  canvas_size: string | null;
  has_asset: boolean | null;
  generation_time_ms: number | null;
  regenerate_count: number | null;
  exported: boolean | null;
  cost_usd: number | null;
  generation_success: boolean | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
};

type PgLikeError = {
  code?: string;
};

const ANALYTICS_EVENTS: AnalyticsEventName[] = [
  "select_canvas",
  "upload_asset",
  "input_content",
  "select_style",
  "generate_banner",
  "regenerate_banner",
  "preview_banner",
  "export_banner",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseTrackBody(v: unknown): TrackRequestBody | null {
  if (!isRecord(v)) return null;

  const { event, banner_id, timestamp } = v;
  if (
    typeof event !== "string" ||
    !ANALYTICS_EVENTS.includes(event as AnalyticsEventName) ||
    typeof banner_id !== "string" ||
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }
  const typedEvent = event as AnalyticsEventName;

  return {
    event: typedEvent,
    banner_id,
    timestamp,
    ...v,
  };
}

function toOptionalString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function toOptionalBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function toOptionalNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mapToInsertRow(body: TrackRequestBody, userId: string): BannerEventInsert {
  return {
    event_name: body.event,
    user_id: userId,
    banner_id: body.banner_id,
    timestamp: body.timestamp,
    style: toOptionalString(body.style),
    canvas_size: toOptionalString(body.canvas_size),
    has_asset: toOptionalBoolean(body.has_asset),
    generation_time_ms: toOptionalNumber(body.generation_time_ms),
    regenerate_count: toOptionalNumber(body.regenerate_count),
    exported: toOptionalBoolean(body.exported),
    cost_usd: toOptionalNumber(body.cost_usd),
    generation_success: toOptionalBoolean(body.success),
    prompt_tokens: toOptionalNumber(body.prompt_tokens),
    output_tokens: toOptionalNumber(body.output_tokens),
    total_tokens: toOptionalNumber(body.total_tokens),
  };
}

export async function POST(req: Request) {
  const session = await requireUserJson({
    error: "Cần đăng nhập để ghi nhận hoạt động.",
  });
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseTrackBody(body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Invalid track payload. Required: event, banner_id, timestamp.",
      },
      { status: 400 }
    );
  }

  try {
    try {
      await ensureAnalyticsSchemaReady();
    } catch (error) {
      // Legacy/locked-down DBs may not allow ALTER TABLE.
      console.warn("[analytics.track] schema auto-migration skipped", error);
    }
    const row = mapToInsertRow(parsed, userId);
    const pool = getDbPool();
    try {
      await pool.query(
      `
        INSERT INTO banner_events (
          event_name,
          user_id,
          banner_id,
          timestamp,
          style,
          canvas_size,
          has_asset,
          generation_time_ms,
          regenerate_count,
          exported,
          cost_usd,
          generation_success,
          prompt_tokens,
          output_tokens,
          total_tokens
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        row.event_name,
        row.user_id,
        row.banner_id,
        row.timestamp,
        row.style,
        row.canvas_size,
        row.has_asset,
        row.generation_time_ms,
        row.regenerate_count,
        row.exported,
        row.cost_usd,
        row.generation_success,
        row.prompt_tokens,
        row.output_tokens,
        row.total_tokens,
      ]
    );
    } catch (error) {
      const pgError = error as PgLikeError;
      if (pgError?.code !== "42703") {
        throw error;
      }
      await pool.query(
        `
        INSERT INTO banner_events (
          event_name,
          user_id,
          banner_id,
          timestamp,
          style,
          canvas_size,
          has_asset,
          generation_time_ms,
          regenerate_count,
          exported,
          cost_usd
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
        [
          row.event_name,
          row.user_id,
          row.banner_id,
          row.timestamp,
          row.style,
          row.canvas_size,
          row.has_asset,
          row.generation_time_ms,
          row.regenerate_count,
          row.exported,
          row.cost_usd,
        ]
      );
    }
  } catch (error) {
    console.error("[analytics.track] insert failed", error);
    return NextResponse.json(
      { error: "Failed to persist analytics event" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
