import type { FlowEdge, FlowGraph, FlowNode } from './schema';
import type { ExposedParam } from './template/template';
import { FLOW_SCHEMA_VERSION, makeEdgeId } from './schema';
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
  const doc = convertComposedDoc(migrateFlowDoc(raw));
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

/* ── Gỡ chế độ Ghép layer (2026-10-20) ───────────────────────── */

/** Node của chế độ Ghép layer đã gỡ (Auto layout → Tạo nền → Ghép layer). */
export const REMOVED_COMPOSED_TYPES: ReadonlySet<string> = new Set(['auto-layout', 'generate-background', 'compose']);

type RawNode = { id: string; type: string; params: Record<string, unknown>; position: { x: number; y: number } };

/**
 * Project/nháp cũ dùng Ghép layer → đổi sang Tạo banner để vẫn mở và chạy được: bỏ 3 node đã gỡ, nối các
 * input của chúng (kích thước, brief, ảnh, chữ, phong cách, brand kit, ảnh tham chiếu) vào 1 node Tạo banner đặt chỗ
 * node Tạo nền cũ, rồi nối ra Xuất ảnh. Graph đã có Tạo banner thì chỉ bỏ node cũ. Field Simple view trỏ vào node đã
 * bỏ hoặc vào kiểu chữ (chỉ có nghĩa khi ghép) cũng bỏ. Graph không có node cũ → trả nguyên.
 */
export function convertComposedDoc(doc: StoredFlowDoc): StoredFlowDoc {
  const g = doc.graph as unknown as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(g?.nodes) || !Array.isArray(g.edges)) return doc;
  const nodes = g.nodes as RawNode[];
  const edges = g.edges as FlowEdge[];
  const removed = nodes.filter((n) => isObj(n) && REMOVED_COMPOSED_TYPES.has(n.type));
  if (!removed.length) return doc;

  const removedIds = new Set(removed.map((n) => n.id));
  const keptNodes = nodes.filter((n) => !removedIds.has(n.id));
  const keptEdges = edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target));
  const exportNode = keptNodes.find((n) => n.type === 'export');
  const out: FlowGraph = { nodes: keptNodes as FlowNode[], edges: keptEdges };

  if (!keptNodes.some((n) => n.type === 'generate-flat')) {
    const gen = removed.find((n) => n.type === 'generate-background');
    const used = new Set(keptNodes.map((n) => n.id));
    let id = 'n-generate-flat';
    for (let k = 2; used.has(id); k++) id = `n-generate-flat-${k}`;
    const model = gen?.params.model === 'nano-banana-pro' ? 'nano-banana-pro' : 'nano-banana-2';
    out.nodes = [...out.nodes, {
      id, type: 'generate-flat', params: { model, strictPreserveMode: true },
      position: (gen ?? removed[0]!).position,
    } as FlowNode];
    // Port của node cũ trùng tên port của Tạo banner (ratio, brief, product, text, style, brand, image).
    const seen = new Set<string>();
    for (const e of edges) {
      if (!removedIds.has(e.target) || removedIds.has(e.source)) continue;
      if (!['ratio', 'brief', 'product', 'text', 'style', 'brand', 'image'].includes(e.targetPort)) continue;
      const key = `${e.source}.${e.sourcePort}.${e.targetPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.edges.push({ id: makeEdgeId(e.source, e.sourcePort, id, e.targetPort), source: e.source, sourcePort: e.sourcePort,
        target: id, targetPort: e.targetPort });
    }
    if (exportNode && !out.edges.some((e) => e.target === exportNode.id)) {
      out.edges.push({ id: makeEdgeId(id, 'raster', exportNode.id, 'raster'), source: id, sourcePort: 'raster',
        target: exportNode.id, targetPort: 'raster' });
    }
  }

  const textIds = new Set(keptNodes.filter((n) => n.type === 'text-layer').map((n) => n.id));
  const exposed = doc.exposed?.filter((e) => !removedIds.has(e.nodeId) && !(textIds.has(e.nodeId) && e.path?.[0] === 'style'));
  return { ...doc, graph: out, ...(doc.exposed ? { exposed } : {}) };
}

/** Tên project: cắt khoảng trắng, giới hạn độ dài; rỗng → mặc định. */
export function normalizeDocTitle(raw: unknown, fallback = 'Banner chưa đặt tên'): string {
  const t = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  return (t || fallback).slice(0, FLOW_DOC_LIMITS.maxTitleLength);
}
