import type { FlowGraph, FlowNode } from './schema';
import { getDefinition, PORT_TYPE_LABELS } from './node-definitions';
import { validateTextStyle } from './text/text-style';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

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

  // Export: đúng 1 node, đúng 1 nguồn
  const exports = graph.nodes.filter((n) => n.type === 'export');
  if (exports.length !== 1) {
    issues.push({ severity: 'error', code: 'export-count',
      message: `Cần đúng 1 node Export (hiện có ${exports.length}).` });
  }
  for (const ex of exports) {
    const sources = graph.edges.filter((e) => e.target === ex.id).length;
    if (sources !== 1) {
      issues.push({ severity: 'error', code: 'export-source', nodeId: ex.id,
        message: 'Export cần đúng 1 nguồn: composition hoặc raster.' });
    }
  }

  // Text layer
  for (const n of graph.nodes) {
    if (n.type !== 'text-layer') continue;
    const p = (n as FlowNode<'text-layer'>).params;
    if (p.renderSource === 'ai' && p.role !== 'headline') {
      issues.push({ severity: 'error', code: 'ai-text-role', nodeId: n.id,
        message: 'Chỉ headline được render bằng AI.' });
    }
    if (p.renderSource === 'ai' && feedsCompose(graph, n.id)) {
      issues.push({ severity: 'warning', code: 'ai-text-in-composed', nodeId: n.id,
        message: 'Headline AI: prompt chỉ cho phép chữ trong slot headline, vùng khác vẫn cấm chữ. Kết quả chữ có thể sai chính tả.' });
    }
    for (const message of validateTextStyle(p.style, p.minFontSizePx)) {
      issues.push({ severity: 'error', code: 'text-style-invalid', nodeId: n.id, message });
    }
  }

  // Product không có alpha đi vào Compose → auto shadow sẽ tắt. Flat: Gemini tự xử lý nền, không cảnh báo.
  for (const n of graph.nodes) {
    if (n.type === 'product-asset' && !(n as FlowNode<'product-asset'>).params.hasAlpha && feedsCompose(graph, n.id)) {
      issues.push({ severity: 'warning', code: 'product-no-alpha', nodeId: n.id,
        message: 'Ảnh sản phẩm chưa tách nền: auto shadow tắt, viền nền gốc sẽ hiện trên banner.' });
    }
  }

  return issues;
}

function feedsCompose(graph: FlowGraph, nodeId: string): boolean {
  return graph.edges.some(
    (e) => e.source === nodeId && graph.nodes.find((n) => n.id === e.target)?.type === 'compose',
  );
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
