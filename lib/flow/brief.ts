/**
 * Brief marketing (Nghiệp yêu cầu 2026-10-19): ngoài mục tiêu chiến dịch (marketingBrief, dùng chung form) và mô tả
 * bối cảnh nền (prompt), Brief có đối tượng, thông điệp/giá trị, ưu đãi, tone giọng.
 *
 * Dùng cho: (1) prompt Tạo banner – định hướng không khí, màu, mức năng lượng (KHÔNG vẽ thành chữ);
 * (2) gợi ý chữ (headline/sub/CTA) bằng AI văn bản (copy-suggest.ts).
 * `campaign` là field tuỳ chọn trên params node Brief: project/template cũ không có vẫn chạy như trước.
 */

export const BRIEF_TONES = ['youthful', 'premium', 'trustworthy', 'playful', 'urgent'] as const;
export type BriefTone = (typeof BRIEF_TONES)[number];

export const BRIEF_TONE_LABELS: Record<BriefTone, string> = {
  youthful: 'Trẻ trung, năng động',
  premium: 'Sang trọng, cao cấp',
  trustworthy: 'Tin cậy, chuyên nghiệp',
  playful: 'Vui nhộn, gần gũi',
  urgent: 'Gấp, kích thích mua ngay',
};

export interface CampaignBrief {
  /** Đối tượng khách hàng. */
  audience: string;
  /** Giá trị / thông điệp chính. */
  message: string;
  /** Ưu đãi, khuyến mãi. */
  offer: string;
  tone?: BriefTone;
}

export const CAMPAIGN_FIELD_MAX = 300;

export const EMPTY_CAMPAIGN: CampaignBrief = { audience: '', message: '', offer: '' };

export function hasCampaign(c: CampaignBrief | undefined): c is CampaignBrief {
  return Boolean(c && (c.audience.trim() || c.message.trim() || c.offer.trim() || c.tone));
}

export function isBriefTone(v: unknown): v is BriefTone {
  return (BRIEF_TONES as readonly unknown[]).includes(v);
}

/** Kiểm body từ client (route): chuỗi ≤ CAMPAIGN_FIELD_MAX, tone hợp lệ. */
export function parseCampaign(v: unknown): CampaignBrief | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => typeof x === 'string' && x.length <= CAMPAIGN_FIELD_MAX;
  if (!str(o.audience) || !str(o.message) || !str(o.offer)) return null;
  if (o.tone !== undefined && !isBriefTone(o.tone)) return null;
  return { audience: o.audience as string, message: o.message as string, offer: o.offer as string, ...(o.tone ? { tone: o.tone as BriefTone } : {}) };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/"/g, "'").trim();

/** Các dòng tiếng Việt thêm vào prompt Tạo banner (form cũ nhận prompt tiếng Việt tự do). */
export function campaignLegacyLines(c: CampaignBrief | undefined): string[] {
  if (!hasCampaign(c)) return [];
  const lines: string[] = [];
  if (c.audience.trim()) lines.push(`Đối tượng: ${clean(c.audience)}`);
  if (c.message.trim()) lines.push(`Thông điệp chính: ${clean(c.message)}`);
  if (c.offer.trim()) lines.push(`Ưu đãi: ${clean(c.offer)}`);
  if (c.tone) lines.push(`Tone: ${BRIEF_TONE_LABELS[c.tone]}`);
  return lines;
}
