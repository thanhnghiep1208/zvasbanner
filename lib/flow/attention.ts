/**
 * Node cần user chú ý trên canvas (Nghiệp yêu cầu 2026-10-20): thiếu dây bắt buộc, chưa có thông tin, hoặc chưa nối
 * vào đâu. Dùng chung cho node card (viền + lời nhắc), minimap và nút "N node cần bổ sung" trên header.
 * Khác validateGraph: ở đây chỉ là gợi ý hiển thị, không chặn chạy (trừ thiếu dây – validate cũng báo lỗi).
 */
import { hasCampaign } from './brief';
import { NODE_DEFINITIONS, PORT_TYPE_LABELS } from './node-definitions';
import type { FlowGraph, FlowNode, NodeParamsMap } from './schema';

export type AttentionKind = 'missing-input' | 'empty' | 'unconnected';

export interface AttentionIssue {
  kind: AttentionKind;
  message: string;
}

export interface NodeAttention {
  /** 'error' = thiếu dây bắt buộc (không chạy được); 'warning' = trống / chưa nối. */
  level: 'error' | 'warning';
  /** Nhãn ngắn trên header card. */
  label: string;
  issues: AttentionIssue[];
}

/** Lời nhắc khi node chưa có thông tin. `null` = đã có. */
function emptyMessage(node: FlowNode): string | null {
  switch (node.type) {
    case 'product-asset':
    case 'reference-image': {
      const p = node.params as NodeParamsMap['product-asset'];
      return p.assetId || p.fileName ? null : 'Chưa có ảnh: kéo ảnh vào node hoặc chọn node để tải lên.';
    }
    case 'brief': {
      const p = node.params as NodeParamsMap['brief'];
      const filled = p.prompt.trim() || hasCampaign(p.campaign) || p.marketingBrief.campaignIntents.length > 0;
      return filled ? null : 'Brief trống: mô tả mục đích, thông điệp hoặc bối cảnh banner.';
    }
    case 'text-layer':
      return (node.params as NodeParamsMap['text-layer']).content.trim() ? null : 'Chưa có nội dung chữ (để trống thì banner không có dòng này).';
    case 'ratio':
      return (node.params as NodeParamsMap['ratio']).ratios.length ? null : 'Chưa chọn kích thước nào.';
    case 'brand-kit': {
      const p = node.params as NodeParamsMap['brand-kit'];
      return p.colors.length || p.fontPreference || p.logoPosition ? null : 'Brand kit trống: thêm màu, font hoặc vị trí logo.';
    }
    default:
      return null;
  }
}

export function nodeAttention(graph: FlowGraph, node: FlowNode): NodeAttention | null {
  const def = NODE_DEFINITIONS[node.type];
  if (!def) return null;
  const issues: AttentionIssue[] = [];

  const missing = def.inputs.filter((p) => p.required && !graph.edges.some((e) => e.target === node.id && e.targetPort === p.id));
  if (missing.length) {
    issues.push({ kind: 'missing-input', message: `Thiếu dây vào: ${missing.map((p) => PORT_TYPE_LABELS[p.type]).join(', ')}.` });
  }
  const empty = emptyMessage(node);
  if (empty) issues.push({ kind: 'empty', message: empty });
  if (def.outputs.length && !graph.edges.some((e) => e.source === node.id)) {
    issues.push({ kind: 'unconnected', message: 'Chưa nối vào node nào nên không được dùng khi chạy.' });
  }
  if (!issues.length) return null;

  const first = issues[0]!.kind;
  return {
    level: missing.length ? 'error' : 'warning',
    label: first === 'missing-input' ? 'Thiếu dây' : first === 'empty' ? 'Chưa có thông tin' : 'Chưa nối',
    issues,
  };
}

/** Mọi node cần chú ý, theo thứ tự trong graph (nút "N node cần bổ sung" đi lần lượt). */
export function graphAttention(graph: FlowGraph): Map<string, NodeAttention> {
  const out = new Map<string, NodeAttention>();
  for (const n of graph.nodes) {
    const a = nodeAttention(graph, n);
    if (a) out.set(n.id, a);
  }
  return out;
}
