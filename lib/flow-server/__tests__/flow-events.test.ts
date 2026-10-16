import { describe, expect, it } from 'vitest';
import { insertFlowEvent, parseFlowEvent, type FlowEventRow } from '../flow-events';
import type { Queryable } from '../flow-docs';

const NOW = 1_800_000_000_000;
const base = { session_id: 'b1f0c2d4-0000-4000-8000-000000000000', doc_id: null, template_id: 'product-hero', timestamp: NOW - 1000 };

const VALID = {
  flow_opened: { source: 'form' },
  flow_run_started: { ai_calls: 4, reusable: 0, render_mode: 'composed', ratio_count: 4, from_node: false },
  flow_run_completed: { duration_ms: 31_200, render_mode: 'flat', image_count: 1, reused: 0 },
  flow_run_failed: { code: 'E-BG-GEMINI_QUOTA_OR_RATE_LIMIT', duration_ms: 900, render_mode: null },
  flow_view_switched: { view: 'canvas' },
  flow_template_used: { source: 'picker' },
} as const;

describe('parseFlowEvent (T6.3)', () => {
  it.each(Object.entries(VALID))('%s hợp lệ', (event, props) => {
    const row = parseFlowEvent({ event, ...base, ...props }, NOW);
    const expected = {
      event, sessionId: base.session_id, docId: null, templateId: 'product-hero', timestamp: NOW - 1000, props,
    } as FlowEventRow;
    expect(row).toEqual(expected);
  });

  it.each([
    ['event lạ', { event: 'generate_banner', ...base }],
    ['thiếu field', { event: 'flow_view_switched', ...base }],
    ['thừa field', { event: 'flow_view_switched', ...base, view: 'canvas', prompt: 'lộ nội dung' }],
    ['enum sai', { event: 'flow_view_switched', ...base, view: 'full' }],
    ['số âm', { event: 'flow_run_completed', ...base, ...VALID.flow_run_completed, duration_ms: -1 }],
    ['số lẻ', { event: 'flow_run_started', ...base, ...VALID.flow_run_started, ai_calls: 1.5 }],
    ['code có ký tự lạ', { event: 'flow_run_failed', ...base, ...VALID.flow_run_failed, code: 'lỗi <script>' }],
    ['session id rỗng', { event: 'flow_view_switched', ...base, session_id: '', view: 'canvas' }],
    ['doc id sai kiểu', { event: 'flow_view_switched', ...base, doc_id: 5, view: 'canvas' }],
    ['không phải object', 'flow_opened'],
  ])('%s → null', (_n, body) => {
    expect(parseFlowEvent(body, NOW)).toBeNull();
  });

  it('timestamp lệch > 1 ngày hoặc thiếu → giờ server', () => {
    const body = { event: 'flow_view_switched', ...base, view: 'simple' };
    expect(parseFlowEvent({ ...body, timestamp: NOW - 2 * 86_400_000 }, NOW)!.timestamp).toBe(NOW);
    expect(parseFlowEvent({ ...body, timestamp: undefined }, NOW)!.timestamp).toBe(NOW);
  });

  it('insert: user_id từ server, props JSON', async () => {
    const calls: unknown[][] = [];
    const db: Queryable = { query: async (_t, v) => { calls.push(v!); return { rows: [], rowCount: 1 }; } };
    const row = parseFlowEvent({ event: 'flow_opened', ...base, source: 'doc' }, NOW)!;
    await insertFlowEvent(db, 'user_1', row);
    expect(calls[0]).toEqual(['flow_opened', 'user_1', base.session_id, null, 'product-hero', NOW - 1000, '{"source":"doc"}']);
  });
});
