import { NextResponse } from "next/server";
import { ensureAnalyticsSchemaReady, getDbPool } from "@/lib/db";

type DashboardRange = "today" | "7d" | "30d";

type DashboardRow = {
  total_generated: string | number | null;
  total_exported: string | number | null;
  total_previewed: string | number | null;
  export_rate: string | number | null;
  avg_generation_time: string | number | null;
  total_cost: string | number | null;
  current_period_cost: string | number | null;
  previous_period_cost: string | number | null;
  avg_tokens_per_request: string | number | null;
  avg_input_tokens: string | number | null;
  avg_output_tokens: string | number | null;
  total_tokens_month: string | number | null;
  cost_per_gen_user: string | number | null;
  cost_per_success_image: string | number | null;
  cost_per_export_image: string | number | null;
};

type PgLikeError = {
  code?: string;
  message?: string;
};

function toNumber(value: string | number | null): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseRange(input: string | null): DashboardRange {
  if (input === "today" || input === "7d" || input === "30d") {
    return input;
  }
  return "7d";
}

function resolveStartMs(range: DashboardRange, nowMs: number): number {
  const now = new Date(nowMs);

  if (range === "today") {
    // Use UTC midnight to avoid server local-time drift.
    return Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    );
  }

  const days = range === "30d" ? 30 : 7;
  return nowMs - days * 24 * 60 * 60 * 1000;
}

function resolveMonthStartMs(nowMs: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

function isMissingColumnError(error: unknown): boolean {
  const pgErr = error as PgLikeError;
  return pgErr?.code === "42703";
}

function toDashboardJson(row?: DashboardRow) {
  if (!row) {
    return {
      total_generated: 0,
      total_previewed: 0,
      total_exported: 0,
      export_rate: 0,
      avg_generation_time: 0,
      total_cost: 0,
      current_period_cost: 0,
      previous_period_cost: 0,
      avg_tokens_per_request: 0,
      avg_input_tokens: 0,
      avg_output_tokens: 0,
      total_tokens_month: 0,
      cost_per_gen_user: 0,
      cost_per_success_image: 0,
      cost_per_export_image: 0,
    };
  }

  return {
    total_generated: Math.round(toNumber(row.total_generated)),
    total_previewed: Math.round(toNumber(row.total_previewed)),
    total_exported: Math.round(toNumber(row.total_exported)),
    export_rate: toNumber(row.export_rate),
    avg_generation_time: toNumber(row.avg_generation_time),
    total_cost: toNumber(row.total_cost),
    current_period_cost: toNumber(row.current_period_cost),
    previous_period_cost: toNumber(row.previous_period_cost),
    avg_tokens_per_request: toNumber(row.avg_tokens_per_request),
    avg_input_tokens: toNumber(row.avg_input_tokens),
    avg_output_tokens: toNumber(row.avg_output_tokens),
    total_tokens_month: Math.round(toNumber(row.total_tokens_month)),
    cost_per_gen_user: toNumber(row.cost_per_gen_user),
    cost_per_success_image: toNumber(row.cost_per_success_image),
    cost_per_export_image: toNumber(row.cost_per_export_image),
  };
}

export async function GET(req: Request) {
  try {
    try {
      await ensureAnalyticsSchemaReady();
    } catch (error) {
      // Production-safe fallback: query can still run on legacy schema.
      console.warn("[dashboard] schema auto-migration skipped", error);
    }
    const pool = getDbPool();
    const range = parseRange(new URL(req.url).searchParams.get("range"));
    const nowMs = Date.now();
    const startMs = resolveStartMs(range, nowMs);
    const monthStartMs = resolveMonthStartMs(nowMs);

    let rows: DashboardRow[] = [];
    try {
      const result = await pool.query<DashboardRow>(
        `
      WITH bounds AS (
        SELECT
          $1::bigint AS now_ms,
          $2::bigint AS start_ms,
          $3::bigint AS month_start_ms,
          (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000)::bigint AS current_start_ms,
          (EXTRACT(EPOCH FROM NOW() - INTERVAL '48 hours') * 1000)::bigint AS previous_start_ms
      )
      SELECT
        COUNT(*) FILTER (WHERE be.event_name = 'generate_banner') AS total_generated,
        COUNT(*) FILTER (WHERE be.event_name = 'preview_banner') AS total_previewed,
        COUNT(*) FILTER (WHERE be.event_name = 'export_banner') AS total_exported,
        CASE
          WHEN COUNT(*) FILTER (WHERE be.event_name = 'generate_banner') = 0 THEN 0
          ELSE
            (COUNT(*) FILTER (WHERE be.event_name = 'export_banner'))::numeric
            / (COUNT(*) FILTER (WHERE be.event_name = 'generate_banner'))::numeric
        END AS export_rate,
        COALESCE(AVG(be.generation_time_ms), 0) AS avg_generation_time,
        COALESCE(SUM(be.cost_usd), 0) AS total_cost,
        COALESCE(
          SUM(be.cost_usd) FILTER (
            WHERE be.timestamp >= b.current_start_ms
              AND be.timestamp < b.now_ms
          ),
          0
        ) AS current_period_cost,
        COALESCE(
          SUM(be.cost_usd) FILTER (
            WHERE be.timestamp >= b.previous_start_ms
              AND be.timestamp < b.current_start_ms
          ),
          0
        ) AS previous_period_cost,
        COALESCE(
          AVG(be.total_tokens) FILTER (WHERE be.event_name = 'generate_banner'),
          0
        ) AS avg_tokens_per_request,
        COALESCE(
          AVG(be.prompt_tokens) FILTER (WHERE be.event_name = 'generate_banner'),
          0
        ) AS avg_input_tokens,
        COALESCE(
          AVG(be.output_tokens) FILTER (WHERE be.event_name = 'generate_banner'),
          0
        ) AS avg_output_tokens,
        COALESCE(
          SUM(be.total_tokens) FILTER (WHERE be.timestamp >= b.month_start_ms),
          0
        ) AS total_tokens_month,
        CASE
          WHEN COUNT(DISTINCT be.user_id) FILTER (WHERE be.event_name = 'generate_banner') = 0 THEN 0
          ELSE
            COALESCE(SUM(be.cost_usd), 0)::numeric
            / COUNT(DISTINCT be.user_id) FILTER (WHERE be.event_name = 'generate_banner')::numeric
        END AS cost_per_gen_user,
        CASE
          WHEN COUNT(*) FILTER (
            WHERE be.event_name = 'generate_banner'
              AND be.generation_success = true
          ) = 0 THEN 0
          ELSE
            COALESCE(SUM(be.cost_usd), 0)::numeric
            / COUNT(*) FILTER (
              WHERE be.event_name = 'generate_banner'
                AND be.generation_success = true
            )::numeric
        END AS cost_per_success_image,
        CASE
          WHEN COUNT(*) FILTER (WHERE be.event_name = 'export_banner') = 0 THEN 0
          ELSE
            COALESCE(SUM(be.cost_usd), 0)::numeric
            / COUNT(*) FILTER (WHERE be.event_name = 'export_banner')::numeric
        END AS cost_per_export_image
      FROM banner_events be
      CROSS JOIN bounds b
      WHERE be.timestamp >= b.start_ms
    `,
        [nowMs, startMs, monthStartMs]
      );
      rows = result.rows;
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      const legacyResult = await pool.query<DashboardRow>(
        `
      WITH bounds AS (
        SELECT
          $1::bigint AS now_ms,
          $2::bigint AS start_ms,
          (EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000)::bigint AS current_start_ms,
          (EXTRACT(EPOCH FROM NOW() - INTERVAL '48 hours') * 1000)::bigint AS previous_start_ms
      )
      SELECT
        COUNT(*) FILTER (WHERE be.event_name = 'generate_banner') AS total_generated,
        COUNT(*) FILTER (WHERE be.event_name = 'preview_banner') AS total_previewed,
        COUNT(*) FILTER (WHERE be.event_name = 'export_banner') AS total_exported,
        CASE
          WHEN COUNT(*) FILTER (WHERE be.event_name = 'generate_banner') = 0 THEN 0
          ELSE
            (COUNT(*) FILTER (WHERE be.event_name = 'export_banner'))::numeric
            / (COUNT(*) FILTER (WHERE be.event_name = 'generate_banner'))::numeric
        END AS export_rate,
        COALESCE(AVG(be.generation_time_ms), 0) AS avg_generation_time,
        COALESCE(SUM(be.cost_usd), 0) AS total_cost,
        COALESCE(
          SUM(be.cost_usd) FILTER (
            WHERE be.timestamp >= b.current_start_ms
              AND be.timestamp < b.now_ms
          ),
          0
        ) AS current_period_cost,
        COALESCE(
          SUM(be.cost_usd) FILTER (
            WHERE be.timestamp >= b.previous_start_ms
              AND be.timestamp < b.current_start_ms
          ),
          0
        ) AS previous_period_cost,
        0::numeric AS avg_tokens_per_request,
        0::numeric AS avg_input_tokens,
        0::numeric AS avg_output_tokens,
        0::numeric AS total_tokens_month,
        CASE
          WHEN COUNT(DISTINCT be.user_id) FILTER (WHERE be.event_name = 'generate_banner') = 0 THEN 0
          ELSE
            COALESCE(SUM(be.cost_usd), 0)::numeric
            / COUNT(DISTINCT be.user_id) FILTER (WHERE be.event_name = 'generate_banner')::numeric
        END AS cost_per_gen_user,
        CASE
          WHEN COUNT(*) FILTER (WHERE be.event_name = 'generate_banner') = 0 THEN 0
          ELSE
            COALESCE(SUM(be.cost_usd), 0)::numeric
            / COUNT(*) FILTER (WHERE be.event_name = 'generate_banner')::numeric
        END AS cost_per_success_image,
        CASE
          WHEN COUNT(*) FILTER (WHERE be.event_name = 'export_banner') = 0 THEN 0
          ELSE
            COALESCE(SUM(be.cost_usd), 0)::numeric
            / COUNT(*) FILTER (WHERE be.event_name = 'export_banner')::numeric
        END AS cost_per_export_image
      FROM banner_events be
      CROSS JOIN bounds b
      WHERE be.timestamp >= b.start_ms
    `,
        [nowMs, startMs]
      );
      rows = legacyResult.rows;
    }

    return NextResponse.json(toDashboardJson(rows[0]), { status: 200 });
  } catch (error) {
    console.error("[dashboard] aggregate query failed", error);
    return NextResponse.json(
      { error: "Failed to aggregate dashboard metrics" },
      { status: 500 }
    );
  }
}
