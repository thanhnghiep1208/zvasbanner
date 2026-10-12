/**
 * Feature flags (server-only).
 *
 * FLOW_CANVAS = "off" | "allowlist" | "on"   (mặc định: "off")
 * FLOW_CANVAS_ALLOWLIST = "user_abc,user_xyz" (Clerk userId, dùng khi FLOW_CANVAS=allowlist)
 *
 * Bước 6 (rollout %) sẽ chuyển sang Clerk publicMetadata hoặc bucket theo userId hash.
 */
import 'server-only';

type FlowCanvasMode = 'off' | 'allowlist' | 'on';

function getMode(): FlowCanvasMode {
  const raw = (process.env.FLOW_CANVAS ?? 'off').toLowerCase();
  return raw === 'on' || raw === 'allowlist' ? raw : 'off';
}

function getAllowlist(): Set<string> {
  return new Set(
    (process.env.FLOW_CANVAS_ALLOWLIST ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isFlowCanvasEnabled(userId: string | null): boolean {
  const mode = getMode();
  if (mode === 'on') return true;
  if (mode === 'off' || !userId) return false;
  return getAllowlist().has(userId);
}
