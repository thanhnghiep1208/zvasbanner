/**
 * POST /api/flow/suggest-copy – "Gợi ý chữ từ brief": 3 phương án headline / subheadline / CTA tiếng Việt.
 * Gọi model văn bản Gemini (lib/flow-server/suggest-copy.ts, chỉ import getGeminiApiKey). Sau flag Flow canvas,
 * rate limit riêng (không ăn lượt tạo ảnh). Prompt + đọc kết quả: lib/flow/copy-suggest.ts.
 */
import { NextResponse } from 'next/server';

import { getGeminiApiKey } from '@/lib/gemini-server';
import { suggestCopy } from '@/lib/flow-server/suggest-copy';
import { requireFlowUser } from '@/lib/flow-server/docs-route';
import { parseCampaign } from '@/lib/flow/brief';
import { canSuggestCopy } from '@/lib/flow/copy-suggest';
import { createRateLimiter, readJsonWithSizeLimit } from '@/lib/request-limits';
import type { CampaignIntent } from '@/lib/types';

export const maxDuration = 45;

const checkRateLimit = createRateLimiter(30, 60 * 60 * 1000);
const INTENTS: CampaignIntent[] = ['flash-sale', 'product-launch', 'brand-awareness', 'event'];

export async function POST(req: Request) {
  const user = await requireFlowUser();
  if (user instanceof NextResponse) return user;
  if (!checkRateLimit(user.userId)) {
    return NextResponse.json({ error: 'Bạn đã gợi ý chữ quá nhiều lần trong 1 giờ. Vui lòng thử lại sau.' }, { status: 429 });
  }

  const body = await readJsonWithSizeLimit(req, 16 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const b = (body.body ?? {}) as Record<string, unknown>;
  const campaign = parseCampaign(b.campaign);
  const intents = Array.isArray(b.intents) ? b.intents.filter((i): i is CampaignIntent => INTENTS.includes(i as CampaignIntent)) : [];
  const scene = typeof b.scene === 'string' ? b.scene.slice(0, 1000) : '';
  const brandName = typeof b.brandName === 'string' ? b.brandName.slice(0, 100) : undefined;
  if (!campaign || !canSuggestCopy(campaign)) {
    return NextResponse.json({ error: 'Điền thông điệp chính hoặc ưu đãi trước khi gợi ý chữ.' }, { status: 400 });
  }

  try {
    const variants = await suggestCopy(getGeminiApiKey(), { campaign, intents, scene, brandName });
    if (!variants.length) {
      return NextResponse.json({ error: 'AI không trả gợi ý hợp lệ. Thử lại hoặc viết rõ thông điệp hơn.' }, { status: 502 });
    }
    return NextResponse.json({ variants });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : '';
    if (msg.includes('quota') || msg.includes('rate') || msg.includes('exhausted')) {
      return NextResponse.json({ error: 'Gemini đang chạm giới hạn. Vui lòng thử lại sau ít phút.' }, { status: 429 });
    }
    if (msg.includes('timed out')) {
      return NextResponse.json({ error: 'AI phản hồi quá chậm. Vui lòng thử lại.' }, { status: 504 });
    }
    console.error('[suggest-copy]', e);
    return NextResponse.json({ error: 'Không gợi ý được chữ lúc này. Vui lòng thử lại.' }, { status: 502 });
  }
}
