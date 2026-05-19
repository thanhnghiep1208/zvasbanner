import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  listActiveSessionsForUser,
  revokeSessionById,
  sessionBelongsToUser,
} from "@/lib/clerk-sessions";
import { requireUserJson } from "@/lib/require-user";

export async function GET() {
  const gate = await requireUserJson({
    error: "Cần đăng nhập để xem phiên đăng nhập.",
  });
  if (gate instanceof NextResponse) return gate;

  try {
    const { sessionId } = await auth();
    const sessions = await listActiveSessionsForUser({
      userId: gate.userId,
      currentSessionId: sessionId,
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[api.sessions] list failed", error);
    return NextResponse.json(
      { error: "Không thể tải danh sách phiên đăng nhập." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const gate = await requireUserJson({
    error: "Cần đăng nhập để đăng xuất phiên.",
  });
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Thiếu sessionId." }, { status: 400 });
  }

  try {
    const owned = await sessionBelongsToUser(sessionId, gate.userId);
    if (!owned) {
      return NextResponse.json(
        { error: "Phiên không tồn tại hoặc không thuộc tài khoản của bạn." },
        { status: 403 }
      );
    }

    const { sessionId: currentSessionId } = await auth();
    await revokeSessionById(sessionId);

    return NextResponse.json({
      ok: true,
      revokedCurrent: sessionId === currentSessionId,
    });
  } catch (error) {
    console.error("[api.sessions] revoke failed", error);
    return NextResponse.json(
      { error: "Không thể đăng xuất phiên này." },
      { status: 500 }
    );
  }
}
