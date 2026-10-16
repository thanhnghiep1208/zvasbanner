/**
 * Bản nháp Flow canvas trên trình duyệt của user (tải lại trang / đóng tab không mất việc đang làm).
 * - Graph + exposed + project đang mở → localStorage (nhỏ, đọc đồng bộ).
 * - Ảnh đã tải (dataUrl, có thể vài MB) → IndexedDB, theo assetId. Chỉ nằm trên máy này, không gửi server (Q7B).
 * Mọi thao tác storage có thể bị chặn (chế độ ẩn danh, hết dung lượng) → nuốt lỗi, nháp chỉ là tiện ích.
 */
import type { FlowGraph } from '@/lib/flow/schema';
import { parseStoredFlowDoc, stripRuntimeAssets } from '@/lib/flow/persistence';
import type { ExposedParam } from '@/lib/flow/template/template';

export interface FlowDraft {
  v: 1;
  savedAt: number;
  graph: FlowGraph;
  exposed: ExposedParam[];
  templateId: string | null;
  docId: string | null;
  docTitle: string;
  view: 'simple' | 'canvas';
}

const keyFor = (userId: string) => `zvas-flow-draft:${userId}`;

export function readDraft(userId: string): FlowDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const d = JSON.parse(raw) as FlowDraft;
    if (d?.v !== 1) return null;
    // Cùng kiểm tra cấu trúc như project lưu trên server.
    const doc = parseStoredFlowDoc({ schemaVersion: 1, graph: d.graph, templateId: d.templateId ?? undefined, exposed: d.exposed });
    return { ...d, graph: doc.graph, exposed: doc.exposed ?? [] };
  } catch {
    return null;
  }
}

export function writeDraft(userId: string, draft: Omit<FlowDraft, 'v' | 'savedAt' | 'graph'> & { graph: FlowGraph }): void {
  try {
    const value: FlowDraft = { v: 1, savedAt: Date.now(), ...draft, graph: stripRuntimeAssets(draft.graph) };
    localStorage.setItem(keyFor(userId), JSON.stringify(value));
  } catch {
    /* storage bị chặn / đầy */
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
  void syncDraftAssets(userId, {});
}

/* ── Ảnh: IndexedDB ─────────────────────────────────────────── */

const DB_NAME = 'zvas-flow-draft';
const STORE = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const assetKey = (userId: string, assetId: string) => `${userId}:${assetId}`;
/** Đã ghi trong phiên này – tránh ghi lại dataUrl lớn mỗi lần lưu nháp. */
const written = new Set<string>();

/** Đồng bộ kho ảnh nháp của user với đúng tập `dataUrls` (thêm ảnh mới, xoá ảnh không còn dùng). */
export async function syncDraftAssets(userId: string, dataUrls: Record<string, string>): Promise<void> {
  try {
    const db = await openDb();
    const prefix = `${userId}:`;
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const wanted = new Set(Object.keys(dataUrls).map((id) => assetKey(userId, id)));
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith(prefix) && !wanted.has(k)) {
        store.delete(k);
        written.delete(k);
      }
    }
    const existing = new Set(keys);
    for (const [id, dataUrl] of Object.entries(dataUrls)) {
      const k = assetKey(userId, id);
      if (existing.has(k) && written.has(k)) continue;
      store.put(dataUrl, k);
      written.add(k);
    }
    await done(tx);
    db.close();
  } catch {
    /* IndexedDB bị chặn / hết dung lượng: nháp vẫn có graph, ảnh cần tải lại */
  }
}

export async function readDraftAssets(userId: string, assetIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const db = await openDb();
    const store = db.transaction(STORE).objectStore(STORE);
    await Promise.all(assetIds.map((id) => new Promise<void>((resolve) => {
      const req = store.get(assetKey(userId, id));
      req.onsuccess = () => {
        if (typeof req.result === 'string') {
          out[id] = req.result;
          written.add(assetKey(userId, id));
        }
        resolve();
      };
      req.onerror = () => resolve();
    })));
    db.close();
  } catch {
    /* ignore */
  }
  return out;
}
