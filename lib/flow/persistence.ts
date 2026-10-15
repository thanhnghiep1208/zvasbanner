import type { FlowGraph } from './schema';
import type { ExposedParam } from './template/template';
import { FLOW_SCHEMA_VERSION } from './schema';

/** Lưu vào Postgres (cột JSONB). Không lưu preview ảnh, chỉ lưu assetId/URL. */
export interface StoredFlowDoc {
  schemaVersion: number;
  graph: FlowGraph;
  viewport?: { x: number; y: number; zoom: number };
  /** Project tạo từ template (T5.1): Simple view vẽ form từ `exposed`. Field tuỳ chọn → không cần migration. */
  templateId?: string;
  exposed?: ExposedParam[];
}

export function serializeFlowDoc(
  graph: FlowGraph,
  viewport?: StoredFlowDoc['viewport'],
  meta: { templateId?: string; exposed?: ExposedParam[] } = {},
): StoredFlowDoc {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION, graph, viewport,
    ...(meta.templateId ? { templateId: meta.templateId } : {}),
    ...(meta.exposed?.length ? { exposed: meta.exposed } : {}),
  };
}

/** Mỗi lần đổi schema: thêm 1 bước vN → vN+1 vào MIGRATIONS. */
const MIGRATIONS: Record<number, (doc: StoredFlowDoc) => StoredFlowDoc> = {};

export function migrateFlowDoc(raw: unknown): StoredFlowDoc {
  if (!raw || typeof raw !== 'object' || !('schemaVersion' in raw) || !('graph' in raw)) {
    throw new Error('Flow doc không hợp lệ');
  }
  let doc = raw as StoredFlowDoc;
  if (doc.schemaVersion > FLOW_SCHEMA_VERSION) {
    throw new Error(`Flow doc v${doc.schemaVersion} mới hơn app (v${FLOW_SCHEMA_VERSION})`);
  }
  while (doc.schemaVersion < FLOW_SCHEMA_VERSION) {
    const step = MIGRATIONS[doc.schemaVersion];
    if (!step) throw new Error(`Thiếu migration từ v${doc.schemaVersion}`);
    doc = step(doc);
  }
  return doc;
}
