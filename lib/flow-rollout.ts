/**
 * Quyết định bật Flow canvas cho 1 user (T6.4) – hàm thuần, không đọc env (lib/flags.ts đọc env rồi gọi vào đây).
 *
 * Rollout theo %: bucket = sha256(salt + ":" + userId) → 0–99, bật khi bucket < percent.
 * - Ổn định: cùng user luôn cùng bucket → không nhảy qua lại giữa form và canvas giữa các lần tải trang/deploy.
 * - Đơn điệu: tăng % chỉ thêm user, không ai đang có canvas bị mất.
 * - Đổi salt = chia lại nhóm hoàn toàn (dùng khi muốn một nhóm thử nghiệm mới).
 * Allowlist luôn bật (team nội bộ), denylist luôn tắt (user báo lỗi, cần quay về form) – denylist thắng allowlist.
 */
import { createHash } from 'node:crypto';

export type FlowCanvasMode = 'off' | 'allowlist' | 'rollout' | 'on';

export interface FlowRolloutConfig {
  mode: FlowCanvasMode;
  /** 0–100, chỉ dùng ở mode 'rollout'. */
  percent: number;
  salt: string;
  allowlist: ReadonlySet<string>;
  denylist: ReadonlySet<string>;
}

export function rolloutBucket(userId: string, salt: string): number {
  const digest = createHash('sha256').update(`${salt}:${userId}`).digest();
  // 4 byte đầu → số nguyên không dấu; mod 100 (độ lệch ~1e-8, không đáng kể).
  return digest.readUInt32BE(0) % 100;
}

export function decideFlowCanvas(cfg: FlowRolloutConfig, userId: string | null): boolean {
  if (cfg.mode === 'off') return false;
  if (userId && cfg.denylist.has(userId)) return false;
  if (cfg.mode === 'on') return true;
  if (!userId) return false;
  if (cfg.allowlist.has(userId)) return true;
  return cfg.mode === 'rollout' && rolloutBucket(userId, cfg.salt) < cfg.percent;
}

/** Parse env thô → config. Giá trị lạ → an toàn (mode 'off', percent 0). */
export function parseFlowRolloutEnv(env: Record<string, string | undefined>): FlowRolloutConfig {
  const rawMode = (env.FLOW_CANVAS ?? 'off').trim().toLowerCase();
  const mode: FlowCanvasMode = rawMode === 'on' || rawMode === 'allowlist' || rawMode === 'rollout' ? rawMode : 'off';
  const pct = Number((env.FLOW_CANVAS_PERCENT ?? '0').trim());
  const percent = Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.floor(pct))) : 0;
  const ids = (v: string | undefined) => new Set((v ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  return {
    mode, percent,
    salt: (env.FLOW_CANVAS_SALT ?? '').trim() || 'flow-canvas-v1',
    allowlist: ids(env.FLOW_CANVAS_ALLOWLIST),
    denylist: ids(env.FLOW_CANVAS_DENYLIST),
  };
}
