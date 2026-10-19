/**
 * POST /api/flow/brand-from-url { url } – gợi ý Brand kit (màu, font, logo, tên) từ website thương hiệu.
 * Không gọi AI. Sau flag Flow canvas. Chống SSRF + giới hạn tải trong lib/flow-server/brand-fetch.ts.
 * Rate limit riêng (không ăn vào lượt tạo ảnh).
 */
import { NextResponse } from 'next/server';

import { requireFlowUser } from '@/lib/flow-server/docs-route';
import { BrandFetchError, brandFromUrl } from '@/lib/flow-server/brand-fetch';
import { createRateLimiter, readJsonWithSizeLimit } from '@/lib/request-limits';

export const runtime = 'nodejs';
export const maxDuration = 30;

const checkRateLimit = createRateLimiter(30, 60 * 60 * 1000);

export async function POST(req: Request) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  if (!checkRateLimit(user.userId)) {
    return NextResponse.json({ error: 'Bạn đã lấy brand từ website quá nhiều lần trong 1 giờ. Vui lòng thử lại sau.' }, { status: 429 });
  }

  const body = await readJsonWithSizeLimit(req, 4096);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const url = (body.body as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url.trim() || url.length > 2048) {
    return NextResponse.json({ error: 'Nhập link website.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await brandFromUrl(url));
  } catch (e) {
    if (e instanceof BrandFetchError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[brand-from-url]', e);
    return NextResponse.json({ error: 'Không lấy được thông tin từ website này.' }, { status: 502 });
  }
}
