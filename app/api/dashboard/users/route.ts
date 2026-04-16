import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getDbPool } from "@/lib/db";

type DashboardRange = "today" | "7d" | "30d";

type DashboardUsersRow = {
  user_id: string | null;
  total_generate: string | number | null;
  total_export: string | number | null;
  total_users: string | number | null;
};

type DashboardUser = {
  user_id: string;
  user_name: string;
  email: string;
  total_generate: number;
  total_export: number;
};

function toNumber(value: string | number | null): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

const PAGE_SIZE = 15;

function parsePage(input: string | null): number {
  const n = Number.parseInt(input ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
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
    // Keep consistent with /api/dashboard: UTC midnight boundary.
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
    const url = new URL(req.url);
    const range = parseRange(url.searchParams.get("range"));
    const page = parsePage(url.searchParams.get("page"));
    const offset = (page - 1) * PAGE_SIZE;
    const nowMs = Date.now();
    const startMs = resolveStartMs(range, nowMs);

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
      [startMs, PAGE_SIZE, offset]
    );

    if (!rows.length) {
      return NextResponse.json(
        {
          users: [] as DashboardUser[],
          pagination: {
            page,
            pageSize: PAGE_SIZE,
            totalUsers: 0,
            totalPages: 0,
          },
        },
        { status: 200 }
      );
    }

    const ids = rows
      .map((row) => row.user_id)
      .filter((id): id is string => Boolean(id && id.trim()));

    const identityByUserId = new Map<
      string,
      { user_name: string; email: string }
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
          });
        }
      } catch (error) {
        console.error("[dashboard.users] failed to fetch Clerk users", error);
      }
    }

    const users: DashboardUser[] = rows.map((row) => {
      const userId = row.user_id ?? "unknown";
      const identity = identityByUserId.get(userId);
      return {
        user_id: userId,
        user_name: identity?.user_name ?? userId,
        email: identity?.email ?? "-",
        total_generate: Math.round(toNumber(row.total_generate)),
        total_export: Math.round(toNumber(row.total_export)),
      };
    });

    const totalUsers = Math.max(0, Math.round(toNumber(rows[0]?.total_users ?? 0)));
    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

    return NextResponse.json(
      {
        users,
        pagination: {
          page,
          pageSize: PAGE_SIZE,
          totalUsers,
          totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[dashboard.users] aggregate query failed", error);
    return NextResponse.json(
      { error: "Failed to aggregate dashboard users metrics" },
      { status: 500 }
    );
  }
}
