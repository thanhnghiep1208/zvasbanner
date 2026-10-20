/**
 * Thao tác node Text không qua kéo thả: tạo params mặc định (dùng chung với store.addNode) và điền chữ gợi ý
 * từ brief (copy-suggest.ts) vào đúng node theo vai trò – thiếu node thì tạo và nối dây như các Text khác.
 */
import type { CopyRole, CopyVariant } from './copy-suggest';
import { NODE_DEFINITIONS } from './node-definitions';
import { makeEdgeId, type FlowGraph, type FlowNode, type NodeParamsMap, type TextRole } from './schema';
import { TEXT_ROLE_DEFAULTS } from './text/text-style';

type TextParams = NodeParamsMap['text-layer'];

const PRIORITY: Record<TextRole, number> = { headline: 1, subheadline: 2, cta: 3, custom: 4 };

/** Params cho Text mới theo vai trò (flat: AI vẽ chữ theo nội dung + vai trò). */
export function newTextLayerParams(graph: FlowGraph, id: string, role: TextRole = 'headline', content = ''): TextParams {
  const params = structuredClone(NODE_DEFINITIONS['text-layer'].defaultParams);
  const d = TEXT_ROLE_DEFAULTS[role];
  Object.assign(params, {
    layerId: id, role, content, priority: PRIORITY[role], minFontSizePx: d.minFontSizePx, style: structuredClone(d.style),
  });
  return params;
}

function nextTextId(graph: FlowGraph): string {
  const used = new Set(graph.nodes.map((n) => n.id));
  let k = 1;
  while (used.has(`n-text-layer-${k}`)) k++;
  return `n-text-layer-${k}`;
}

/** Nối giống các Text đang có; chưa có Text nào → mọi ô vào kiểu text. */
function textTargets(graph: FlowGraph): { target: string; targetPort: string }[] {
  const texts = new Set(graph.nodes.filter((n) => n.type === 'text-layer').map((n) => n.id));
  const seen = new Map<string, { target: string; targetPort: string }>();
  for (const e of graph.edges) {
    if (texts.has(e.source) && e.sourcePort === 'text') seen.set(`${e.target}.${e.targetPort}`, { target: e.target, targetPort: e.targetPort });
  }
  if (seen.size) return [...seen.values()];
  return graph.nodes.flatMap((n) =>
    NODE_DEFINITIONS[n.type].inputs.filter((p) => p.type === 'text').map((p) => ({ target: n.id, targetPort: p.id })));
}

/** Dưới node Text thấp nhất; chưa có Text → dưới node Brief; không có gì → góc trên trái. */
function nextTextPosition(graph: FlowGraph): { x: number; y: number } {
  const anchors = graph.nodes.filter((n) => n.type === 'text-layer');
  const pool = anchors.length ? anchors : graph.nodes.filter((n) => n.type === 'brief');
  if (!pool.length) return { x: 0, y: 0 };
  const x = pool[0]!.position.x;
  const bottom = Math.max(...graph.nodes.filter((n) => Math.abs(n.position.x - x) < 200).map((n) => n.position.y));
  return { x, y: bottom + 200 };
}

/**
 * Điền 1 phương án chữ: mỗi vai trò có chữ → Text đầu tiên cùng vai trò nhận nội dung; chưa có → thêm Text mới,
 * nối dây. Vai trò để trống trong phương án thì không đụng tới.
 */
export function applyCopy(graph: FlowGraph, copy: Partial<CopyVariant>): { graph: FlowGraph; added: CopyRole[] } {
  let g = graph;
  const added: CopyRole[] = [];
  for (const role of ['headline', 'subheadline', 'cta'] as const) {
    const content = copy[role]?.trim();
    if (!content) continue;
    const existing = g.nodes.find((n) => n.type === 'text-layer' && (n.params as TextParams).role === role);
    if (existing) {
      g = { ...g, nodes: g.nodes.map((n) => (n.id === existing.id ? { ...n, params: { ...(n.params as TextParams), content } } as FlowNode : n)) };
      continue;
    }
    const id = nextTextId(g);
    const targets = textTargets(g);
    const node = { id, type: 'text-layer', params: newTextLayerParams(g, id, role, content), position: nextTextPosition(g) } as FlowNode;
    g = {
      nodes: [...g.nodes, node],
      edges: [...g.edges, ...targets.map(({ target, targetPort }) => ({
        id: makeEdgeId(id, 'text', target, targetPort), source: id, sourcePort: 'text', target, targetPort,
      }))],
    };
    added.push(role);
  }
  return { graph: g, added };
}
