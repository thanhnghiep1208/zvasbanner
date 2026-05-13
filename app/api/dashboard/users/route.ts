import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getDbPool } from "@/lib/db";
import { requirePermissionJson } from "@/lib/require-user";
import type { UserRole } from "@/lib/authz";
import {
  parseDashboardRange,
  resolveDashboardRangeStartMs,
} from "@/lib/dashboard";

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
  role: UserRole;
  blocked: boolean;
  total_generate: number;
  total_export: number;
};

const DEFAULT_ADMIN_EMAIL = "thanhnghiep1208@gmail.com";

async function logAuditEvent(params: {
  actorUserId: string;
  action: "role_change" | "block_toggle" | "delete_user";
  targetUserId: string;
  detail: string;
}) {
  try {
    const pool = getDbPool();
    await pool.query(
      `
      INSERT INTO banner_events (
        event_name,
        user_id,
        banner_id,
        timestamp,
        style,
        canvas_size,
        has_asset,
        generation_time_ms,
        regenerate_count,
        exported,
        cost_usd
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        "admin_audit",
        params.actorUserId,
        `user-${params.targetUserId}`,
        Date.now(),
        params.action,
        params.detail,
        null,
        null,
        null,
        null,
        null,
      ]
    );
  } catch (error) {
    console.error("[dashboard.users] audit log failed", error);
  }
}

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

export async function GET(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để xem dashboard users.",
    forbiddenError: "Bạn không có quyền xem dashboard users.",
    permission: "view_dashboard",
  });
  if (authGate instanceof NextResponse) return authGate;

  try {
    const pool = getDbPool();
    const url = new URL(req.url);
    const range = parseDashboardRange(url.searchParams.get("range"));
    const page = parsePage(url.searchParams.get("page"));
    const offset = (page - 1) * PAGE_SIZE;
    const nowMs = Date.now();
    const startMs = resolveDashboardRangeStartMs(range, nowMs);

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
          requesterRole: authGate.role,
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
            role: primaryEmail?.toLowerCase() === DEFAULT_ADMIN_EMAIL
              ? "admin"
              : user.privateMetadata?.role === "admin" ||
              user.privateMetadata?.role === "mod" ||
              user.privateMetadata?.role === "editor"
                ? (user.privateMetadata.role as UserRole)
                : user.publicMetadata?.role === "admin" ||
                    user.publicMetadata?.role === "mod" ||
                    user.publicMetadata?.role === "editor"
                  ? (user.publicMetadata.role as UserRole)
                  : "editor",
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

    const users: DashboardUser[] = rows.map((row) => {
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
    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

    return NextResponse.json(
      {
        users,
        requesterRole: authGate.role,
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

type PatchRoleBody = {
  targetUserId: string;
  role: UserRole;
};

function isPatchRoleBody(v: unknown): v is PatchRoleBody {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.targetUserId === "string" &&
    (r.role === "admin" || r.role === "mod" || r.role === "editor")
  );
}

export async function PATCH(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để chỉnh quyền user.",
    forbiddenError: "Bạn không có quyền chỉnh quyền user.",
    permission: "manage_roles",
  });
  if (authGate instanceof NextResponse) return authGate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }
  if (!isPatchRoleBody(body)) {
    return NextResponse.json({ error: "Dữ liệu đổi role không hợp lệ." }, { status: 400 });
  }
  if (authGate.role === "mod" && body.role === "admin") {
    return NextResponse.json(
      { error: "Mod không được phép promote user lên admin." },
      { status: 403 }
    );
  }
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(body.targetUserId, {
      privateMetadata: { role: body.role },
    });
    await logAuditEvent({
      actorUserId: authGate.userId,
      action: "role_change",
      targetUserId: body.targetUserId,
      detail: `role=${body.role};actorRole=${authGate.role}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[dashboard.users] update role failed", error);
    return NextResponse.json({ error: "Không thể cập nhật role user." }, { status: 500 });
  }
}

type BlockBody = { targetUserId: string; blocked: boolean };

function isBlockBody(v: unknown): v is BlockBody {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.targetUserId === "string" && typeof r.blocked === "boolean";
}

export async function POST(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để block user.",
    forbiddenError: "Bạn không có quyền block user.",
    permission: "block_user",
  });
  if (authGate instanceof NextResponse) return authGate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON không hợp lệ." }, { status: 400 });
  }
  if (!isBlockBody(body)) {
    return NextResponse.json({ error: "Dữ liệu block user không hợp lệ." }, { status: 400 });
  }
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(body.targetUserId, {
      privateMetadata: { blocked: body.blocked },
    });
    await logAuditEvent({
      actorUserId: authGate.userId,
      action: "block_toggle",
      targetUserId: body.targetUserId,
      detail: `blocked=${body.blocked};actorRole=${authGate.role}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[dashboard.users] block user failed", error);
    return NextResponse.json({ error: "Không thể cập nhật trạng thái block user." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để xóa user.",
    forbiddenError: "Bạn không có quyền xóa user.",
    permission: "delete_user",
  });
  if (authGate instanceof NextResponse) return authGate;

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("targetUserId");
  if (!targetUserId) {
    return NextResponse.json({ error: "Thiếu targetUserId." }, { status: 400 });
  }
  try {
    const client = await clerkClient();
    await client.users.deleteUser(targetUserId);
    await logAuditEvent({
      actorUserId: authGate.userId,
      action: "delete_user",
      targetUserId,
      detail: `actorRole=${authGate.role}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[dashboard.users] delete user failed", error);
    return NextResponse.json({ error: "Không thể xóa user." }, { status: 500 });
  }
}
