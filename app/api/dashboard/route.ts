import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

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

export async function GET(req: Request) {
  try {
    const pool = getDbPool();
    const range = parseRange(new URL(req.url).searchParams.get("range"));
    const nowMs = Date.now();
    const startMs = resolveStartMs(range, nowMs);

    const { rows } = await pool.query<DashboardRow>(
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
        ) AS previous_period_cost
      FROM banner_events be
      CROSS JOIN bounds b
      WHERE be.timestamp >= b.start_ms
    `,
      [nowMs, startMs]
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        {
          total_generated: 0,
          total_previewed: 0,
          total_exported: 0,
          export_rate: 0,
          avg_generation_time: 0,
          total_cost: 0,
          current_period_cost: 0,
          previous_period_cost: 0,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      total_generated: Math.round(toNumber(row.total_generated)),
      total_previewed: Math.round(toNumber(row.total_previewed)),
      total_exported: Math.round(toNumber(row.total_exported)),
      export_rate: toNumber(row.export_rate),
      avg_generation_time: toNumber(row.avg_generation_time),
      total_cost: toNumber(row.total_cost),
      current_period_cost: toNumber(row.current_period_cost),
      previous_period_cost: toNumber(row.previous_period_cost),
    });
  } catch (error) {
    console.error("[dashboard] aggregate query failed", error);
    return NextResponse.json(
      { error: "Failed to aggregate dashboard metrics" },
      { status: 500 }
    );
  }
}
