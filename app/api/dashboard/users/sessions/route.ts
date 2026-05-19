import { NextResponse } from "next/server";

import {
  listActiveSessionsForUser,
  revokeSessionById,
  sessionBelongsToUser,
} from "@/lib/clerk-sessions";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";
import { requirePermissionJson } from "@/lib/require-user";

export async function GET(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để xem phiên user.",
    forbiddenError: "Bạn không có quyền xem phiên user.",
    permission: "block_user",
  });
  if (authGate instanceof NextResponse) return authGate;

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("targetUserId");
  if (!targetUserId) {
    return NextResponse.json({ error: "Thiếu targetUserId." }, { status: 400 });
  }

  try {
    const sessions = await listActiveSessionsForUser({ userId: targetUserId });
    return NextResponse.json({ sessions, targetUserId });
  } catch (error) {
    console.error("[dashboard.users.sessions] list failed", error);
    return NextResponse.json(
      { error: "Không thể tải danh sách phiên." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const authGate = await requirePermissionJson({
    error: "Cần đăng nhập để thu hồi phiên user.",
    forbiddenError: "Bạn không có quyền thu hồi phiên user.",
    permission: "block_user",
  });
  if (authGate instanceof NextResponse) return authGate;

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("targetUserId");
  const sessionId = url.searchParams.get("sessionId");
  if (!targetUserId || !sessionId) {
    return NextResponse.json(
      { error: "Thiếu targetUserId hoặc sessionId." },
      { status: 400 }
    );
  }

  try {
    const owned = await sessionBelongsToUser(sessionId, targetUserId);
    if (!owned) {
      return NextResponse.json(
        { error: "Phiên không tồn tại hoặc không thuộc user này." },
        { status: 403 }
      );
    }

    await revokeSessionById(sessionId);
    await logDashboardAuditEvent({
      actorUserId: authGate.userId,
      action: "session_revoke",
      targetUserId,
      detail: `sessionId=${sessionId};actorRole=${authGate.role}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[dashboard.users.sessions] revoke failed", error);
    return NextResponse.json(
      { error: "Không thể thu hồi phiên." },
      { status: 500 }
    );
  }
}
