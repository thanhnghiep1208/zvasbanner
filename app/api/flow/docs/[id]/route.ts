/**
 * GET    /api/flow/docs/:id – mở project { doc: FlowDocSummary & { doc: StoredFlowDoc } }.
 * PUT    /api/flow/docs/:id – ghi đè { title, doc }.
 * DELETE /api/flow/docs/:id
 * T6.1. Chỉ project của chính user (khác user → 404, không lộ sự tồn tại).
 */
import { NextResponse } from 'next/server';

import { getDbPool } from '@/lib/db';
import { parseStoredFlowDoc } from '@/lib/flow/persistence';
import { deleteFlowDoc, ensureFlowDocsSchema, getFlowDoc, updateFlowDoc } from '@/lib/flow-server/flow-docs';
import { dbError, readDocBody, requireFlowUser } from '@/lib/flow-server/docs-route';

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: 'Không tìm thấy project.' }, { status: 404 });

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  try {
    const db = getDbPool();
    await ensureFlowDocsSchema(db);
    const rec = await getFlowDoc(db, user.userId, id);
    if (!rec) return notFound();
    let doc;
    try {
      doc = parseStoredFlowDoc(rec.doc); // migrate schema cũ
    } catch (e) {
      return NextResponse.json({ error: `Project hỏng hoặc từ phiên bản mới hơn: ${(e as Error).message}` }, { status: 422 });
    }
    return NextResponse.json({ doc: { ...rec, doc } });
  } catch (e) {
    return dbError(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  const body = await readDocBody(req);
  if (body instanceof NextResponse) return body;
  try {
    const db = getDbPool();
    await ensureFlowDocsSchema(db);
    const saved = await updateFlowDoc(db, user.userId, id, body.title, body.doc);
    return saved ? NextResponse.json({ doc: saved }) : notFound();
  } catch (e) {
    return dbError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  try {
    const db = getDbPool();
    await ensureFlowDocsSchema(db);
    return (await deleteFlowDoc(db, user.userId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (e) {
    return dbError(e);
  }
}
