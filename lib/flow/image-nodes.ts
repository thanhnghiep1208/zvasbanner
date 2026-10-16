/**
 * Thao tác trên node ảnh (product-asset / reference-image) cho Simple view: thêm nhiều ảnh, đổi loại ảnh, xoá ảnh.
 * Loại ảnh quyết định node type: ảnh giữ pixel (sản phẩm, logo, trang trí) → product-asset (ô ra `product`);
 * ảnh cho AI tham chiếu (style, nền) → reference-image (ô ra `image`). Đổi qua lại giữa hai nhóm = đổi type + nối lại dây.
 */
import { NODE_DEFINITIONS } from './node-definitions';
import {
  makeEdgeId, type FlowAsset, type FlowEdge, type FlowGraph, type FlowNode, type PixelAssetRole,
} from './schema';
import type { AssetRole } from '@/lib/types';

export type ImageNodeType = 'product-asset' | 'reference-image';
export type ImageNode = FlowNode<'product-asset'> | FlowNode<'reference-image'>;

const PIXEL_ROLES: readonly AssetRole[] = ['image', 'logo', 'decoration'] satisfies PixelAssetRole[];
const PORT: Record<ImageNodeType, 'product' | 'image'> = { 'product-asset': 'product', 'reference-image': 'image' };

export function isImageNode(n: FlowNode): n is ImageNode {
  return n.type === 'product-asset' || n.type === 'reference-image';
}

export function imageNodeTypeForRole(role: AssetRole): ImageNodeType {
  return PIXEL_ROLES.includes(role) ? 'product-asset' : 'reference-image';
}

/**
 * Nơi node ảnh loại `type` cần nối tới: giống các node ảnh cùng loại đang có (giữ đúng cách template nối);
 * chưa có node cùng loại → mọi node có ô vào cùng kiểu port.
 */
function targetsFor(graph: FlowGraph, type: ImageNodeType, exceptId: string): { target: string; targetPort: string }[] {
  const port = PORT[type];
  const sameType = new Set(graph.nodes.filter((n) => n.type === type && n.id !== exceptId).map((n) => n.id));
  const seen = new Map<string, { target: string; targetPort: string }>();
  for (const e of graph.edges) {
    if (sameType.has(e.source) && e.sourcePort === port) seen.set(`${e.target}.${e.targetPort}`, { target: e.target, targetPort: e.targetPort });
  }
  if (seen.size) return [...seen.values()];
  return graph.nodes.flatMap((n) =>
    NODE_DEFINITIONS[n.type].inputs.filter((p) => p.type === port).map((p) => ({ target: n.id, targetPort: p.id })));
}

/** Bỏ mọi dây ra của node rồi nối lại theo type hiện tại. */
function rewire(graph: FlowGraph, nodeId: string, type: ImageNodeType): FlowEdge[] {
  const port = PORT[type];
  const kept = graph.edges.filter((e) => e.source !== nodeId);
  const added = targetsFor(graph, type, nodeId).map(({ target, targetPort }) => ({
    id: makeEdgeId(nodeId, port, target, targetPort), source: nodeId, sourcePort: port, target, targetPort,
  }));
  return [...kept, ...added];
}

function nextImageId(graph: FlowGraph): string {
  const used = new Set(graph.nodes.map((n) => n.id));
  let k = 0;
  while (used.has(`n-image-${k}`)) k++;
  return `n-image-${k}`;
}

/** Vị trí node ảnh mới: ngay dưới node ảnh thấp nhất (cùng cột), không có thì góc trên trái. */
function nextImagePosition(graph: FlowGraph): { x: number; y: number } {
  const images = graph.nodes.filter(isImageNode);
  if (!images.length) return { x: 0, y: 0 };
  const last = images.reduce((a, b) => (b.position.y > a.position.y ? b : a));
  return { x: last.position.x, y: last.position.y + 280 };
}

/** Thêm node ảnh (type theo `asset.role`), nối dây như ảnh cùng loại đang có. */
export function addImageNode(graph: FlowGraph, asset: FlowAsset): { graph: FlowGraph; id: string } {
  const id = nextImageId(graph);
  const type = imageNodeTypeForRole(asset.role);
  const node = { id, type, params: asset, position: nextImagePosition(graph) } as ImageNode;
  const withNode = { ...graph, nodes: [...graph.nodes, node] };
  return { graph: { ...withNode, edges: rewire(withNode, id, type) }, id };
}

/** Đổi loại ảnh. Cùng nhóm → chỉ đổi role; khác nhóm → đổi type node (giữ id, vị trí, ảnh) và nối lại dây. */
export function setImageRole(graph: FlowGraph, nodeId: string, role: AssetRole): FlowGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || !isImageNode(node)) return graph;
  const type = imageNodeTypeForRole(role);
  const next = { ...node, type, params: { ...node.params, role } } as ImageNode;
  const nodes = graph.nodes.map((n) => (n.id === nodeId ? next : n));
  if (type === node.type) return { ...graph, nodes };
  return { nodes, edges: rewire({ ...graph, nodes }, nodeId, type) };
}

/** Làm trống ảnh của node (giữ node, dây, vai trò) – dùng cho ô ảnh template cần giữ lại. */
export function clearImageNode(graph: FlowGraph, nodeId: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId && isImageNode(n)
      ? ({ ...n, params: { ...NODE_DEFINITIONS[n.type].defaultParams, role: n.params.role } } as ImageNode) : n)),
  };
}

/** Node ảnh đã có ảnh (node trống – vd. ô ảnh template chưa tải – không tính). */
export function filledImageNodes(graph: FlowGraph): ImageNode[] {
  return graph.nodes.filter(isImageNode).filter((n) => n.params.assetId);
}

/**
 * Bỏ mọi ảnh đã tải: node nằm trong `keep` (ô ảnh template lộ ra ở Simple view) chỉ làm trống, còn lại xoá node + dây.
 */
export function removeAllImages(graph: FlowGraph, keep: ReadonlySet<string>): FlowGraph {
  let g = graph;
  for (const n of filledImageNodes(graph)) g = keep.has(n.id) ? clearImageNode(g, n.id) : removeImageNode(g, n.id);
  return g;
}

/** Xoá node ảnh cùng dây nối của nó. */
export function removeImageNode(graph: FlowGraph, nodeId: string): FlowGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  };
}
