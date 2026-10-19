/**
 * "Gợi ý chữ từ brief": prompt cho model văn bản + đọc kết quả. Thuần – route gọi Gemini ở
 * app/api/flow/suggest-copy. Kết quả là 3 phương án tiêu đề / mô tả ngắn / CTA tiếng Việt, cắt theo giới hạn
 * độ dài để vừa layout (headline tối đa 2 dòng, CTA 1 dòng).
 */
import type { CampaignIntent } from '@/lib/types';
import { BRIEF_TONE_LABELS, type CampaignBrief } from './brief';

export type CopyRole = 'headline' | 'subheadline' | 'cta';
export const COPY_ROLES: readonly CopyRole[] = ['headline', 'subheadline', 'cta'];
export type CopyVariant = Record<CopyRole, string>;

export const COPY_LIMITS: Record<CopyRole, number> = { headline: 40, subheadline: 90, cta: 22 };

const INTENT_LABELS: Record<CampaignIntent, string> = {
  'flash-sale': 'Flash sale / khuyến mãi',
  'product-launch': 'Ra mắt sản phẩm',
  'brand-awareness': 'Nhận diện thương hiệu',
  'event': 'Sự kiện / ngày lễ',
};

export interface CopySuggestInput {
  campaign: CampaignBrief;
  intents: CampaignIntent[];
  /** Mô tả bối cảnh nền (tuỳ chọn) – thêm ngữ cảnh. */
  scene: string;
  brandName?: string;
}

/** Brief đủ để gợi ý: cần ít nhất thông điệp hoặc ưu đãi. */
export function canSuggestCopy(c: CampaignBrief | undefined): boolean {
  return Boolean(c && (c.message.trim() || c.offer.trim()));
}

const q = (s: string) => s.replace(/\s+/g, ' ').replace(/"/g, "'").trim();

export function buildCopyPrompt(input: CopySuggestInput): string {
  const { campaign: c } = input;
  const facts = [
    input.brandName?.trim() && `Thương hiệu: ${q(input.brandName)}`,
    input.intents.length && `Mục đích: ${input.intents.map((i) => INTENT_LABELS[i]).join(', ')}`,
    c.audience.trim() && `Đối tượng: ${q(c.audience)}`,
    c.message.trim() && `Thông điệp / giá trị chính: ${q(c.message)}`,
    c.offer.trim() && `Ưu đãi: ${q(c.offer)}`,
    c.tone && `Tone giọng: ${BRIEF_TONE_LABELS[c.tone]}`,
    input.scene.trim() && `Bối cảnh hình ảnh: ${q(input.scene)}`,
  ].filter(Boolean);
  return [
    'Bạn là copywriter quảng cáo tiếng Việt. Viết chữ cho 1 banner quảng cáo theo brief dưới đây.',
    '',
    ...facts,
    '',
    'Yêu cầu:',
    `- 3 phương án khác nhau rõ rệt về cách tiếp cận.`,
    `- headline: tối đa ${COPY_LIMITS.headline} ký tự, nêu bật giá trị hoặc ưu đãi, dễ nhớ.`,
    `- subheadline: 1 câu ngắn, tối đa ${COPY_LIMITS.subheadline} ký tự (đếm kỹ), bổ sung lý do tin / chi tiết, nói với đúng đối tượng.`,
    `- cta: 2–4 từ, bắt đầu bằng động từ, tối đa ${COPY_LIMITS.cta} ký tự.`,
    '- Đúng tone giọng. Tiếng Việt có dấu, chính tả chuẩn. Không emoji, không hashtag, không dấu ngoặc kép.',
    '- KHÔNG bịa con số, mức giảm giá, thời hạn hay cam kết không có trong brief.',
    '',
    'Chỉ trả về JSON đúng dạng, không giải thích:',
    '{"variants":[{"headline":"...","subheadline":"...","cta":"..."}]}',
  ].join('\n');
}

/**
 * Cắt về `max` ký tự: ưu tiên hết câu (". ! ?") nếu giữ được ≥ 40% độ dài, rồi dấu phẩy (≥ 50%), cuối cùng ranh giới từ;
 * bỏ dấu câu treo cuối. Tránh câu cụt kiểu "Freeship áp dụng đến".
 */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (t.length <= max) return t;
  const sentence = t.slice(0, max + 1).match(/^.*[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length >= max * 0.4) return sentence.trim();
  // Không hết câu: cắt ở dấu phẩy cuối cùng (vế trọn nghĩa) nếu vẫn giữ ≥ 50%.
  const clause = t.slice(0, max + 1).match(/^.*(?=,\s)/)?.[0];
  if (clause && clause.length >= max * 0.5) return clause.trim();
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:–-]+$/, '').trim();
}

/** Đọc JSON model trả (có thể bọc ```json). Trả tối đa 3 phương án hợp lệ, không trùng; rỗng nếu hỏng. */
export function parseCopyResponse(text: string): CopyVariant[] {
  const body = text.replace(/```(?:json)?/gi, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (data as { variants?: unknown })?.variants;
  if (!Array.isArray(list)) return [];
  const out: CopyVariant[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== 'object' || v === null) continue;
    const o = v as Record<string, unknown>;
    const variant = Object.fromEntries(COPY_ROLES.map((r) => [r, typeof o[r] === 'string' ? clip(o[r] as string, COPY_LIMITS[r]) : ''])) as CopyVariant;
    if (!variant.headline) continue;
    const key = variant.headline.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(variant);
    if (out.length === 3) break;
  }
  return out;
}
