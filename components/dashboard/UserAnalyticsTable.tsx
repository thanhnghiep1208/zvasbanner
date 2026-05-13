"use client";

import * as React from "react";

import type { DashboardRange } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  role: "admin" | "mod" | "editor";
  blocked: boolean;
  total_generate: number;
  total_export: number;
};

type UsersApiResponse = {
  users?: UserAnalyticsRow[];
  requesterRole?: "admin" | "mod" | "editor";
  pagination?: {
    page: number;
    pageSize: number;
    totalUsers: number;
    totalPages: number;
  };
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

function roleBadgeClass(role: UserAnalyticsRow["role"]): string {
  if (role === "admin") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (role === "mod") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-indigo-200 bg-indigo-50 text-indigo-700";
}

export function UserAnalyticsTable({ range }: { range: DashboardRange }) {
  const [rows, setRows] = React.useState<UserAnalyticsRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [totalUsers, setTotalUsers] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [requesterRole, setRequesterRole] = React.useState<
    "admin" | "mod" | "editor"
  >("editor");
  const [actionBusyUserId, setActionBusyUserId] = React.useState<string | null>(
    null
  );
  const [confirmDeleteUser, setConfirmDeleteUser] =
    React.useState<UserAnalyticsRow | null>(null);

  React.useEffect(() => {
    setPage(1);
  }, [range]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/users?range=${range}&page=${page}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as UsersApiResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (cancelled) return;
        setRows(Array.isArray(json.users) ? json.users : []);
        setRequesterRole(json.requesterRole ?? "editor");
        setTotalUsers(Number(json.pagination?.totalUsers ?? 0));
        setTotalPages(Number(json.pagination?.totalPages ?? 0));
        setError(null);
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof Error ? e.message : "Không thể tải danh sách người dùng.";
        setError(
          `Không thể tải Top Users. ${msg} Vui lòng đổi range hoặc thử lại sau.`
        );
        setRows([]);
        setTotalUsers(0);
        setTotalPages(0);
      } finally {
        // Always clear loading (Strict Mode / fast navigation can cancel mid-flight).
        setLoading(false);
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [range, page]);

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

  const canManageRoles = requesterRole === "admin" || requesterRole === "mod";
  const canBlockOrDelete = requesterRole === "admin";

  const updateRole = async (
    targetUserId: string,
    role: "admin" | "mod" | "editor"
  ) => {
    setActionBusyUserId(targetUserId);
    try {
      const res = await fetch("/api/dashboard/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, role }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Không thể đổi role.");
      setRows((prev) =>
        prev.map((r) => (r.user_id === targetUserId ? { ...r, role } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đổi role.");
    } finally {
      setActionBusyUserId(null);
    }
  };

  const setBlocked = async (targetUserId: string, blocked: boolean) => {
    setActionBusyUserId(targetUserId);
    try {
      const res = await fetch("/api/dashboard/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, blocked }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Không thể block user.");
      setRows((prev) =>
        prev.map((r) => (r.user_id === targetUserId ? { ...r, blocked } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể block user.");
    } finally {
      setActionBusyUserId(null);
    }
  };

  const deleteUser = async (targetUserId: string) => {
    setActionBusyUserId(targetUserId);
    try {
      const res = await fetch(
        `/api/dashboard/users?targetUserId=${encodeURIComponent(targetUserId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Không thể xóa user.");
      setRows((prev) => prev.filter((r) => r.user_id !== targetUserId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xóa user.");
    } finally {
      setActionBusyUserId(null);
    }
  };

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

      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-zinc-50/60 p-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo user id, tên hoặc email..."
          aria-label="Search by user id, name, or email"
          className="h-9 w-full max-w-xs rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Total Generate</TableHead>
              <TableHead className="text-right">Total Export</TableHead>
              <TableHead>Role / Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                  Đang tải...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-destructive"
                >
                  Không thể tải dữ liệu người dùng: {error}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                  Không có dữ liệu
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
                    <TableCell className="max-w-56">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-zinc-900">
                          {row.user_name || "-"}
                        </span>
                        {isPowerUser ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Active
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                        {row.user_id}
                      </p>
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
                    <TableCell className="min-w-[11rem]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", roleBadgeClass(row.role))}
                        >
                          {row.role}
                        </Badge>
                        {row.blocked ? (
                          <Badge variant="destructive" className="text-[10px]">
                            blocked
                          </Badge>
                        ) : null}
                        {canManageRoles ? (
                          <select
                            value={row.role}
                            disabled={actionBusyUserId === row.user_id}
                            className="h-7 rounded border border-zinc-200 bg-white px-1 text-[11px]"
                            onChange={(e) =>
                              void updateRole(
                                row.user_id,
                                e.target.value as "admin" | "mod" | "editor"
                              )
                            }
                          >
                            <option value="editor">editor</option>
                            <option value="mod">mod</option>
                            {requesterRole === "admin" ? (
                              <option value="admin">admin</option>
                            ) : null}
                          </select>
                        ) : null}
                        {canBlockOrDelete ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={actionBusyUserId === row.user_id}
                              onClick={() => void setBlocked(row.user_id, !row.blocked)}
                            >
                              {row.blocked ? "Unblock" : "Block"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={actionBusyUserId === row.user_id}
                              onClick={() => setConfirmDeleteUser(row)}
                            >
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600">
          <span>
            Trang {totalPages === 0 ? 0 : page}/{Math.max(totalPages, 1)} - {totalUsers} người dùng
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || totalPages === 0 || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      </div>

      {confirmDeleteUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xóa user"
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-zinc-900">
              Xác nhận xóa user
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              Bạn có chắc muốn xóa user{" "}
              <span className="font-medium text-zinc-900">
                {confirmDeleteUser.user_name || confirmDeleteUser.email}
              </span>
              ? Hành động này không thể hoàn tác.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteUser(null)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={actionBusyUserId === confirmDeleteUser.user_id}
                onClick={async () => {
                  const target = confirmDeleteUser.user_id;
                  setConfirmDeleteUser(null);
                  await deleteUser(target);
                }}
              >
                Xóa user
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
