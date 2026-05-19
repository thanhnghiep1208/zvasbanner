import { clerkClient } from "@clerk/nextjs/server";
import type { Pool } from "pg";

import { getRoleFromClerkUser, type UserRole } from "@/lib/authz";
import {
  DASHBOARD_USERS_PAGE_SIZE,
  type DashboardRange,
  type DashboardUserRow,
  type DashboardUsersPageResult,
  resolveDashboardRangeStartMs,
} from "@/lib/dashboard";

type DashboardUsersRow = {
  user_id: string | null;
  total_generate: string | number | null;
  total_export: string | number | null;
  total_users: string | number | null;
};

function toNumber(value: string | number | null): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchDashboardUsersPage(
  pool: Pool,
  range: DashboardRange,
  page: number
): Promise<DashboardUsersPageResult> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const offset = (safePage - 1) * DASHBOARD_USERS_PAGE_SIZE;
  const startMs = resolveDashboardRangeStartMs(range, Date.now());

  const { rows } = await pool.query<DashboardUsersRow>(
    `
      WITH filtered AS (
        SELECT
          be.user_id,
          be.event_name
        FROM banner_events be
        WHERE be.timestamp >= $1::bigint
      ),
      user_agg AS (
        SELECT
          f.user_id,
          COUNT(*) FILTER (WHERE f.event_name = 'generate_banner') AS total_generate,
          COUNT(*) FILTER (WHERE f.event_name = 'export_banner') AS total_export
        FROM filtered f
        GROUP BY f.user_id
      )
      SELECT
        ua.user_id,
        ua.total_generate,
        ua.total_export,
        COUNT(*) OVER() AS total_users
      FROM user_agg ua
      WHERE ua.total_generate > 0
      ORDER BY ua.total_generate DESC
      LIMIT $2::int
      OFFSET $3::int
    `,
    [startMs, DASHBOARD_USERS_PAGE_SIZE, offset]
  );

  if (!rows.length) {
    return {
      users: [],
      pagination: {
        page: safePage,
        pageSize: DASHBOARD_USERS_PAGE_SIZE,
        totalUsers: 0,
        totalPages: 0,
      },
    };
  }

  const ids = rows
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id && id.trim()));

  const identityByUserId = new Map<
    string,
    { user_name: string; email: string; role: UserRole; blocked: boolean }
  >();

  if (ids.length > 0) {
    try {
      const client = await clerkClient();
      const clerkUsers = await client.users.getUserList({
        userId: ids,
        limit: ids.length,
      });

      for (const user of clerkUsers.data) {
        const primaryEmail =
          user.emailAddresses.find(
            (addr) => addr.id === user.primaryEmailAddressId
          )?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
        const fullName = [user.firstName, user.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();

        identityByUserId.set(user.id, {
          user_name: fullName || user.username || "Unknown user",
          email: primaryEmail ?? "-",
          role: getRoleFromClerkUser(user),
          blocked:
            typeof user.privateMetadata?.blocked === "boolean"
              ? user.privateMetadata.blocked
              : typeof user.publicMetadata?.blocked === "boolean"
                ? user.publicMetadata.blocked
                : false,
        });
      }
    } catch (error) {
      console.error("[dashboard.users] failed to fetch Clerk users", error);
    }
  }

  const users: DashboardUserRow[] = rows.map((row) => {
    const userId = row.user_id ?? "unknown";
    const identity = identityByUserId.get(userId);
    return {
      user_id: userId,
      user_name: identity?.user_name ?? userId,
      email: identity?.email ?? "-",
      role: identity?.role ?? "editor",
      blocked: identity?.blocked ?? false,
      total_generate: Math.round(toNumber(row.total_generate)),
      total_export: Math.round(toNumber(row.total_export)),
    };
  });

  const totalUsers = Math.max(0, Math.round(toNumber(rows[0]?.total_users ?? 0)));
  const totalPages = Math.ceil(totalUsers / DASHBOARD_USERS_PAGE_SIZE);

  return {
    users,
    pagination: {
      page: safePage,
      pageSize: DASHBOARD_USERS_PAGE_SIZE,
      totalUsers,
      totalPages,
    },
  };
}
