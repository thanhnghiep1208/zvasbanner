/**
 * Chia form Simple view thành các bước gập được (UI gọn – Nghiệp 2026-10-19): thứ tự theo mức quan trọng,
 * mỗi bước có tóm tắt 1 dòng khi gập và trạng thái (còn thiếu mục bắt buộc / đã đủ). Thuần, test được.
 */
import { getExposedValue, type ExposedParam } from '@/lib/flow/template/template';
import type { FlowGraph, FlowNode, RatioSpec } from '@/lib/flow/schema';
import { filledImageNodes } from '@/lib/flow/image-nodes';
import { BRIEF_TONE_LABELS } from '@/lib/flow/brief';

export const BRIEF_STEP = 'Brief';

/** Thứ tự bước: bắt buộc trước (ảnh, chữ), tuỳ chọn sau. Nhóm lạ chen sau "Nội dung". */
const ORDER = ['Hình ảnh', 'Nội dung', BRIEF_STEP, 'Phong cách', 'Kích thước'];

export function orderSteps(names: string[]): string[] {
  const rank = (n: string) => {
    const i = ORDER.indexOf(n);
    return i >= 0 ? i : ORDER.indexOf('Nội dung') + 0.5;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

/** Field bắt buộc còn trống (ảnh: chưa tải; chữ: rỗng). */
export function isMissing(graph: FlowGraph, f: ExposedParam): boolean {
  if (!f.required) return false;
  const v = getExposedValue(graph, f);
  if (f.control === 'asset') return !(v as { assetId?: string } | undefined)?.assetId;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === null;
}

const short = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function fieldSummary(graph: FlowGraph, f: ExposedParam): string | undefined {
  const v = getExposedValue(graph, f);
  switch (f.control) {
    case 'text':
    case 'textarea':
      return typeof v === 'string' && v.trim() ? short(v.trim()) : undefined;
    case 'select':
      return f.options?.find((o) => o.value === v)?.label;
    case 'chips':
      return Array.isArray(v) && v.length ? v.map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ') : undefined;
    case 'ratios': {
      const r = v as RatioSpec[] | undefined;
      if (!r?.length) return undefined;
      return r.length === 1 ? `${r[0]!.name}` : `${r.length} kích thước`;
    }
    default:
      return undefined;
  }
}

/** Tóm tắt 1 dòng của bước khi gập. */
export function stepSummary(graph: FlowGraph, step: string, fields: ExposedParam[], briefNodeId?: string): string {
  if (step === BRIEF_STEP && briefNodeId) {
    const b = graph.nodes.find((n) => n.id === briefNodeId) as FlowNode<'brief'> | undefined;
    const c = b?.params.campaign;
    const parts = [c?.message.trim() && short(c.message.trim(), 32), c?.audience.trim() && short(c.audience.trim(), 24), c?.tone && BRIEF_TONE_LABELS[c.tone]]
      .filter(Boolean) as string[];
    return parts.length ? parts.join(' · ') : 'Giúp AI chọn nền và gợi ý chữ';
  }
  if (fields.some((f) => f.control === 'asset')) {
    const n = filledImageNodes(graph).length;
    return n ? `${n} ảnh` : 'Chưa có ảnh';
  }
  const parts = fields.map((f) => fieldSummary(graph, f)).filter(Boolean) as string[];
  return parts.length ? parts.slice(0, 2).join(' · ') : 'Mặc định';
}

/** Số field bắt buộc còn trống trong bước. */
export function missingCount(graph: FlowGraph, fields: ExposedParam[]): number {
  return fields.filter((f) => isMissing(graph, f)).length;
}

