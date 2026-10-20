import type { FlowGraph, FlowNode } from './schema';
import { isHexColor } from './brand';
import { getDefinition, PORT_TYPE_LABELS } from './node-definitions';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/** Ảnh không nối vào đâu: compiler bỏ qua → không có mặt trên banner. */
export const ASSET_UNCONNECTED_MESSAGE = 'Ảnh chưa nối vào node nào nên sẽ không được dùng khi chạy.';

export function validateGraph(graph: FlowGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const n of graph.nodes) {
    if (!getDefinition(n.type)) {
      issues.push({ severity: 'error', code: 'unknown-node-type', nodeId: n.id,
        message: `Node type không hợp lệ: ${n.type}` });
    }
  }

  // Edge: tồn tại + đúng kiểu
  for (const e of graph.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    const sp = s && getDefinition(s.type)?.outputs.find((p) => p.id === e.sourcePort);
    const tp = t && getDefinition(t.type)?.inputs.find((p) => p.id === e.targetPort);
    if (!sp || !tp) {
      issues.push({ severity: 'error', code: 'dangling-edge', edgeId: e.id,
        message: 'Kết nối trỏ tới node hoặc port không tồn tại.' });
    } else if (sp.type !== tp.type) {
      issues.push({ severity: 'error', code: 'type-mismatch', edgeId: e.id,
        message: `Kết nối sai kiểu: ${sp.type} → ${tp.type}.` });
    }
  }

  // Port: required + capacity
  for (const n of graph.nodes) {
    const def = getDefinition(n.type);
    if (!def) continue;
    for (const port of def.inputs) {
      const count = graph.edges.filter((e) => e.target === n.id && e.targetPort === port.id).length;
      if (port.required && count === 0) {
        issues.push({ severity: 'error', code: 'missing-input', nodeId: n.id,
          message: `${def.label}: thiếu input "${PORT_TYPE_LABELS[port.type]}".` });
      }
      if (!port.multiple && count > 1) {
        issues.push({ severity: 'error', code: 'port-overloaded', nodeId: n.id,
          message: `${def.label}: port "${PORT_TYPE_LABELS[port.type]}" chỉ nhận 1 kết nối.` });
      }
    }
  }

  if (hasCycle(graph)) {
    issues.push({ severity: 'error', code: 'cycle', message: 'Graph có vòng lặp.' });
  }

  // Export: đúng 1 node, nối từ Tạo banner (thiếu dây đã báo missing-input)
  const exports = graph.nodes.filter((n) => n.type === 'export');
  if (exports.length !== 1) {
    issues.push({ severity: 'error', code: 'export-count',
      message: `Cần đúng 1 node Xuất ảnh (hiện có ${exports.length}).` });
  }
  for (const ex of exports) {
    // Kích thước xuất (T4.6): tập con phải khác rỗng và tồn tại trong node Kích thước.
    const { ratioIds } = (ex as FlowNode<'export'>).params;
    if (ratioIds !== 'all') {
      const known = new Set(graph.nodes.filter((n) => n.type === 'ratio')
        .flatMap((n) => (n as FlowNode<'ratio'>).params.ratios.map((r) => r.id)));
      const unknown = ratioIds.filter((id) => !known.has(id));
      if (!ratioIds.length) {
        issues.push({ severity: 'error', code: 'export-ratio-empty', nodeId: ex.id,
          message: 'Chưa chọn kích thước nào để xuất.' });
      } else if (unknown.length) {
        issues.push({ severity: 'error', code: 'export-ratio-unknown', nodeId: ex.id,
          message: `Kích thước xuất không còn trong node Kích thước: ${unknown.join(', ')}. Chọn lại kích thước xuất.` });
      }
    }
  }

  // Ảnh không có dây ra: user tưởng đã thêm ảnh nhưng banner không có (thả ảnh lên canvas, xoá dây…).
  for (const n of graph.nodes) {
    if (n.type !== 'product-asset' && n.type !== 'reference-image') continue;
    if (graph.edges.some((e) => e.source === n.id)) continue;
    issues.push({ severity: 'warning', code: 'asset-unconnected', nodeId: n.id, message: ASSET_UNCONNECTED_MESSAGE });
  }

  // Brand kit: màu phải là mã hex (Inspector và prompt đều dùng).
  const brand = graph.nodes.find((n) => n.type === 'brand-kit') as FlowNode<'brand-kit'> | undefined;
  if (brand) {
    const bad = brand.params.colors.filter((c) => !isHexColor(c));
    if (bad.length) {
      issues.push({ severity: 'error', code: 'brand-color-invalid', nodeId: brand.id,
        message: `Mã màu không hợp lệ: ${bad.join(', ')}. Dùng dạng #RRGGBB.` });
    }
  }

  return issues;
}

export function hasCycle(graph: FlowGraph): boolean {
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) if (indeg.has(e.target)) indeg.set(e.target, indeg.get(e.target)! + 1);
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const e of graph.edges) {
      if (e.source !== id || !indeg.has(e.target)) continue;
      const d = indeg.get(e.target)! - 1;
      indeg.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  return visited !== graph.nodes.length;
}
