-- Flow canvas project (T6.1). Tự tạo lúc API chạy lần đầu (lib/flow-server/flow-docs.ts – FLOW_DOCS_SCHEMA_SQL);
-- file này để tham khảo / chạy tay. Giữ đồng bộ với FLOW_DOCS_SCHEMA_SQL.
CREATE TABLE IF NOT EXISTS flow_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  template_id TEXT,
  doc JSONB NOT NULL,             -- StoredFlowDoc (lib/flow/persistence.ts), không có ảnh (Q7B)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flow_docs_user_updated
  ON flow_docs (user_id, updated_at DESC);
