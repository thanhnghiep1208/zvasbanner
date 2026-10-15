/**
 * Phần dùng chung của route /api/flow/docs (T6.1): xác thực + flag, đọc body.
 */
import { NextResponse } from 'next/server';

import { isFlowCanvasEnabled } from '@/lib/flags';
import { normalizeDocTitle, parseStoredFlowDoc, type StoredFlowDoc } from '@/lib/flow/persistence';
import { readJsonWithSizeLimit } from '@/lib/request-limits';
import { requirePermissionJson } from '@/lib/require-user';

/** Graph không có ảnh (Q7B) – vài chục KB là nhiều; 1MB chặn lỡ gửi kèm data URL. */
export const MAX_DOC_BODY_BYTES = 1024 * 1024;

/** User đăng nhập, không bị block, có flag Flow canvas. Flag tắt → 404 như trang /flow. */
export async function requireFlowUser(): Promise<{ userId: string } | NextResponse> {
  const gate = await requirePermissionJson({
    error: 'Cần đăng nhập để lưu project.',
    forbiddenError: 'Bạn không có quyền dùng Flow canvas.',
    permission: 'generate_image',
  });
  if (gate instanceof NextResponse) return gate;
  if (!isFlowCanvasEnabled(gate.userId)) return NextResponse.json({ error: 'Không tìm thấy.' }, { status: 404 });
  return { userId: gate.userId };
}

export async function readDocBody(req: Request): Promise<{ title: string; doc: StoredFlowDoc } | NextResponse> {
  const body = await readJsonWithSizeLimit(req, MAX_DOC_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const b = body.body as { title?: unknown; doc?: unknown } | null;
  try {
    return { title: normalizeDocTitle(b?.title), doc: parseStoredFlowDoc(b?.doc) };
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Project không hợp lệ.' }, { status: 400 });
  }
}

export function dbError(e: unknown): NextResponse {
  console.error('[flow-docs]', e);
  return NextResponse.json({ error: 'Không truy cập được cơ sở dữ liệu. Vui lòng thử lại.' }, { status: 503 });
}
