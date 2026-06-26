/** Time window for dashboard APIs and UI (must stay in sync across routes). */
export type DashboardRange = "today" | "7d" | "30d";

export type DashboardData = {
  total_generated: number;
  total_previewed: number;
  total_exported: number;
  export_rate: number;
  avg_generation_time: number;
  total_cost: number;
  current_period_cost: number;
  previous_period_cost: number;
  avg_tokens_per_request: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  total_tokens_month: number;
  cost_per_gen_user: number;
  cost_per_success_image: number;
  cost_per_export_image: number;
  /** Counts of `generate_banner` keyed by `image_model` slug or `unknown`. */
  generations_by_model: Record<string, number>;
};

export const DASHBOARD_RANGE_STORAGE_KEY = "dashboard:range";

/** Auto-refresh interval for aggregate metrics (client polling). Keep conservative to reduce DB load. */
export const DASHBOARD_AGGREGATE_POLL_MS = 4 * 60 * 60 * 1000;

/** Server-side TTL for `/api/dashboard` aggregate JSON (per range). */
export const DASHBOARD_AGGREGATE_CACHE_MS = 30 * 60 * 1000;

/** In-memory TTL for Clerk role/block lookups in `getUserAccessByUserId`.
 *  Kept at 60s so a block/role change propagates within one minute on each warm instance.
 *  For instant cross-instance invalidation, replace the Map cache with Redis/KV. */
export const USER_ACCESS_CACHE_MS = 60 * 1000;

export const DASHBOARD_USERS_PAGE_SIZE = 15;

export type DashboardUserRow = {
  user_id: string;
  user_name: string;
  email: string;
  role: "admin" | "mod" | "editor";
  blocked: boolean;
  total_generate: number;
  total_export: number;
};

export type DashboardUsersPagination = {
  page: number;
  pageSize: number;
  totalUsers: number;
  totalPages: number;
};

export type DashboardUsersPageResult = {
  users: DashboardUserRow[];
  pagination: DashboardUsersPagination;
};

export const EMPTY_DASHBOARD_DATA: DashboardData = {
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
  generations_by_model: {},
};

export function formatDashboardNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDashboardDecimal(n: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDashboardPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function formatDashboardUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function dashboardRangeLabel(range: DashboardRange): string {
  if (range === "today") return "Showing today";
  if (range === "30d") return "Showing last 30 days";
  return "Showing last 7 days";
}

/** Human label for stored `image_model` router slug (dashboard + tables). */
export function labelImageModelSlug(slug: string): string {
  if (slug === "nano-banana-pro") return "Nano Banana Pro";
  if (slug === "nano-banana-2") return "Nano Banana 2";
  if (slug === "unknown") return "Chưa ghi nhận model";
  return slug;
}

/** Shared by `/api/dashboard` and `/api/dashboard/users` — keep window logic identical. */
export function parseDashboardRange(input: string | null): DashboardRange {
  if (input === "today" || input === "7d" || input === "30d") {
    return input;
  }
  return "7d";
}

/** Start of analytics window in epoch ms (UTC midnight for "today"). */
export function resolveDashboardRangeStartMs(
  range: DashboardRange,
  nowMs: number
): number {
  const now = new Date(nowMs);

  if (range === "today") {
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

export function buildCostComparisonText(data: DashboardData): string | null {
  const prev = data.previous_period_cost;
  const curr = data.current_period_cost;
  if (prev <= 0) return null;
  const ratio = curr / prev;
  const deltaPct = Math.abs((ratio - 1) * 100);
  const arrow = ratio >= 1 ? "↑" : "↓";
  return `${arrow} ${deltaPct.toFixed(1)}% vs previous period`;
}

export function buildDashboardAlerts(data: DashboardData): string[] {
  const alerts: string[] = [];

  if (data.export_rate < 0.4) {
    alerts.push(
      `Export rate đang thấp (${formatDashboardPercent(data.export_rate)}), dưới ngưỡng 40%.`
    );
  }

  const prev = data.previous_period_cost;
  const curr = data.current_period_cost;
  if (prev > 0) {
    const ratio = curr / prev;
    if (ratio >= 1.5) {
      alerts.push(
        `Chi phí 24h hiện tại tăng mạnh (${formatDashboardUsd(curr)} vs ${formatDashboardUsd(
          prev
        )}, +${((ratio - 1) * 100).toFixed(1)}%).`
      );
    }
  }

  return alerts;
}
