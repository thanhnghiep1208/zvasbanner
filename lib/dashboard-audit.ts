import { getDbPool } from "@/lib/db";

export type DashboardAuditAction =
  | "role_change"
  | "block_toggle"
  | "delete_user"
  | "session_revoke";

export async function logDashboardAuditEvent(params: {
  actorUserId: string;
  action: DashboardAuditAction;
  targetUserId: string;
  detail: string;
}): Promise<void> {
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
    console.error("[dashboard.audit] log failed", error);
  }
}
