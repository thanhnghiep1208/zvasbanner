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
  cost_usd NUMERIC(12, 4),
  generation_success BOOLEAN,
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  image_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_banner_events_event_name
  ON banner_events (event_name);

CREATE INDEX IF NOT EXISTS idx_banner_events_user_id
  ON banner_events (user_id);

CREATE INDEX IF NOT EXISTS idx_banner_events_timestamp
  ON banner_events (timestamp);

-- Dashboard aggregates: time range + event_name filters
CREATE INDEX IF NOT EXISTS idx_banner_events_ts_event
  ON banner_events (timestamp DESC, event_name);

-- Top Users: time range + GROUP BY user_id
CREATE INDEX IF NOT EXISTS idx_banner_events_ts_user
  ON banner_events (timestamp DESC, user_id);
