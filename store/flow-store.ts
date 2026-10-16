/**
 * Flow store – slice riêng, KHÔNG gộp vào store hiện có.
 * KHÔNG dùng persist middleware (SPEC 2.5): graph lưu Postgres qua StoredFlowDoc (T6.1).
 *
 * `graph` (domain) là source of truth. Trạng thái chỉ dùng cho hiển thị của React Flow
 * (đang chọn, đang kéo, kích thước đo được) để riêng trong `nodeUi`/`edgeUi`, không đi vào graph.
 * RF nodes/edges được dẫn xuất bằng `selectRFNodes`/`selectRFEdges`.
 */
import { create } from 'zustand';
import type { Connection, Edge, EdgeChange, Node, NodeChange, XYPosition } from '@xyflow/react';
import type { ConnectionResult } from '@/lib/flow/connection-rules';
import type { FlowGraph, FlowNode, NodeParamsMap, NodeType } from '@/lib/flow/schema';
import { attemptToEdge, toConnectionAttempt, toRFEdge, toRFNode, type FlowRFNode } from '@/lib/flow-ui/rf-adapter';
import { checkConnection } from '@/lib/flow-ui/connection-feedback';
import { summarizeNode } from '@/lib/flow-ui/node-summary';
import { NODE_DEFINITIONS } from '@/lib/flow/node-definitions';
import type { NodeRunInfo } from '@/lib/flow/run-state';
import { FONT_FOR_STYLE } from '@/lib/flow/text/text-style';
import { fontIdFromLabel } from '@/lib/flow/brand';
import {
  instantiateTemplate, setExposedValue, type ExposedParam, type FlowTemplate,
} from '@/lib/flow/template/template';
import { DEFAULT_TEMPLATES } from '@/lib/flow/template/defaults';
import type { RatioResult } from '@/lib/flow/executor';
import type { StoredFlowDoc } from '@/lib/flow/persistence';

type NodeUi = Pick<Node, 'selected' | 'dragging' | 'measured'>;
export type FlowView = 'simple' | 'canvas';
type EdgeUi = Pick<Edge, 'selected'>;

type FlowState = {
  graph: FlowGraph;
  /** Tăng mỗi lần thay cả graph (setGraph/reset) – canvas dùng để fitView lại. */
  graphVersion: number;
  /** Template đang dùng + param lộ ra cho Simple view (T5.1). Rỗng = graph tự dựng ở Canvas view. */
  templateId: string | null;
  exposed: ExposedParam[];
  /** Graph ngay sau loadTemplate – `graph !== templateBaseline` nghĩa là user đã sửa (đổi template cần xác nhận). */
  templateBaseline: FlowGraph | null;
  /** Project đã lưu đang mở (T6.1). null = chưa lưu lần nào. */
  docId: string | null;
  docTitle: string;
  /** Graph lúc lưu/mở gần nhất – `graph !== savedGraph` nghĩa là có thay đổi chưa lưu. */
  savedGraph: FlowGraph | null;
  /** Mở project đã lưu: graph + exposed/templateId của project, Simple view nếu có exposed. */
  loadDoc: (d: { id: string; title: string; doc: StoredFlowDoc }) => void;
  /** Mở lại bản nháp trên máy (tự lưu): coi như đã sửa (không có baseline/savedGraph) để đổi template/lưu đều hỏi đúng. */
  restoreDraft: (d: {
    graph: FlowGraph; exposed: ExposedParam[]; templateId: string | null; docId: string | null; docTitle: string;
    view: FlowView;
  }) => void;
  /** Sau khi lưu xong: `graph` là graph đã gửi đi (user có thể sửa tiếp trong lúc chờ). */
  markSaved: (d: { id: string; title: string; graph: FlowGraph }) => void;
  setDocTitle: (title: string) => void;
  /** Simple view (form từ exposed) hay Canvas view – cùng 1 graph (SPEC 5.7, T5.2). */
  view: FlowView;
  setView: (view: FlowView) => void;
  /** Bắt đầu từ template: graph + exposed (bản sao độc lập), mở Simple view. */
  loadTemplate: (t: FlowTemplate) => void;
  /** Ghi 1 field Simple view thẳng vào graph (graph là source of truth). */
  setExposed: (e: ExposedParam, value: unknown) => void;
  nodeUi: Record<string, NodeUi>;
  edgeUi: Record<string, EdgeUi>;
  /** Trạng thái chạy theo node; executor ghi (T2.6). */
  runInfo: Record<string, NodeRunInfo>;
  /** dataUrl theo assetId – chỉ có lúc chạy, không persist (= LegacyRuntime.dataUrls). */
  assetData: Record<string, string>;
  /** Kết quả lần chạy gần nhất theo ratio (ảnh data URL, không persist). */
  results: RatioResult[];
  isRunning: boolean;
  setRunInfo: (nodeId: string, info: NodeRunInfo) => void;
  /** Bắt đầu lần chạy mới: xoá trạng thái + kết quả cũ. */
  startRun: () => void;
  finishRun: (results: RatioResult[]) => void;
  setGraph: (graph: FlowGraph) => void;
  /** Thêm node với params mặc định, chọn node mới; trả id. */
  addNode: (type: NodeType, position: XYPosition) => string;
  /** Gộp nông `patch` vào params (field lồng nhau: truyền cả giá trị mới). */
  updateNodeParams: <T extends NodeType>(nodeId: string, patch: Partial<NodeParamsMap[T]>) => void;
  setAssetData: (assetId: string, dataUrl: string) => void;
  /** Thay graph bằng biến đổi thuần (vd. image-nodes) – giữ exposed/template/doc, bỏ ui của node đã mất. */
  editGraph: (fn: (graph: FlowGraph) => FlowGraph) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Thêm edge nếu `canConnect()` cho phép; trả kết quả để UI báo lỗi. */
  connect: (connection: Connection) => ConnectionResult;
  reset: () => void;
};

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

/** Mở /flow không bao giờ ra canvas trống (SPEC 5.6, T5.4): state đầu = template mặc định, Simple view. */
function initialFromTemplate(t: FlowTemplate) {
  const { graph, exposed, templateId } = instantiateTemplate(t);
  return {
    graph, exposed, templateId, templateBaseline: graph, view: 'simple' as FlowView,
    docId: null, docTitle: t.name, savedGraph: null,
  };
}

export const useFlowStore = create<FlowState>()((set, get) => ({
  ...initialFromTemplate(DEFAULT_TEMPLATES[0]!),
  graphVersion: 0,

  // Simple view chỉ có nghĩa khi có exposed; không có thì luôn Canvas.
  setView: (view) => set((s) => ({ view: view === 'simple' && !s.exposed.length ? 'canvas' : view })),

  loadTemplate: (t) => {
    const { graph, exposed, templateId } = instantiateTemplate(t);
    get().setGraph(graph);
    set({ exposed, templateId, templateBaseline: graph, view: exposed.length ? 'simple' : 'canvas', docTitle: t.name });
  },

  restoreDraft: ({ graph, exposed, templateId, docId, docTitle, view }) => {
    get().setGraph(graph);
    set({
      exposed, templateId, templateBaseline: null, view: view === 'simple' && exposed.length ? 'simple' : 'canvas',
      docId, docTitle, savedGraph: null,
    });
  },

  loadDoc: ({ id, title, doc }) => {
    get().setGraph(doc.graph);
    const exposed = doc.exposed ?? [];
    set({
      exposed, templateId: doc.templateId ?? null, templateBaseline: doc.graph, view: exposed.length ? 'simple' : 'canvas',
      docId: id, docTitle: title, savedGraph: doc.graph,
    });
  },

  markSaved: ({ id, title, graph }) => set({ docId: id, docTitle: title, savedGraph: graph }),
  setDocTitle: (docTitle) => set({ docTitle }),

  setExposed: (e, value) => set((s) => ({ graph: setExposedValue(s.graph, e, value) })),
  nodeUi: {},
  edgeUi: {},
  runInfo: {},
  assetData: {},
  results: [],
  isRunning: false,

  setRunInfo: (nodeId, info) => set((s) => ({ runInfo: { ...s.runInfo, [nodeId]: info } })),
  startRun: () => set({ runInfo: {}, results: [], isRunning: true }),
  finishRun: (results) => set({ results, isRunning: false }),

  // Graph tự dựng/nạp ngoài template → bỏ exposed cũ (loadTemplate gắn lại sau khi gọi setGraph).
  setGraph: (graph) =>
    set((s) => ({
      graph, graphVersion: s.graphVersion + 1, nodeUi: {}, edgeUi: {}, runInfo: {}, results: [], templateId: null, exposed: [],
      templateBaseline: null, view: 'canvas', docId: null, docTitle: 'Banner chưa đặt tên', savedGraph: null,
    })),

  addNode: (type, position) => {
    const { graph, nodeUi } = get();
    const id = nextNodeId(graph, type);
    const params = structuredClone(NODE_DEFINITIONS[type].defaultParams) as NodeParamsMap[typeof type];
    if (type === 'text-layer') {
      const text = params as NodeParamsMap['text-layer'];
      text.layerId = id;
      // Text mới: tự chọn font/cỡ/màu theo banner; user tắt trong Inspector nếu muốn chỉnh tay.
      text.autoStyle = true;
      // Font mặc định: font thương hiệu (Brand kit, T4.5) > kiểu chữ của node Phong cách (Q10B).
      const brandNode = graph.nodes.find((n) => n.type === 'brand-kit');
      const styleNode = graph.nodes.find((n) => n.type === 'style');
      const brandFont = fontIdFromLabel((brandNode?.params as NodeParamsMap['brand-kit'] | undefined)?.fontPreference);
      if (brandFont) text.style.fontFamily = brandFont;
      else if (styleNode) text.style.fontFamily = FONT_FOR_STYLE[(styleNode.params as NodeParamsMap['style']).fontStyle];
    }
    const node = { id, type, params, position: { x: position.x, y: position.y } } as FlowNode;
    const deselected = Object.fromEntries(
      Object.entries(nodeUi).map(([k, v]) => [k, { ...v, selected: false }]),
    );
    set({ graph: { ...graph, nodes: [...graph.nodes, node] }, nodeUi: { ...deselected, [id]: { selected: true } } });
    return id;
  },

  updateNodeParams: (nodeId, patch) =>
    set((s) => ({
      graph: {
        ...s.graph,
        nodes: s.graph.nodes.map((n) =>
          n.id === nodeId ? ({ ...n, params: { ...n.params, ...patch } } as FlowNode) : n),
      },
    })),

  setAssetData: (assetId, dataUrl) => set((s) => ({ assetData: { ...s.assetData, [assetId]: dataUrl } })),

  editGraph: (fn) =>
    set((s) => {
      const graph = fn(s.graph);
      if (graph === s.graph) return {};
      const ids = new Set(graph.nodes.map((n) => n.id));
      const edgeIds = new Set(graph.edges.map((e) => e.id));
      return {
        graph,
        nodeUi: Object.fromEntries(Object.entries(s.nodeUi).filter(([id]) => ids.has(id))),
        edgeUi: Object.fromEntries(Object.entries(s.edgeUi).filter(([id]) => edgeIds.has(id))),
      };
    }),

  onNodesChange: (changes) =>
    set((s) => {
      let nodes = s.graph.nodes;
      let edges = s.graph.edges;
      const nodeUi = { ...s.nodeUi };
      const edgeUi = { ...s.edgeUi };
      const removed = new Set<string>();

      for (const c of changes) {
        switch (c.type) {
          case 'position':
            if (c.position) {
              const position = { x: c.position.x, y: c.position.y };
              nodes = nodes.map((n) => (n.id === c.id ? { ...n, position } : n));
            }
            nodeUi[c.id] = { ...nodeUi[c.id], dragging: c.dragging };
            break;
          case 'dimensions':
            if (c.dimensions) nodeUi[c.id] = { ...nodeUi[c.id], measured: c.dimensions };
            break;
          case 'select':
            nodeUi[c.id] = { ...nodeUi[c.id], selected: c.selected };
            break;
          case 'remove':
            removed.add(c.id);
            break;
          // 'add' / 'replace': node chỉ được thêm/thay qua action của store, không qua React Flow.
        }
      }

      if (removed.size) {
        nodes = nodes.filter((n) => !removed.has(n.id));
        const dropped = edges.filter((e) => removed.has(e.source) || removed.has(e.target));
        edges = edges.filter((e) => !dropped.includes(e));
        for (const id of removed) delete nodeUi[id];
        for (const e of dropped) delete edgeUi[e.id];
      }
      // Chỉ đổi ui (select, dimensions, dragging) → giữ nguyên object graph để không dẫn xuất lại.
      const graph = nodes === s.graph.nodes && edges === s.graph.edges ? s.graph : { nodes, edges };
      return { graph, nodeUi, edgeUi };
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      let edges = s.graph.edges;
      const edgeUi = { ...s.edgeUi };
      for (const c of changes) {
        if (c.type === 'select') edgeUi[c.id] = { selected: c.selected };
        if (c.type === 'remove') {
          edges = edges.filter((e) => e.id !== c.id);
          delete edgeUi[c.id];
        }
      }
      return { graph: edges === s.graph.edges ? s.graph : { ...s.graph, edges }, edgeUi };
    }),

  connect: (connection) => {
    const { graph } = get();
    const result = checkConnection(graph, connection);
    if (result.ok) {
      const edge = attemptToEdge(toConnectionAttempt(connection)!);
      set({ graph: { ...graph, edges: [...graph.edges, edge] } });
    }
    return result;
  },

  // Graph rỗng – cho test; UI không gọi (mở /flow luôn có template).
  reset: () =>
    set((s) => ({
      graph: EMPTY_GRAPH, graphVersion: s.graphVersion + 1, nodeUi: {}, edgeUi: {}, runInfo: {}, assetData: {},
      results: [], isRunning: false, templateId: null, exposed: [], templateBaseline: null, view: 'canvas',
      docId: null, docTitle: 'Banner chưa đặt tên', savedGraph: null,
    })),
}));

/** Id node ổn định, dễ đọc: `n-<type>-<k>` với k nhỏ nhất chưa dùng. */
export function nextNodeId(graph: FlowGraph, type: NodeType): string {
  const used = new Set(graph.nodes.map((n) => n.id));
  let k = 1;
  while (used.has(`n-${type}-${k}`)) k++;
  return `n-${type}-${k}`;
}

const CASCADE = 32;

/** Vị trí trống gần `pos`: lệch chéo từng bước nếu đã có node đặt (gần) đúng chỗ đó. */
export function freePosition(graph: FlowGraph, pos: XYPosition): XYPosition {
  let p = { x: pos.x, y: pos.y };
  const taken = (q: XYPosition) =>
    graph.nodes.some((n) => Math.abs(n.position.x - q.x) < CASCADE / 2 && Math.abs(n.position.y - q.y) < CASCADE / 2);
  for (let i = 0; i < 50 && taken(p); i++) p = { x: p.x + CASCADE, y: p.y + CASCADE };
  return p;
}

/** Node đang chọn duy nhất (Inspector chỉ sửa khi chọn đúng 1 node). */
export function selectSingleSelectedNode(graph: FlowGraph, nodeUi: Record<string, NodeUi>): FlowNode | null {
  const selected = graph.nodes.filter((n) => nodeUi[n.id]?.selected);
  return selected.length === 1 ? selected[0]! : null;
}

/* ── Selectors (gọi trong useMemo theo graph + ui) ──────────── */

/**
 * Trạng thái hiển thị: node đã chạy xong mà key hiện tại (Merkle, cache-keys.ts) khác key lúc chạy → "Cần chạy lại"
 * (T4.7). Giữ preview cũ để so.
 */
export function displayRunInfo(info: NodeRunInfo | undefined, currentKey: string | undefined): NodeRunInfo | undefined {
  if (info?.state === 'done' && info.key && currentKey && info.key !== currentKey) return { ...info, state: 'stale' };
  return info;
}

export function selectRFNodes(
  graph: FlowGraph,
  nodeUi: Record<string, NodeUi>,
  runInfo: Record<string, NodeRunInfo> = {},
  currentKeys: Record<string, string> = {},
): FlowRFNode[] {
  return graph.nodes.map((n) => {
    const rf = toRFNode(n);
    const label = NODE_DEFINITIONS[n.type].label;
    const summary = summarizeNode(n);
    const run = displayRunInfo(runInfo[n.id], currentKeys[n.id]);
    return {
      ...rf,
      ...nodeUi[n.id],
      data: run ? { ...rf.data, run } : rf.data,
      ariaLabel: summary ? `${label}: ${summary}` : label,
    };
  });
}

export function selectRFEdges(graph: FlowGraph, edgeUi: Record<string, EdgeUi>): Edge[] {
  return graph.edges.map((e) => ({ ...toRFEdge(e), ...edgeUi[e.id] }));
}
