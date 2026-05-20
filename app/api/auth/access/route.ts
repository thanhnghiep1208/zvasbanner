import { NextResponse } from "next/server";

import {
  getUserAccessByUserId,
  hasPermission,
  type UserRole,
} from "@/lib/authz";
import { requireUserJson } from "@/lib/require-user";

export async function GET() {
  const auth = await requireUserJson({
    error: "Bạn cần đăng nhập.",
  });
  if (auth instanceof NextResponse) return auth;

  const access = await getUserAccessByUserId(auth.userId);
  if (access.blocked) {
    return NextResponse.json(
      { error: "Tài khoản của bạn đang bị block." },
      { status: 403 }
    );
  }

  const role: UserRole = access.role;
  return NextResponse.json({
    role,
    canViewDashboard: hasPermission(role, "view_dashboard"),
  });
}
