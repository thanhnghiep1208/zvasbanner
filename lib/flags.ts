/**
 * Feature flags (server-only).
 *
 * FLOW_CANVAS            = "off" | "allowlist" | "rollout" | "on"   (mặc định: "off")
 * FLOW_CANVAS_ALLOWLIST  = "user_abc,user_xyz"  Clerk userId luôn được bật (allowlist, rollout)
 * FLOW_CANVAS_PERCENT    = 0–100                % user được bật ở mode "rollout" (T6.4), theo bucket ổn định
 * FLOW_CANVAS_SALT       = chuỗi bất kỳ         đổi để chia lại nhóm rollout (mặc định "flow-canvas-v1")
 * FLOW_CANVAS_DENYLIST   = "user_abc"           luôn tắt, thắng mọi mode trừ "off"
 *
 * Logic: lib/flow-rollout.ts.
 */
import 'server-only';

import { decideFlowCanvas, parseFlowRolloutEnv } from './flow-rollout';

export function isFlowCanvasEnabled(userId: string | null): boolean {
  // Đọc env mỗi lần gọi (rẻ): đổi env trên Vercel cần redeploy, nhưng local/test đổi được ngay.
  return decideFlowCanvas(parseFlowRolloutEnv(process.env), userId);
}
