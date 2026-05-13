import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getUserAccessByUserId,
  hasPermission,
  type Permission,
  type UserRole,
} from "@/lib/authz";

/**
 * For Route Handlers that must only run for signed-in Clerk users.
 * Returns the active session user id, or a 401 JSON response.
 */
export async function requireUserJson(params: {
  error: string;
}): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: params.error }, { status: 401 });
  }
  return { userId };
}

export async function requirePermissionJson(params: {
  error: string;
  forbiddenError: string;
  permission: Permission;
}): Promise<{ userId: string; role: UserRole } | NextResponse> {
  const base = await requireUserJson({ error: params.error });
  if (base instanceof NextResponse) return base;
  const access = await getUserAccessByUserId(base.userId);
  if (access.blocked) {
    return NextResponse.json(
      { error: "Tài khoản của bạn đang bị block." },
      { status: 403 }
    );
  }
  const role = access.role;
  if (!hasPermission(role, params.permission)) {
    return NextResponse.json({ error: params.forbiddenError }, { status: 403 });
  }
  return { userId: base.userId, role };
}
