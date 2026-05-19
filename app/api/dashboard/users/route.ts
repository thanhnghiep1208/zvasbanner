import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { invalidateUserAccessCache, type UserRole } from "@/lib/authz";
import { fetchDashboardUsersPage } from "@/lib/dashboard-users-query";
import { parseDashboardRange } from "@/lib/dashboard";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";
import { getDbPool } from "@/lib/db";
import { requirePermissionJson } from "@/lib/require-user";

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
    const result = await fetchDashboardUsersPage(pool, range, page);

    return NextResponse.json(
      {
        users: result.users,
        requesterRole: authGate.role,
        pagination: result.pagination,
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
    invalidateUserAccessCache(body.targetUserId);
    await logDashboardAuditEvent({
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
    invalidateUserAccessCache(body.targetUserId);
    await logDashboardAuditEvent({
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
    invalidateUserAccessCache(targetUserId);
    await logDashboardAuditEvent({
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
