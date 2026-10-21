import { NextResponse } from "next/server";

import { validateContactInfo } from "@/lib/contact-info";
import { getContactInfo, saveContactInfo } from "@/lib/contact-settings";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";
import { requirePermissionJson } from "@/lib/require-user";

const AUTH_MESSAGES = {
  error: "Cần đăng nhập để quản lý cài đặt.",
  forbiddenError: "Bạn không có quyền quản lý cài đặt.",
  permission: "manage_settings",
} as const;

export async function GET() {
  const authGate = await requirePermissionJson(AUTH_MESSAGES);
  if (authGate instanceof NextResponse) return authGate;

  const { value, source } = await getContactInfo();
  return NextResponse.json(
    { contact: value, source },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(req: Request) {
  const authGate = await requirePermissionJson(AUTH_MESSAGES);
  if (authGate instanceof NextResponse) return authGate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body phải là JSON." }, { status: 400 });
  }
  const parsed = validateContactInfo(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    await saveContactInfo(parsed.value, authGate.userId);
  } catch (error) {
    console.error("[settings.contact] save failed", error);
    return NextResponse.json(
      { error: "Không lưu được cài đặt (kiểm tra DATABASE_URL)." },
      { status: 503 }
    );
  }

  await logDashboardAuditEvent({
    actorUserId: authGate.userId,
    action: "settings_change",
    targetUserId: "settings",
    detail: "contact_info",
  });

  return NextResponse.json({ contact: parsed.value, source: "db" });
}
