CREATE TABLE IF NOT EXISTS banner_events (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  banner_id TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  style TEXT,
  canvas_size TEXT,
  has_asset BOOLEAN,
  generation_time_ms INTEGER,
  regenerate_count INTEGER,
  exported BOOLEAN,
  cost_usd NUMERIC(12, 4)
);

CREATE INDEX IF NOT EXISTS idx_banner_events_event_name
  ON banner_events (event_name);

CREATE INDEX IF NOT EXISTS idx_banner_events_user_id
  ON banner_events (user_id);

CREATE INDEX IF NOT EXISTS idx_banner_events_timestamp
  ON banner_events (timestamp);
