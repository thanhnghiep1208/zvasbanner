"use client";

import * as React from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TimeRangeFilter,
  type DashboardRange,
} from "@/components/dashboard/TimeRangeFilter";
import { UserAnalyticsTable } from "@/components/dashboard/UserAnalyticsTable";

type DashboardData = {
  total_generated: number;
  total_previewed: number;
  total_exported: number;
  export_rate: number;
  avg_generation_time: number;
  total_cost: number;
  current_period_cost: number;
  previous_period_cost: number;
};

const RANGE_STORAGE_KEY = "dashboard:range";

const EMPTY_DATA: DashboardData = {
  total_generated: 0,
  total_previewed: 0,
  total_exported: 0,
  export_rate: 0,
  avg_generation_time: 0,
  total_cost: 0,
  current_period_cost: 0,
  previous_period_cost: 0,
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function rangeLabel(range: DashboardRange): string {
  if (range === "today") return "Showing today";
  if (range === "30d") return "Showing last 30 days";
  return "Showing last 7 days";
}

function buildCostComparisonText(data: DashboardData): string | null {
  const prev = data.previous_period_cost;
  const curr = data.current_period_cost;
  if (prev <= 0) return null;
  const ratio = curr / prev;
  const deltaPct = Math.abs((ratio - 1) * 100);
  const arrow = ratio >= 1 ? "↑" : "↓";
  return `${arrow} ${deltaPct.toFixed(1)}% vs previous period`;
}

function buildAlerts(data: DashboardData): string[] {
  const alerts: string[] = [];

  if (data.export_rate < 0.4) {
    alerts.push(
      `Export rate đang thấp (${formatPercent(data.export_rate)}), dưới ngưỡng 40%.`
    );
  }

  const prev = data.previous_period_cost;
  const curr = data.current_period_cost;
  if (prev > 0) {
    const ratio = curr / prev;
    if (ratio >= 1.5) {
      alerts.push(
        `Chi phí 24h hiện tại tăng mạnh (${formatUsd(curr)} vs ${formatUsd(
          prev
        )}, +${((ratio - 1) * 100).toFixed(1)}%).`
      );
    }
  }

  return alerts;
}

export default function DashboardPage() {
  const [data, setData] = React.useState<DashboardData>(EMPTY_DATA);
  const [range, setRange] = React.useState<DashboardRange>("7d");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<number | null>(null);
  const hasLoadedOnceRef = React.useRef(false);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RANGE_STORAGE_KEY);
      if (saved === "today" || saved === "7d" || saved === "30d") {
        setRange(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(RANGE_STORAGE_KEY, range);
    } catch {
      // ignore storage errors
    }
  }, [range]);

  React.useEffect(() => {
    let cancelled = false;
    const wasLoadingAtEffectStart = loading;

    async function loadDashboard(options?: { initial?: boolean }) {
      const isInitial = options?.initial ?? false;
      if (isInitial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const res = await fetch(`/api/dashboard?range=${range}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as Partial<DashboardData> & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (cancelled) return;
        setData((prev) => ({
          ...prev,
          total_generated: Number(json.total_generated ?? 0),
          total_previewed: Number(json.total_previewed ?? 0),
          total_exported: Number(json.total_exported ?? 0),
          export_rate: Number(json.export_rate ?? 0),
          avg_generation_time: Number(json.avg_generation_time ?? 0),
          total_cost: Number(json.total_cost ?? 0),
          current_period_cost: Number(json.current_period_cost ?? 0),
          previous_period_cost: Number(json.previous_period_cost ?? 0),
        }));
        setError(null);
        setLastUpdatedAt(Date.now());
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) {
          if (isInitial || wasLoadingAtEffectStart) {
            setLoading(false);
          }
          if (!isInitial) {
            setRefreshing(false);
          }
        }
      }
    }

    const isInitial = !hasLoadedOnceRef.current;
    hasLoadedOnceRef.current = true;
    void loadDashboard({ initial: isInitial });
    const id = window.setInterval(() => {
      void loadDashboard();
    }, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [range]);

  const alerts = React.useMemo(() => buildAlerts(data), [data]);
  const costComparison = React.useMemo(
    () => buildCostComparisonText(data),
    [data]
  );
  const hasCoreData = React.useMemo(
    () => data.total_generated > 0 || data.total_exported > 0 || data.total_cost > 0,
    [data.total_generated, data.total_exported, data.total_cost]
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Analytics overview for banner generation performance.
            </p>
            <p
              className="mt-1 text-xs text-indigo-600 transition-all duration-300 ease-out"
              key={range}
            >
              {rangeLabel(range)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {lastUpdatedAt
                ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
                : "Waiting for first data..."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshing ? (
              <Loader2 className="size-4 animate-spin text-zinc-500" aria-hidden />
            ) : null}
            <TimeRangeFilter value={range} onChange={setRange} />
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Failed to load dashboard: {error}
        </div>
      ) : null}

      {!loading && alerts.length > 0 ? (
        <section
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
          role="alert"
          aria-live="polite"
        >
          <div className="mb-2 flex items-center gap-2 text-amber-900">
            <TriangleAlert className="size-4" aria-hidden />
            <p className="text-sm font-semibold">Analytics Alerts</p>
          </div>
          <ul className="space-y-1 text-sm text-amber-900/90">
            {alerts.map((msg) => (
              <li key={msg}>- {msg}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        className={`flex flex-col gap-6 transition-all duration-300 ease-out ${
          refreshing ? "translate-y-[1px] opacity-90" : "opacity-100"
        }`}
        data-refreshing={refreshing}
      >
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Total Generated</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {loading ? "..." : formatNumber(data.total_generated)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {loading ? "..." : formatPercent(data.export_rate)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {loading ? "..." : formatUsd(data.total_cost)}
              </p>
              {!loading && costComparison ? (
                <p className="mt-1 text-xs text-zinc-500">{costComparison}</p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        {!loading && !error && !hasCoreData ? (
          <section
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
            role="status"
            aria-live="polite"
          >
            Chưa có dữ liệu cho khoảng thời gian hiện tại. Hãy thử đổi range (ví dụ
            30 Days) hoặc tạo thêm hành vi Generate/Export để dashboard cập nhật.
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600">
            Top Users
          </h2>
          <UserAnalyticsTable range={range} />
        </section>

        <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          Funnel
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          {([
            { key: "generate", label: "Generate Banner", value: data.total_generated },
            { key: "preview", label: "Preview Banner", value: data.total_previewed },
            { key: "export", label: "Export Banner", value: data.total_exported },
          ] as const).map((step, index, arr) => {
            const max = Math.max(arr[0].value, 1);
            const widthPct = (step.value / max) * 100;
            const prev = index > 0 ? arr[index - 1].value : null;
            const conversion =
              prev === null ? null : safeRatio(step.value, prev);

            return (
              <div key={step.key} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-800">{step.label}</span>
                  <span className="text-zinc-600">
                    {formatNumber(step.value)}
                    {conversion !== null ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        ({formatPercent(conversion)} from previous)
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        </section>
      </div>
    </main>
  );
}
