-- Analytics Flow canvas (T6.3, Q12). Tự tạo lúc /api/flow/track ghi lần đầu
-- (lib/flow-server/flow-events.ts – FLOW_EVENTS_SCHEMA_SQL); file này để tham khảo / chạy tay.
CREATE TABLE IF NOT EXISTS flow_events (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,           -- FlowAnalyticsEventName (lib/analytics-events.ts)
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,           -- 1 lần tải trang /flow
  doc_id TEXT,                        -- project đã lưu (flow_docs.id), nếu có
  template_id TEXT,
  timestamp BIGINT NOT NULL,          -- ms
  props JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_flow_events_ts_event ON flow_events (timestamp DESC, event_name);
CREATE INDEX IF NOT EXISTS idx_flow_events_user ON flow_events (user_id, timestamp DESC);

-- Ví dụ: tỉ lệ chạy thành công + thời gian trung vị theo render mode, 7 ngày
-- SELECT props->>'render_mode' AS mode,
--        count(*) FILTER (WHERE event_name = 'flow_run_completed') AS ok,
--        count(*) FILTER (WHERE event_name = 'flow_run_failed') AS failed,
--        percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'duration_ms')::int)
--          FILTER (WHERE event_name = 'flow_run_completed') AS p50_ms
-- FROM flow_events
-- WHERE timestamp > extract(epoch from now() - interval '7 days') * 1000
-- GROUP BY 1;
