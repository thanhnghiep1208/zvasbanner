/**
 * Cache key theo node (T4.7, SPEC 5.5): `key(node) = hash(type + params + key các node upstream theo port)`.
 * Kiểu Merkle: đổi params ở đâu thì key của node đó và MỌI node downstream đổi theo → biết node nào "stale".
 * Vị trí node không vào key (kéo node không làm stale). Pure, deterministic, không cần crypto.
 */
import type { FlowGraph } from './schema';

/** JSON ổn định: key object sắp xếp, bỏ undefined – cùng nội dung → cùng chuỗi. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`;
}

/** FNV-1a 2 lần (seed khác nhau) → 64 bit dạng hex. Đủ để phân biệt cấu hình, không dùng cho bảo mật. */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 15);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export const hashParts = (...parts: unknown[]) => hashString(stableStringify(parts));

/** Key cho mọi node. Node nằm trong vòng lặp (graph lỗi) không có key. */
export function nodeKeys(graph: FlowGraph): Record<string, string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, typeof graph.edges>();
  for (const e of graph.edges) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e]);

  const keys: Record<string, string> = {};
  const visiting = new Set<string>();
  const visit = (id: string): string | undefined => {
    if (keys[id]) return keys[id];
    const node = byId.get(id);
    if (!node || visiting.has(id)) return undefined; // node thiếu hoặc vòng lặp
    visiting.add(id);
    const inputs: string[] = [];
    for (const e of incoming.get(id) ?? []) {
      const up = visit(e.source);
      if (!up) { visiting.delete(id); return undefined; }
      inputs.push(`${e.targetPort}<-${e.sourcePort}:${up}`);
    }
    visiting.delete(id);
    // Thứ tự edge trong cùng port có nghĩa (vd. thứ tự text layer) → giữ thứ tự port, sắp theo port.
    inputs.sort((a, b) => a.slice(0, a.indexOf('<-')).localeCompare(b.slice(0, b.indexOf('<-'))));
    return (keys[id] = hashParts(node.type, node.params, inputs));
  };
  for (const n of graph.nodes) visit(n.id);
  return keys;
}

/** Các node đi được tới từ `from` theo chiều edge (gồm chính nó) – dùng cho "Chạy lại từ node này". */
export function downstreamOf(graph: FlowGraph, from: string): Set<string> {
  const out = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of graph.edges) {
      if (e.source === id && !out.has(e.target)) { out.add(e.target); stack.push(e.target); }
    }
  }
  return out;
}
