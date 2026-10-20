/**
 * Analytics Flow canvas (T6.3, Q12) – bảng `flow_events` (tự tạo lần ghi đầu, giống flow_docs).
 * Payload kiểm chặt theo từng event: chỉ nhận đúng các field khai báo trong FlowAnalyticsPropsMap.
 */
import type { FlowAnalyticsEventName } from '@/lib/analytics-events';
import type { Queryable } from './flow-docs';

export const FLOW_EVENTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS flow_events (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  doc_id TEXT,
  template_id TEXT,
  timestamp BIGINT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_flow_events_ts_event ON flow_events (timestamp DESC, event_name);
CREATE INDEX IF NOT EXISTS idx_flow_events_user ON flow_events (user_id, timestamp DESC);
`;

let schemaReady: Promise<void> | null = null;

export function ensureFlowEventsSchema(db: Queryable): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.query(FLOW_EVENTS_SCHEMA_SQL).then(() => undefined, (error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function resetFlowEventsSchemaForTest(): void {
  schemaReady = null;
}

type Kind = 'count' | 'bool' | 'code' | { enum: readonly string[] } | { enumOrNull: readonly string[] };

const RENDER_MODES = ['composed', 'flat'] as const;

/** Field cho phép theo event. `count` = số nguyên ≥ 0; `code` = chuỗi ngắn [A-Za-z0-9_-:.]. */
const EVENT_PROPS: Record<FlowAnalyticsEventName, Record<string, Kind>> = {
  flow_opened: { source: { enum: ['direct', 'template_url', 'doc', 'form'] } },
  flow_run_started: { ai_calls: 'count', reusable: 'count', render_mode: { enum: RENDER_MODES }, ratio_count: 'count', from_node: 'bool' },
  flow_run_completed: { duration_ms: 'count', render_mode: { enum: RENDER_MODES }, image_count: 'count', reused: 'count' },
  flow_run_failed: { code: 'code', duration_ms: 'count', render_mode: { enumOrNull: RENDER_MODES } },
  flow_view_switched: { view: { enum: ['simple', 'canvas'] } },
  flow_template_used: { source: { enum: ['default', 'url', 'picker', 'empty_canvas'] } },
};

const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const MAX_COUNT = 10_000_000;

function valid(kind: Kind, v: unknown): boolean {
  if (kind === 'count') return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;
  if (kind === 'bool') return typeof v === 'boolean';
  if (kind === 'code') return typeof v === 'string' && ID.test(v);
  if ('enum' in kind) return typeof v === 'string' && kind.enum.includes(v);
  return v === null || (typeof v === 'string' && kind.enumOrNull.includes(v));
}

export interface FlowEventRow {
  event: FlowAnalyticsEventName;
  sessionId: string;
  docId: string | null;
  templateId: string | null;
  timestamp: number;
  props: Record<string, unknown>;
}

const optId = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === 'string' && ID.test(v) ? v : undefined;

/** Body → row; sai bất kỳ field nào (thiếu, thừa, sai kiểu) → null. Timestamp lệch quá 1 ngày → dùng giờ server. */
export function parseFlowEvent(body: unknown, now = Date.now()): FlowEventRow | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { event, session_id, doc_id, template_id, timestamp, ...rest } = body as Record<string, unknown>;
  if (typeof event !== 'string' || !(event in EVENT_PROPS)) return null;
  const spec = EVENT_PROPS[event as FlowAnalyticsEventName];
  if (typeof session_id !== 'string' || !ID.test(session_id)) return null;
  const docId = optId(doc_id);
  const templateId = optId(template_id);
  if (docId === undefined || templateId === undefined) return null;
  const keys = Object.keys(rest);
  if (keys.length !== Object.keys(spec).length || !keys.every((k) => k in spec && valid(spec[k]!, rest[k]))) return null;
  const ts = typeof timestamp === 'number' && Number.isFinite(timestamp) && Math.abs(timestamp - now) < 86_400_000
    ? Math.round(timestamp) : now;
  return { event: event as FlowAnalyticsEventName, sessionId: session_id, docId, templateId, timestamp: ts, props: rest };
}

export async function insertFlowEvent(db: Queryable, userId: string, row: FlowEventRow): Promise<void> {
  await db.query(
    `INSERT INTO flow_events (event_name, user_id, session_id, doc_id, template_id, timestamp, props)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [row.event, userId, row.sessionId, row.docId, row.templateId, row.timestamp, JSON.stringify(row.props)],
  );
}
