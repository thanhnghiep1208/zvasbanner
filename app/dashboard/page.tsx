"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { SignInButton } from "@clerk/nextjs";
import { Loader2, TriangleAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TimeRangeFilter,
} from "@/components/dashboard/TimeRangeFilter";
import { UserAnalyticsTable } from "@/components/dashboard/UserAnalyticsTable";
import {
  buildCostComparisonText,
  buildDashboardAlerts,
  DASHBOARD_AGGREGATE_POLL_MS,
  DASHBOARD_RANGE_STORAGE_KEY,
  dashboardRangeLabel,
  EMPTY_DASHBOARD_DATA,
  formatDashboardDecimal,
  formatDashboardNumber,
  formatDashboardPercent,
  formatDashboardUsd,
  labelImageModelSlug,
  safeRatio,
  type DashboardData,
  type DashboardRange,
  type DashboardUserRow,
} from "@/lib/dashboard";

export default function DashboardPage() {
  const { isSignedIn } = useAuth();
  const [hydrated, setHydrated] = React.useState(false);
  const [data, setData] = React.useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [range, setRange] = React.useState<DashboardRange>("7d");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<number | null>(null);
  const [usersPage1, setUsersPage1] = React.useState<{
    users: DashboardUserRow[];
    pagination?: {
      page: number;
      pageSize: number;
      totalUsers: number;
      totalPages: number;
    };
    requesterRole?: "admin" | "mod" | "editor";
  } | null>(null);
  const hasLoadedOnceRef = React.useRef(false);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DASHBOARD_RANGE_STORAGE_KEY);
      if (saved === "today" || saved === "7d" || saved === "30d") {
        setRange(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_RANGE_STORAGE_KEY, range);
    } catch {
      // ignore storage errors
    }
  }, [range]);

  const loadDashboard = React.useCallback(
    async (options?: { initial?: boolean; refresh?: boolean }) => {
      const isInitial = options?.initial ?? false;
      const forceRefresh = options?.refresh ?? false;
      if (isInitial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const params = new URLSearchParams({
          range,
          includeUsers: "1",
          usersPage: "1",
        });
        if (forceRefresh) params.set("refresh", "1");
        const res = await fetch(`/api/dashboard?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as Partial<DashboardData> & {
          error?: string;
          users?: DashboardUserRow[];
          pagination?: NonNullable<typeof usersPage1>["pagination"];
          requesterRole?: "admin" | "mod" | "editor";
        };
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (cancelledRef.current) return;
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
          avg_tokens_per_request: Number(json.avg_tokens_per_request ?? 0),
          avg_input_tokens: Number(json.avg_input_tokens ?? 0),
          avg_output_tokens: Number(json.avg_output_tokens ?? 0),
          total_tokens_month: Number(json.total_tokens_month ?? 0),
          cost_per_gen_user: Number(json.cost_per_gen_user ?? 0),
          cost_per_success_image: Number(json.cost_per_success_image ?? 0),
          cost_per_export_image: Number(json.cost_per_export_image ?? 0),
          generations_by_model: (() => {
            const raw = json.generations_by_model;
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
              return {};
            }
            return Object.fromEntries(
              Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
                k,
                typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0,
              ])
            );
          })(),
        }));
        if (Array.isArray(json.users)) {
          setUsersPage1({
            users: json.users,
            pagination: json.pagination,
            requesterRole: json.requesterRole,
          });
        }
        setError(null);
        setLastUpdatedAt(Date.now());
      } catch (e) {
        if (cancelledRef.current) return;
        const msg = e instanceof Error ? e.message : "Không thể tải dashboard.";
        setError(
          `Không thể tải dữ liệu dashboard. ${msg} Vui lòng thử đổi range hoặc tải lại trang.`
        );
      } finally {
        // Always clear UI flags: Strict Mode re-runs effects and sets cancelled
        // before the first request finishes; skipping here leaves loading stuck.
        if (isInitial) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [range]
  );

  React.useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      setRefreshing(false);
      setError(null);
      setData(EMPTY_DASHBOARD_DATA);
      return;
    }
    cancelledRef.current = false;
    const isInitial = !hasLoadedOnceRef.current;
    hasLoadedOnceRef.current = true;
    void loadDashboard({ initial: isInitial });
    const id = window.setInterval(() => {
      void loadDashboard();
    }, DASHBOARD_AGGREGATE_POLL_MS);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, [range, isSignedIn, loadDashboard]);

  const alerts = React.useMemo(() => buildDashboardAlerts(data), [data]);
  const costComparison = React.useMemo(
    () => buildCostComparisonText(data),
    [data]
  );
  const hasCoreData = React.useMemo(
    () => data.total_generated > 0 || data.total_exported > 0 || data.total_cost > 0,
    [data.total_generated, data.total_exported, data.total_cost]
  );

  const generationsByModelRows = React.useMemo(
    () =>
      Object.entries(data.generations_by_model)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]),
    [data.generations_by_model]
  );

  if (!hydrated) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          Đang tải dashboard...
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
        <section className="flex min-h-[52vh] items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-white p-8">
          <div className="max-w-lg text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <TriangleAlert className="size-5" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Cần đăng nhập để xem Dashboard
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Dashboard chứa dữ liệu phân tích nội bộ theo vai trò. Vui lòng đăng nhập
              bằng tài khoản được cấp quyền để truy cập.
            </p>
            <div className="mt-5 flex items-center justify-center">
              <SignInButton mode="redirect" forceRedirectUrl="/dashboard">
                <Button
                  type="button"
                  className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Login để tiếp tục
                </Button>
              </SignInButton>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 lg:px-6">
      <section className="rounded-2xl bg-white/90 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Theo dõi hiệu suất tạo banner, chi phí và hành vi người dùng theo thời gian.
            </p>
            <p
              className="mt-1 text-xs text-indigo-600 transition-all duration-300 ease-out"
              key={range}
            >
              {dashboardRangeLabel(range)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {lastUpdatedAt
                ? `Cập nhật lúc ${new Date(lastUpdatedAt).toLocaleString()}. Tự làm mới tối đa mỗi ${DASHBOARD_AGGREGATE_POLL_MS / (60 * 60 * 1000)} giờ — bấm Làm mới nếu cần số liệu ngay.`
                : "Đang chờ dữ liệu đầu tiên..."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50/80 p-2">
            {refreshing ? (
              <Loader2 className="size-4 animate-spin text-zinc-500" aria-hidden />
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-lg border-zinc-200 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              disabled={loading || refreshing}
              onClick={() => void loadDashboard({ refresh: true })}
            >
              Làm mới
            </Button>
            <TimeRangeFilter value={range} onChange={setRange} />
          </div>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Không thể tải dashboard: {error}
        </div>
      ) : null}

      {!loading && alerts.length > 0 ? (
        <section
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
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
                {loading ? "..." : formatDashboardNumber(data.total_generated)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {loading ? "..." : formatDashboardPercent(data.export_rate)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {loading ? "..." : formatDashboardUsd(data.total_cost)}
              </p>
              {!loading && costComparison ? (
                <p className="mt-1 text-xs text-zinc-500">{costComparison}</p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600">
            Ảnh tạo theo model
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Số lần generate theo preset model</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-zinc-500">...</p>
              ) : generationsByModelRows.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  {data.total_generated > 0
                    ? "Chưa phân tách được theo model: thiếu cột image_model trên DB hoặc các event generate trước khi bổ sung trường này."
                    : "Chưa có sự kiện generate trong khoảng thời gian này."}
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {generationsByModelRows.map(([slug, count]) => (
                    <li
                      key={slug}
                      className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                    >
                      <span className="text-sm font-medium text-zinc-800">
                        {labelImageModelSlug(slug)}
                      </span>
                      <span className="text-sm tabular-nums text-zinc-600">
                        {formatDashboardNumber(count)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600">
            Token Usage
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Avg Tokens / Request</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardDecimal(data.avg_tokens_per_request)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Avg Input Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardDecimal(data.avg_input_tokens)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Avg Output Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardDecimal(data.avg_output_tokens)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Total Tokens (Month)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardNumber(data.total_tokens_month)}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600">
            Cost Efficiency
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Cost / Gen User</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardUsd(data.cost_per_gen_user)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cost / Success Image</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardUsd(data.cost_per_success_image)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cost / Export Image</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {loading ? "..." : formatDashboardUsd(data.cost_per_export_image)}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {!loading && !error && !hasCoreData ? (
          <section
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
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
          <UserAnalyticsTable
            range={range}
            prefetchedPage1={usersPage1}
            prefetchedKey={lastUpdatedAt}
          />
        </section>

        <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          Funnel
        </h2>
        <div className="rounded-xl bg-zinc-50/60 p-4">
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
                    {formatDashboardNumber(step.value)}
                    {conversion !== null ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        ({formatDashboardPercent(conversion)} from previous)
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
