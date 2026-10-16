/**
 * Lưu/tải project Flow canvas (T6.1) – bảng `flow_docs` trên Postgres hiện có (lib/db.ts).
 * Mọi truy vấn lọc theo user_id: user chỉ thấy/sửa project của mình.
 * Bảng tự tạo lần đầu (CREATE TABLE IF NOT EXISTS, giống banner_events) – SQL tham khảo: db/flow_docs.sql.
 */
import type { StoredFlowDoc } from '@/lib/flow/persistence';

/** Tối thiểu của pg.Pool mà module cần – test truyền bản giả. */
export interface Queryable {
  query<R = unknown>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export const MAX_DOCS_PER_USER = 200;

export const FLOW_DOCS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS flow_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  template_id TEXT,
  doc JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flow_docs_user_updated ON flow_docs (user_id, updated_at DESC);
`;

let schemaReady: Promise<void> | null = null;

export function ensureFlowDocsSchema(db: Queryable): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.query(FLOW_DOCS_SCHEMA_SQL).then(() => undefined, (error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Chỉ cho test: lần gọi sau chạy lại CREATE TABLE. */
export function resetFlowDocsSchemaForTest(): void {
  schemaReady = null;
}

export interface FlowDocSummary {
  id: string;
  title: string;
  templateId: string | null;
  updatedAt: string;
}

export interface FlowDocRecord extends FlowDocSummary {
  doc: unknown;
}

type Row = { id: string; title: string; template_id: string | null; updated_at: Date | string; doc?: unknown };

const toSummary = (r: Row): FlowDocSummary => ({
  id: r.id, title: r.title, templateId: r.template_id, updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listFlowDocs(db: Queryable, userId: string): Promise<FlowDocSummary[]> {
  const { rows } = await db.query<Row>(
    `SELECT id, title, template_id, updated_at FROM flow_docs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, MAX_DOCS_PER_USER],
  );
  return rows.map(toSummary);
}

/** Doc thô từ DB – route gọi parseStoredFlowDoc (migrate) trước khi trả. */
export async function getFlowDoc(db: Queryable, userId: string, id: string): Promise<FlowDocRecord | null> {
  const { rows } = await db.query<Row>(
    `SELECT id, title, template_id, updated_at, doc FROM flow_docs WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? { ...toSummary(rows[0]), doc: rows[0].doc } : null;
}

export type CreateResult = { ok: true; doc: FlowDocSummary } | { ok: false; reason: 'quota' };

export async function createFlowDoc(
  db: Queryable, userId: string, title: string, doc: StoredFlowDoc, id: string = crypto.randomUUID(),
): Promise<CreateResult> {
  // Quota và insert trong 1 câu: không vượt quota kể cả khi 2 request lưu cùng lúc (gần đúng – đủ cho P1).
  const { rows } = await db.query<Row>(
    `INSERT INTO flow_docs (id, user_id, title, template_id, doc)
     SELECT $1, $2, $3, $4, $5::jsonb
     WHERE (SELECT count(*) FROM flow_docs WHERE user_id = $2) < $6
     RETURNING id, title, template_id, updated_at`,
    [id, userId, title, doc.templateId ?? null, JSON.stringify(doc), MAX_DOCS_PER_USER],
  );
  return rows[0] ? { ok: true, doc: toSummary(rows[0]) } : { ok: false, reason: 'quota' };
}

export async function updateFlowDoc(
  db: Queryable, userId: string, id: string, title: string, doc: StoredFlowDoc,
): Promise<FlowDocSummary | null> {
  const { rows } = await db.query<Row>(
    `UPDATE flow_docs SET title = $3, template_id = $4, doc = $5::jsonb, updated_at = now()
     WHERE user_id = $1 AND id = $2
     RETURNING id, title, template_id, updated_at`,
    [userId, id, title, doc.templateId ?? null, JSON.stringify(doc)],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function deleteFlowDoc(db: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM flow_docs WHERE user_id = $1 AND id = $2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}
