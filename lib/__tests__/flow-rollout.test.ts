import { describe, expect, it } from 'vitest';
import { decideFlowCanvas, parseFlowRolloutEnv, rolloutBucket, type FlowRolloutConfig } from '../flow-rollout';

const users = Array.from({ length: 20_000 }, (_, i) => `user_${i.toString(36)}${i}`);
const cfg = (over: Partial<FlowRolloutConfig> = {}): FlowRolloutConfig => ({
  mode: 'rollout', percent: 0, salt: 'flow-canvas-v1', allowlist: new Set(), denylist: new Set(), ...over,
});
const enabledShare = (c: FlowRolloutConfig) => users.filter((u) => decideFlowCanvas(c, u)).length / users.length;

describe('rolloutBucket (T6.4)', () => {
  it('ổn định: cùng user + salt → cùng bucket, trong 0–99', () => {
    for (const u of users.slice(0, 100)) {
      const b = rolloutBucket(u, 's');
      expect(b).toBe(rolloutBucket(u, 's'));
      expect(Number.isInteger(b) && b >= 0 && b < 100).toBe(true);
    }
  });

  it('phân bố đều: mỗi decile ~10% (±1.5%)', () => {
    const counts = new Array(10).fill(0);
    for (const u of users) counts[Math.floor(rolloutBucket(u, 'flow-canvas-v1') / 10)]++;
    for (const c of counts) expect(Math.abs(c / users.length - 0.1)).toBeLessThan(0.015);
  });

  it('đổi salt → chia lại nhóm', () => {
    const same = users.slice(0, 1000).filter((u) => rolloutBucket(u, 'a') === rolloutBucket(u, 'b')).length;
    expect(same).toBeLessThan(50); // ngẫu nhiên ~1%
  });
});

describe('decideFlowCanvas', () => {
  it('% user bật ≈ percent', () => {
    for (const percent of [0, 5, 25, 50, 100]) {
      expect(Math.abs(enabledShare(cfg({ percent })) - percent / 100)).toBeLessThan(0.015);
    }
  });

  it('đơn điệu: tăng % không làm ai mất canvas', () => {
    const at10 = users.filter((u) => decideFlowCanvas(cfg({ percent: 10 }), u));
    expect(at10.every((u) => decideFlowCanvas(cfg({ percent: 30 }), u))).toBe(true);
  });

  it('allowlist luôn bật (allowlist/rollout), denylist luôn tắt kể cả on/allowlist', () => {
    const allow = new Set(['u_team']);
    const deny = new Set(['u_bug', 'u_team2']);
    expect(decideFlowCanvas(cfg({ mode: 'allowlist', allowlist: allow }), 'u_team')).toBe(true);
    expect(decideFlowCanvas(cfg({ mode: 'allowlist', allowlist: allow }), 'u_other')).toBe(false);
    expect(decideFlowCanvas(cfg({ percent: 0, allowlist: allow }), 'u_team')).toBe(true);
    expect(decideFlowCanvas(cfg({ mode: 'on', denylist: deny }), 'u_bug')).toBe(false);
    expect(decideFlowCanvas(cfg({ mode: 'on' }), 'u_x')).toBe(true);
    expect(decideFlowCanvas(cfg({ percent: 100, denylist: deny }), 'u_bug')).toBe(false);
    expect(decideFlowCanvas(cfg({ allowlist: new Set(['u_team2']), denylist: deny }), 'u_team2')).toBe(false);
  });

  it('off tắt hết; chưa đăng nhập chỉ bật ở on', () => {
    expect(decideFlowCanvas(cfg({ mode: 'off', allowlist: new Set(['u']) }), 'u')).toBe(false);
    expect(decideFlowCanvas(cfg({ percent: 100 }), null)).toBe(false);
    expect(decideFlowCanvas(cfg({ mode: 'on' }), null)).toBe(true);
  });
});

describe('parseFlowRolloutEnv', () => {
  it('đọc đủ biến', () => {
    const c = parseFlowRolloutEnv({
      FLOW_CANVAS: ' Rollout ', FLOW_CANVAS_PERCENT: '15', FLOW_CANVAS_SALT: 'wave-2',
      FLOW_CANVAS_ALLOWLIST: 'a, b,,', FLOW_CANVAS_DENYLIST: 'c',
    });
    expect(c).toEqual({ mode: 'rollout', percent: 15, salt: 'wave-2', allowlist: new Set(['a', 'b']), denylist: new Set(['c']) });
  });

  it.each([
    [{}, 'off', 0],
    [{ FLOW_CANVAS: 'yes' }, 'off', 0],
    [{ FLOW_CANVAS: 'rollout', FLOW_CANVAS_PERCENT: 'abc' }, 'rollout', 0],
    [{ FLOW_CANVAS: 'rollout', FLOW_CANVAS_PERCENT: '150' }, 'rollout', 100],
    [{ FLOW_CANVAS: 'rollout', FLOW_CANVAS_PERCENT: '-5' }, 'rollout', 0],
    [{ FLOW_CANVAS: 'rollout', FLOW_CANVAS_PERCENT: '12.9' }, 'rollout', 12],
  ])('%j → mode %s, %i%%', (env, mode, percent) => {
    const c = parseFlowRolloutEnv(env);
    expect([c.mode, c.percent, c.salt]).toEqual([mode, percent, 'flow-canvas-v1']);
  });
});
