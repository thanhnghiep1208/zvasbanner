"use client";

import * as React from "react";

import type { DashboardRange } from "@/components/dashboard/TimeRangeFilter";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type UserAnalyticsRow = {
  user_id: string;
  user_name: string;
  email: string;
  total_generate: number;
  total_export: number;
};

type UsersApiResponse = {
  users?: UserAnalyticsRow[];
  error?: string;
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function isHighGenerate(value: number, max: number): boolean {
  if (max <= 0) return false;
  return value >= Math.ceil(max * 0.7);
}

function buildInsights(rows: UserAnalyticsRow[]): string[] {
  if (rows.length === 0) return [];

  const insights: string[] = [];

  const strugglingUser = rows.find((row) => {
    if (row.total_generate <= 0) return false;
    const exportRate = row.total_export / row.total_generate;
    return exportRate < 0.4;
  });

  if (strugglingUser) {
    const displayName =
      strugglingUser.user_name || strugglingUser.email || strugglingUser.user_id;
    const exportRate =
      strugglingUser.total_generate > 0
        ? strugglingUser.total_export / strugglingUser.total_generate
        : 0;
    insights.push(
      `User ${displayName} generate nhiều nhưng hiệu quả thấp (export rate ${(
        exportRate * 100
      ).toFixed(1)}%) — có thể đang cần hỗ trợ prompt/style.`
    );
  }

  const powerUser = rows.find((row) => {
    if (row.total_generate <= 30) return false;
    const exportRate = row.total_export / row.total_generate;
    return exportRate >= 0.4;
  });

  if (powerUser) {
    const displayName = powerUser.user_name || powerUser.email || powerUser.user_id;
    const exportRate =
      powerUser.total_generate > 0
        ? powerUser.total_export / powerUser.total_generate
        : 0;
    insights.push(
      `User ${displayName} là power user với tỉ lệ thành công tốt (${(
        exportRate * 100
      ).toFixed(1)}% export).`
    );
  }

  return insights.slice(0, 2);
}

export function UserAnalyticsTable({ range }: { range: DashboardRange }) {
  const [rows, setRows] = React.useState<UserAnalyticsRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/users?range=${range}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as UsersApiResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (cancelled) return;
        setRows(Array.isArray(json.users) ? json.users : []);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load users table");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const maxGenerate = rows.reduce(
    (max, row) => Math.max(max, row.total_generate),
    0
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = React.useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter(
      (row) =>
        row.user_id.toLowerCase().includes(normalizedQuery) ||
        row.user_name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery)
    );
  }, [rows, normalizedQuery]);
  const insights = React.useMemo(
    () => buildInsights(filteredRows),
    [filteredRows]
  );

  return (
    <div className="space-y-3">
      {!loading && !error && insights.length > 0 ? (
        <div
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Insights
          </p>
          <ul className="space-y-1 text-sm text-indigo-900">
            {insights.map((insight) => (
              <li key={insight}>- {insight}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user id, name, email..."
          aria-label="Search by user id, name, or email"
          className="h-9 w-full max-w-xs rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden xl:table-cell">User ID</TableHead>
              <TableHead>User Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Total Generate</TableHead>
              <TableHead className="text-right">Total Export</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-destructive"
                >
                  Failed to load user analytics: {error}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const highGenerate = isHighGenerate(
                  row.total_generate,
                  maxGenerate
                );
                const isPowerUser = row.total_generate > 30;

                return (
                  <TableRow key={row.user_id}>
                    <TableCell className="hidden font-mono text-xs text-zinc-700 xl:table-cell">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.user_id}</span>
                        {isPowerUser ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Power User
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-44 truncate text-zinc-800">
                      {row.user_name || "-"}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-zinc-700">
                      {row.email || "-"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        highGenerate && "font-bold text-zinc-900"
                      )}
                    >
                      {formatNumber(row.total_generate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-700">
                      {formatNumber(row.total_export)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
