/**
 * Template + exposed params (T5.1, SPEC 5.7).
 *
 * Template = graph + danh sách param "lộ ra" cho Simple view. Simple view (T5.2) vẽ form từ `exposed`;
 * sửa ở form ghi THẲNG vào graph (graph là source of truth duy nhất – SPEC 1).
 *
 * Mở rộng so với SPEC `{ nodeId, paramKey, label }`:
 * - `path` (mảng) thay `paramKey`: nhiều field nằm sâu (vd. ['style', 'fill', 'color'], ['marketingBrief', 'campaignIntents']).
 *   `path: []` = cả params của node (dùng cho control 'asset' – upload thay nhiều field cùng lúc).
 * - `control`: Simple view biết vẽ input nào; validateTemplate kiểm kiểu giá trị khớp control.
 */
import { validateGraph, type ValidationIssue } from '../validate';
import type { FlowGraph, FlowNode, NodeType } from '../schema';

export type ExposedControl =
  | 'text'      // string 1 dòng
  | 'textarea'  // string nhiều dòng
  | 'number'
  | 'checkbox'
  | 'color'     // string hex
  | 'select'    // string ∈ options
  | 'chips'     // string[] ⊂ options
  | 'asset'     // cả params node product-asset / reference-image (path [])
  | 'ratios';   // RatioSpec[] (node ratio, path ['ratios'])

export interface ExposedOption {
  value: string;
  label: string;
}

export interface ExposedParam {
  /** Ổn định trong template – Simple view dùng làm key/id field. */
  id: string;
  nodeId: string;
  path: string[];
  label: string;
  control: ExposedControl;
  hint?: string;
  placeholder?: string;
  options?: ExposedOption[];
  /** Simple view đánh dấu bắt buộc; validate template kiểm giá trị mặc định không cần có (vd. ảnh để user upload). */
  required?: boolean;
  /** Nhóm hiển thị trong Simple view (vd. "Nội dung", "Hình ảnh", "Phong cách"). */
  group?: string;
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  graph: FlowGraph;
  exposed: ExposedParam[];
}

/* ── Đọc / ghi giá trị theo path (immutable) ─────────────────── */

export function getAtPath(obj: unknown, path: readonly string[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function setAtPath(obj: unknown, path: readonly string[], value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const base = obj !== null && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
  return { ...base, [head!]: setAtPath(base[head!], rest, value) };
}

export function getExposedValue(graph: FlowGraph, e: ExposedParam): unknown {
  const node = graph.nodes.find((n) => n.id === e.nodeId);
  return node ? getAtPath(node.params, e.path) : undefined;
}

/** Graph mới với giá trị đã ghi; node khác giữ nguyên object (để React/zustand so sánh rẻ). */
export function setExposedValue(graph: FlowGraph, e: ExposedParam, value: unknown): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === e.nodeId ? ({ ...n, params: setAtPath(n.params, e.path, value) } as FlowNode) : n),
  };
}

/** Field còn dùng được: node còn tồn tại (user có thể đã xoá node ở Canvas view). */
export function resolveExposed(graph: FlowGraph, exposed: readonly ExposedParam[]): ExposedParam[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return exposed.filter((e) => ids.has(e.nodeId));
}

/** Bản sao graph độc lập để bắt đầu project mới từ template. */
export function instantiateTemplate(t: FlowTemplate): { graph: FlowGraph; exposed: ExposedParam[]; templateId: string } {
  return { graph: structuredClone(t.graph), exposed: structuredClone(t.exposed), templateId: t.id };
}

/* ── Validate template (dùng trong test của từng template, T5.3) ─ */

export interface TemplateIssue {
  code:
    | 'graph-invalid' | 'exposed-duplicate-id' | 'exposed-node-missing' | 'exposed-path-missing'
    | 'exposed-control-mismatch' | 'exposed-option-invalid';
  message: string;
  exposedId?: string;
}

const ASSET_NODES: NodeType[] = ['product-asset', 'reference-image'];

function controlMatches(e: ExposedParam, value: unknown, node: FlowNode): boolean {
  switch (e.control) {
    case 'text': case 'textarea': case 'color': case 'select': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox': return typeof value === 'boolean';
    case 'chips': return Array.isArray(value) && value.every((v) => typeof v === 'string');
    case 'asset': return e.path.length === 0 && ASSET_NODES.includes(node.type);
    case 'ratios': return node.type === 'ratio' && Array.isArray(value);
  }
}

/**
 * Template hợp lệ khi: graph không có lỗi validate (ảnh chưa upload thì được – user điền ở Simple view), mọi
 * exposed trỏ tới node + path có thật, kiểu giá trị khớp control, giá trị select/chips nằm trong options.
 */
export function validateTemplate(t: FlowTemplate): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const graphErrors: ValidationIssue[] = validateGraph(t.graph).filter((i) => i.severity === 'error');
  for (const g of graphErrors) issues.push({ code: 'graph-invalid', message: `${g.code}: ${g.message}` });

  const seen = new Set<string>();
  for (const e of t.exposed) {
    if (seen.has(e.id)) issues.push({ code: 'exposed-duplicate-id', exposedId: e.id, message: `Trùng id ${e.id}.` });
    seen.add(e.id);
    const node = t.graph.nodes.find((n) => n.id === e.nodeId);
    if (!node) {
      issues.push({ code: 'exposed-node-missing', exposedId: e.id, message: `Không có node ${e.nodeId}.` });
      continue;
    }
    const value = getAtPath(node.params, e.path);
    if (value === undefined) {
      issues.push({ code: 'exposed-path-missing', exposedId: e.id, message: `${e.nodeId}: không có ${e.path.join('.')}.` });
      continue;
    }
    if (!controlMatches(e, value, node)) {
      issues.push({ code: 'exposed-control-mismatch', exposedId: e.id,
        message: `${e.id}: control '${e.control}' không khớp giá trị ${JSON.stringify(value).slice(0, 40)}.` });
      continue;
    }
    if ((e.control === 'select' || e.control === 'chips') && e.options) {
      const allowed = new Set(e.options.map((o) => o.value));
      const values = Array.isArray(value) ? value : [value];
      if (values.some((v) => !allowed.has(v as string))) {
        issues.push({ code: 'exposed-option-invalid', exposedId: e.id, message: `${e.id}: giá trị ngoài options.` });
      }
    }
  }
  return issues;
}
