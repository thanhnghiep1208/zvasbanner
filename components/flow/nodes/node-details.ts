/**
 * Chi tiết hiện ngay trên node card (dưới header): nội dung chữ đầy đủ + các tuỳ chọn đã chọn dạng chip, để đọc graph
 * không cần mở Inspector. Header vẫn giữ tóm tắt 1 dòng (summarizeNode).
 */
import { FOCAL_OPTIONS, INTENT_OPTIONS } from '@/components/prompt/MarketingBriefChips';
import {
  BACKGROUND_EFFECT_OPTIONS, BACKGROUND_GRAIN_OPTIONS, BACKGROUND_SHAPE_OPTIONS, BACKGROUND_TONE_OPTIONS,
} from '@/lib/background-options';
import { asLogoPosition, LOGO_POSITION_LABELS } from '@/lib/flow/brand';
import type { FlowNode, NodeParamsMap } from '@/lib/flow/schema';
import { FLOW_FONTS } from '@/lib/flow/text/text-style';
import { FONT_STYLE_OPTIONS, MOOD_OPTIONS, PALETTE_OPTIONS, STYLE_OPTIONS } from '@/lib/style-options';

export interface DetailChip {
  label: string;
  /** Ô màu cạnh nhãn (màu chữ, màu nền chữ, màu thương hiệu). */
  swatch?: string;
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

const ALIGN_LABELS = { left: 'Căn trái', center: 'Căn giữa', right: 'Căn phải' } as const;

function textLayer(p: NodeParamsMap['text-layer']): NodeDetails {
  const s = p.style;
  const chips: DetailChip[] = [
    { label: `${FLOW_FONTS[s.fontFamily]?.label ?? s.fontFamily} ${s.fontWeight}` },
    { label: `${s.fontSizePx}px (tối thiểu ${p.minFontSizePx})` },
    { label: s.fill.color, swatch: s.fill.color },
    { label: ALIGN_LABELS[s.align] },
  ];
  if (p.renderSource === 'ai') chips.unshift({ label: 'AI vẽ chữ' });
  if (s.textTransform === 'uppercase') chips.push({ label: 'IN HOA' });
  if (s.italic) chips.push({ label: 'Nghiêng' });
  if (s.maxLines) chips.push({ label: `Tối đa ${s.maxLines} dòng` });
  if (s.stroke) chips.push({ label: `Viền ${s.stroke.widthPx}px`, swatch: s.stroke.color });
  if (s.shadow) chips.push({ label: 'Bóng chữ', swatch: s.shadow.color });
  if (s.plate) chips.push({ label: 'Nền nút', swatch: s.plate.color });
  return { text: p.content, chips };
}

function brief(p: NodeParamsMap['brief']): NodeDetails {
  return {
    text: p.prompt,
    chips: [
      ...p.marketingBrief.campaignIntents.map((v) => ({ label: plain(labelOf(INTENT_OPTIONS, v)) })),
      ...p.marketingBrief.focalSubjects.map((v) => ({ label: plain(labelOf(FOCAL_OPTIONS, v)) })),
    ],
  };
}

function style(p: NodeParamsMap['style']): NodeDetails {
  const bg = p.backgroundConfig;
  return {
    chips: [
      { label: labelOf(STYLE_OPTIONS, p.style) },
      { label: labelOf(MOOD_OPTIONS, p.mood) },
      { label: labelOf(PALETTE_OPTIONS, p.colorPalette) },
      { label: labelOf(FONT_STYLE_OPTIONS, p.fontStyle) },
      ...bg.tones.map((v) => ({ label: labelOf(BACKGROUND_TONE_OPTIONS, v) })),
      ...bg.grains.map((v) => ({ label: labelOf(BACKGROUND_GRAIN_OPTIONS, v) })),
      ...bg.shapes.map((v) => ({ label: labelOf(BACKGROUND_SHAPE_OPTIONS, v) })),
      ...bg.effects.map((v) => ({ label: labelOf(BACKGROUND_EFFECT_OPTIONS, v) })),
    ],
  };
}

function brandKit(p: NodeParamsMap['brand-kit']): NodeDetails {
  const logo = p.logoPosition ? asLogoPosition(p.logoPosition) : undefined;
  return {
    chips: [
      ...p.colors.map((c) => ({ label: c, swatch: c })),
      ...(p.fontPreference ? [{ label: `Font ${p.fontPreference}` }] : []),
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
