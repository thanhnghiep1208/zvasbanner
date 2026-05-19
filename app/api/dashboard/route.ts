import { NextResponse } from "next/server";

import { getDashboardAggregate } from "@/lib/dashboard-aggregate";
import { fetchDashboardUsersPage } from "@/lib/dashboard-users-query";
import { parseDashboardRange } from "@/lib/dashboard";
import { ensureAnalyticsSchemaReady, getDbPool } from "@/lib/db";
import { requirePermissionJson } from "@/lib/require-user";

function parseUsersPage(input: string | null): number {
  const n = Number.parseInt(input ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function wantsTruthyFlag(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để xem dashboard.",
    forbiddenError: "Bạn không có quyền xem dashboard.",
    permission: "view_dashboard",
  });
  if (authGate instanceof NextResponse) return authGate;

  try {
    try {
      await ensureAnalyticsSchemaReady();
    } catch (error) {
      console.warn("[dashboard] schema auto-migration skipped", error);
    }

    const url = new URL(req.url);
    const range = parseDashboardRange(url.searchParams.get("range"));
    const bypassCache = wantsTruthyFlag(url.searchParams.get("refresh"));
    const includeUsers = wantsTruthyFlag(url.searchParams.get("includeUsers"));
    const usersPage = parseUsersPage(url.searchParams.get("usersPage"));

    const pool = getDbPool();
    const metrics = await getDashboardAggregate(pool, range, { bypassCache });

    const body: Record<string, unknown> = { ...metrics };

    if (includeUsers) {
      const usersResult = await fetchDashboardUsersPage(pool, range, usersPage);
      body.users = usersResult.users;
      body.pagination = usersResult.pagination;
      body.requesterRole = authGate.role;
    }

    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": bypassCache
          ? "private, no-store"
          : "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[dashboard] aggregate query failed", error);
    return NextResponse.json(
      { error: "Failed to aggregate dashboard metrics" },
      { status: 500 }
    );
  }
}
