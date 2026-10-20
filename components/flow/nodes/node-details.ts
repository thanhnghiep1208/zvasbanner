/**
 * Chi tiết hiện ngay trên node card (dưới header): nội dung chữ + tối đa MAX_CHIPS chip thông tin chính, không lặp
 * lại header (summarizeNode). Tuỳ chọn chi tiết xem ở Inspector.
 */
import { BRIEF_TONE_LABELS } from '@/lib/flow/brief';
import { INTENT_OPTIONS } from '@/components/prompt/MarketingBriefChips';
import { asLogoPosition, LOGO_POSITION_LABELS } from '@/lib/flow/brand';
import type { FlowNode, NodeParamsMap } from '@/lib/flow/schema';
import { PALETTE_OPTIONS } from '@/lib/style-options';

export interface DetailChip {
  label: string;
  /** Ô màu cạnh nhãn (màu chữ, màu thương hiệu). */
  swatch?: string;
  /** Chỉ vẽ ô màu, nhãn thành tooltip (dãy màu thương hiệu). */
  swatchOnly?: boolean;
}

export interface NodeDetails {
  /** Nội dung chữ đầy đủ (không cắt). Rỗng → hiện "(trống)". */
  text?: string;
  chips: DetailChip[];
}

const labelOf = <V extends string>(opts: readonly { value: V; label: string }[], v: V) =>
  opts.find((o) => o.value === v)?.label ?? v;

/** Bỏ emoji đầu nhãn của form ("⚡ Flash sale" → "Flash sale") cho chip gọn. */
const plain = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '');

/** Thẻ node chỉ giữ thông tin chính; phần còn lại xem ở Inspector. Quá số này → chip "+N". */
export const MAX_CHIPS = 3;

function capped(chips: DetailChip[]): DetailChip[] {
  return chips.length > MAX_CHIPS ? [...chips.slice(0, MAX_CHIPS - 1), { label: `+${chips.length - MAX_CHIPS + 1}` }] : chips;
}

function textLayer(p: NodeParamsMap['text-layer']): NodeDetails {
  // Vai trò đã ở header; font/màu do AI chọn theo Phong cách + Brand kit → không có chip.
  return { text: p.content, chips: [] };
}

function brief(p: NodeParamsMap['brief']): NodeDetails {
  // Thẻ node ưu tiên thông điệp (brief marketing); chưa có thì hiện mô tả nền. Chủ thể chính chỉ ở Inspector.
  const c = p.campaign;
  return {
    text: c?.message.trim() || c?.offer.trim() || p.prompt,
    chips: capped([
      ...(c?.tone ? [{ label: BRIEF_TONE_LABELS[c.tone] }] : []),
      ...p.marketingBrief.campaignIntents.map((v) => ({ label: plain(labelOf(INTENT_OPTIONS, v)) })),
    ]),
  };
}

function style(p: NodeParamsMap['style']): NodeDetails {
  // Phong cách · Mood đã ở header; tuỳ chọn nền gộp thành 1 chip đếm.
  const bg = p.backgroundConfig;
  const n = bg.tones.length + bg.grains.length + bg.shapes.length + bg.effects.length;
  return {
    chips: [
      { label: labelOf(PALETTE_OPTIONS, p.colorPalette) },
      ...(n ? [{ label: `${n} tuỳ chọn nền` }] : []),
    ],
  };
}

function brandKit(p: NodeParamsMap['brand-kit']): NodeDetails {
  const logo = p.logoPosition ? asLogoPosition(p.logoPosition) : undefined;
  return {
    chips: [
      // Màu: chỉ ô màu (số màu đã ở header), mã hex ở tooltip.
      ...p.colors.map((c) => ({ label: c, swatch: c, swatchOnly: true })),
      ...(p.logoPosition ? [{ label: `Logo ${logo ? LOGO_POSITION_LABELS[logo] : p.logoPosition}` }] : []),
    ],
  };
}

/** null = node không có phần chi tiết. */
export function nodeDetails(node: FlowNode): NodeDetails | null {
  switch (node.type) {
    case 'text-layer': return textLayer(node.params as NodeParamsMap['text-layer']);
    case 'brief': return brief(node.params as NodeParamsMap['brief']);
    case 'style': return style(node.params as NodeParamsMap['style']);
    case 'brand-kit': return brandKit(node.params as NodeParamsMap['brand-kit']);
    default: return null;
  }
}
