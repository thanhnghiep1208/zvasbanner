/**
 * GET  /api/flow/docs – danh sách project của user (mới sửa trước).
 * POST /api/flow/docs – lưu project mới { title, doc: StoredFlowDoc } → { doc: FlowDocSummary }.
 * T6.1. Không lưu ảnh (Q7B): server bỏ url node ảnh trước khi ghi.
 */
import { NextResponse } from 'next/server';

import { getDbPool } from '@/lib/db';
import { createFlowDoc, ensureFlowDocsSchema, listFlowDocs, MAX_DOCS_PER_USER } from '@/lib/flow-server/flow-docs';
import { dbError, readDocBody, requireFlowUser } from '@/lib/flow-server/docs-route';

export async function GET() {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  try {
    const db = getDbPool();
    await ensureFlowDocsSchema(db);
    return NextResponse.json({ docs: await listFlowDocs(db, user.userId) });
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: Request) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  const body = await readDocBody(req);
  if (body instanceof NextResponse) return body;
  try {
    const db = getDbPool();
    await ensureFlowDocsSchema(db);
    const res = await createFlowDoc(db, user.userId, body.title, body.doc);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Đã đủ ${MAX_DOCS_PER_USER} project. Xoá bớt project cũ rồi lưu lại.` }, { status: 409 },
      );
    }
    return NextResponse.json({ doc: res.doc }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}
