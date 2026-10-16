import { beforeEach, describe, expect, it } from 'vitest';
import { serializeFlowDoc } from '@/lib/flow/persistence';
import {
  createFlowDoc, deleteFlowDoc, ensureFlowDocsSchema, getFlowDoc, listFlowDocs, MAX_DOCS_PER_USER,
  resetFlowDocsSchemaForTest, updateFlowDoc, type Queryable,
} from '../flow-docs';

/** Pool giả: ghi lại câu lệnh, trả rows đặt trước. */
function fakeDb(rows: unknown[] = [], rowCount: number | null = rows.length) {
  const calls: { text: string; values?: unknown[] }[] = [];
  const db: Queryable = {
    query: async <R,>(text: string, values?: unknown[]) => {
      calls.push({ text, values });
      return { rows: rows as R[], rowCount };
    },
  };
  return { db, calls };
}

const row = { id: 'd1', title: 'Sale', template_id: 'sale-multi-ratio', updated_at: new Date('2026-10-15T03:00:00Z') };
const doc = serializeFlowDoc({ nodes: [], edges: [] }, undefined, { templateId: 'sale-multi-ratio' });

beforeEach(() => resetFlowDocsSchemaForTest());

describe('flow-docs repository', () => {
  it('ensure schema chạy CREATE TABLE 1 lần', async () => {
    const { db, calls } = fakeDb();
    await Promise.all([ensureFlowDocsSchema(db), ensureFlowDocsSchema(db)]);
    await ensureFlowDocsSchema(db);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toMatch(/CREATE TABLE IF NOT EXISTS flow_docs/);
  });

  it('ensure schema lỗi → lần sau thử lại', async () => {
    let fail = true;
    const db: Queryable = { query: async () => { if (fail) throw new Error('down'); return { rows: [], rowCount: 0 }; } };
    await expect(ensureFlowDocsSchema(db)).rejects.toThrow('down');
    fail = false;
    await expect(ensureFlowDocsSchema(db)).resolves.toBeUndefined();
  });

  it('mọi truy vấn lọc theo user_id', async () => {
    const { db, calls } = fakeDb([row]);
    await listFlowDocs(db, 'u1');
    await getFlowDoc(db, 'u1', 'd1');
    await updateFlowDoc(db, 'u1', 'd1', 'Sale', doc);
    await deleteFlowDoc(db, 'u1', 'd1');
    for (const c of calls) {
      expect(c.text).toMatch(/user_id = \$1/);
      expect(c.values![0]).toBe('u1');
    }
  });

  it('list trả summary, updatedAt ISO', async () => {
    const { db } = fakeDb([row]);
    expect(await listFlowDocs(db, 'u1')).toEqual([
      { id: 'd1', title: 'Sale', templateId: 'sale-multi-ratio', updatedAt: '2026-10-15T03:00:00.000Z' },
    ]);
  });

  it('create: ghi doc dạng JSON + quota trong cùng câu; không có row trả về = hết quota', async () => {
    const ok = fakeDb([row]);
    const res = await createFlowDoc(ok.db, 'u1', 'Sale', doc, 'd1');
    expect(res).toMatchObject({ ok: true, doc: { id: 'd1' } });
    const v = ok.calls[0]!.values!;
    expect(v.slice(0, 4)).toEqual(['d1', 'u1', 'Sale', 'sale-multi-ratio']);
    expect(JSON.parse(v[4] as string)).toEqual(doc);
    expect(v[5]).toBe(MAX_DOCS_PER_USER);

    const full = fakeDb([]);
    expect(await createFlowDoc(full.db, 'u1', 'Sale', doc)).toEqual({ ok: false, reason: 'quota' });
  });

  it('get/update/delete không thấy (khác user hoặc không có) → null/false', async () => {
    const { db } = fakeDb([], 0);
    expect(await getFlowDoc(db, 'u2', 'd1')).toBeNull();
    expect(await updateFlowDoc(db, 'u2', 'd1', 'x', doc)).toBeNull();
    expect(await deleteFlowDoc(db, 'u2', 'd1')).toBe(false);
  });
});
