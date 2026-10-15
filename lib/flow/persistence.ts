import type { FlowGraph } from './schema';
import type { ExposedParam } from './template/template';
import { FLOW_SCHEMA_VERSION } from './schema';
import { NODE_DEFINITIONS } from './node-definitions';

/** Lưu vào Postgres (bảng flow_docs, cột JSONB – T6.1). Không lưu ảnh (Q7B): node ảnh chỉ giữ metadata. */
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

/* ── Lưu/tải qua API (T6.1) ──────────────────────────────────── */

export const FLOW_DOC_LIMITS = { maxNodes: 200, maxEdges: 600, maxTitleLength: 120 } as const;

const ASSET_NODE_TYPES = new Set(['product-asset', 'reference-image']);

/**
 * P1 không có kho lưu ảnh (Q7B): bỏ `url` (blob:/data:, chết khi tải lại trang) của node ảnh trước khi lưu.
 * Giữ assetId/fileName/role/hasAlpha/originalDims – mở lại thì node báo "Cần tải lại ảnh", layout vẫn đúng tỉ lệ.
 */
export function stripRuntimeAssets(graph: FlowGraph): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      ASSET_NODE_TYPES.has(n.type) && (n.params as { url?: string }).url
        ? ({ ...n, params: { ...n.params, url: '' } } as typeof n)
        : n),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Doc nhận từ client/DB → StoredFlowDoc đã migrate. Kiểm cấu trúc (không kiểm nghiệp vụ – validateGraph lo phần đó
 * khi mở): node có id/type đã đăng ký/position/params, edge trỏ node có thật, giới hạn số lượng. Ném Error tiếng Việt.
 */
const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.keys(NODE_DEFINITIONS));

export function parseStoredFlowDoc(raw: unknown): StoredFlowDoc {
  const doc = migrateFlowDoc(raw);
  const g = doc.graph as unknown;
  if (!isObj(g) || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error('Graph không hợp lệ.');
  if (g.nodes.length > FLOW_DOC_LIMITS.maxNodes) throw new Error(`Graph quá ${FLOW_DOC_LIMITS.maxNodes} node.`);
  if (g.edges.length > FLOW_DOC_LIMITS.maxEdges) throw new Error(`Graph quá ${FLOW_DOC_LIMITS.maxEdges} dây.`);
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (!isObj(n) || typeof n.id !== 'string' || !n.id || typeof n.type !== 'string' || !KNOWN_TYPES.has(n.type)
      || !isObj(n.params) || !isObj(n.position) || !isNum(n.position.x) || !isNum(n.position.y)) {
      throw new Error('Node không hợp lệ.');
    }
    if (ids.has(n.id)) throw new Error(`Trùng id node ${n.id}.`);
    ids.add(n.id);
  }
  for (const e of g.edges) {
    if (!isObj(e) || !['id', 'source', 'sourcePort', 'target', 'targetPort'].every((k) => typeof e[k] === 'string')
      || !ids.has(e.source as string) || !ids.has(e.target as string)) {
      throw new Error('Dây nối không hợp lệ.');
    }
  }
  const vp = doc.viewport as unknown;
  if (vp !== undefined && !(isObj(vp) && isNum(vp.x) && isNum(vp.y) && isNum(vp.zoom))) throw new Error('Viewport không hợp lệ.');
  if (doc.exposed !== undefined && !Array.isArray(doc.exposed)) throw new Error('Exposed không hợp lệ.');
  return { ...doc, graph: stripRuntimeAssets(doc.graph) };
}

/** Tên project: cắt khoảng trắng, giới hạn độ dài; rỗng → mặc định. */
export function normalizeDocTitle(raw: unknown, fallback = 'Banner chưa đặt tên'): string {
  const t = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  return (t || fallback).slice(0, FLOW_DOC_LIMITS.maxTitleLength);
}
