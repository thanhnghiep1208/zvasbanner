/**
 * Gọi /api/flow/docs từ client (T6.1). Lỗi → Error với message tiếng Việt từ server.
 */
import type { StoredFlowDoc } from '@/lib/flow/persistence';

export interface FlowDocSummary {
  id: string;
  title: string;
  templateId: string | null;
  updatedAt: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Mất kết nối. Kiểm tra mạng rồi thử lại.');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as ({ error?: unknown } & T) | null;
  if (!res.ok) throw new Error(typeof json?.error === 'string' ? json.error : `Lỗi máy chủ (HTTP ${res.status}).`);
  return json as T;
}

const jsonInit = (method: string, body: unknown): RequestInit =>
  ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const flowDocsApi = {
  list: () => call<{ docs: FlowDocSummary[] }>('/api/flow/docs').then((r) => r.docs),
  get: (id: string) =>
    call<{ doc: FlowDocSummary & { doc: StoredFlowDoc } }>(`/api/flow/docs/${encodeURIComponent(id)}`).then((r) => r.doc),
  create: (title: string, doc: StoredFlowDoc) =>
    call<{ doc: FlowDocSummary }>('/api/flow/docs', jsonInit('POST', { title, doc })).then((r) => r.doc),
  update: (id: string, title: string, doc: StoredFlowDoc) =>
    call<{ doc: FlowDocSummary }>(`/api/flow/docs/${encodeURIComponent(id)}`, jsonInit('PUT', { title, doc })).then((r) => r.doc),
  remove: (id: string) => call<void>(`/api/flow/docs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
