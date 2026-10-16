/**
 * POST /api/flow/track – analytics Flow canvas (T6.3, SPEC 5.9, Q12) → bảng flow_events.
 * Không dùng /api/track cũ (cột cố định, allowlist event cũ). 204 khi ghi xong.
 */
import { NextResponse } from 'next/server';

import { getDbPool } from '@/lib/db';
import { requireFlowUser } from '@/lib/flow-server/docs-route';
import { ensureFlowEventsSchema, insertFlowEvent, parseFlowEvent } from '@/lib/flow-server/flow-events';
import { readJsonWithSizeLimit } from '@/lib/request-limits';

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(req: Request) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  const body = await readJsonWithSizeLimit(req, MAX_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const row = parseFlowEvent(body.body);
  if (!row) return NextResponse.json({ error: 'Event không hợp lệ.' }, { status: 400 });
  try {
    const db = getDbPool();
    await ensureFlowEventsSchema(db);
    await insertFlowEvent(db, user.userId, row);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('[flow-track]', e);
    return NextResponse.json({ error: 'Không ghi được event.' }, { status: 503 });
  }
}
