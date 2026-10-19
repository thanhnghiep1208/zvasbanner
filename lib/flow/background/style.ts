/**
 * Câu "Style" cho prompt TẠO NỀN (composed). Không dùng buildStylePhrase của form (lib/prompt-builder.ts) vì câu đó
 * viết cho banner hoàn chỉnh: có "Typography direction…", "strong typography", "bold discount callout prominent",
 * "focal subject" – với ảnh nền, các câu đó kéo model vẽ chữ/khung khuyến mãi. Đo trên prompt thật 2026-10-19.
 *
 * Ở đây chỉ mô tả nền: phong cách, mood, màu, và các lựa chọn Tông/Chất liệu/Hình khối/Hiệu ứng nền là YÊU CẦU
 * (form cũ gửi dạng "options" – model coi là gợi ý). Bảng phủ đủ key của StyleControls nên thêm giá trị mới sẽ lỗi tsc.
 */
import type { CampaignIntent, StyleControls } from '@/lib/types';
import type { FlowStyle } from '../schema';

type Bg = StyleControls['backgroundConfig'];

const STYLE: Record<StyleControls['style'], string> = {
  minimalist: 'minimal backdrop: clean surfaces, lots of empty space, very few props, soft gradients',
  bold: 'bold backdrop: strong colour blocks, high contrast lighting, dynamic diagonal light or shapes',
  luxury: 'luxury backdrop: rich dark or cream tones, glossy stone/silk/metal materials, refined soft light, generous empty space',
  playful: 'playful backdrop: bright friendly colours, rounded soft shapes, light-hearted props',
  corporate: 'corporate backdrop: clean modern interior or abstract surfaces, restrained colours, orderly composition',
};

const MOOD: Record<StyleControls['mood'], string> = {
  energetic: 'energetic: sense of movement, vivid light, lively accents',
  calm: 'calm: soft even light, gentle gradients, airy and balanced',
  festive: 'festive: celebratory warmth, a few seasonal accents used sparingly',
  professional: 'professional: polished, credible, minimal embellishment',
};

const PALETTE: Record<StyleControls['colorPalette'], string> = {
  brand: 'build the colours from the brand colours only; no new strong hues',
  auto: 'choose a harmonious palette that fits the brief',
  monochrome: 'single-hue or neutral tonal palette',
  warm: 'warm palette: ambers, corals, soft reds, cream',
  cool: 'cool palette: blues, teals, slate, crisp white',
};

const TONES: Record<Bg['tones'][number], string> = {
  'warm-sunset': 'warm sunset gradient (orange to pink)',
  'ocean-breeze': 'fresh ocean blues and aqua',
  'deep-twilight': 'deep twilight blue-violet',
  'pastel-dream': 'soft pastel tones',
  'nordic-forest': 'muted forest greens and natural wood',
  'desert-sand': 'warm sand and beige',
  'volcanic-ash': 'dark charcoal and ash grey',
  'spring-blossom': 'light spring pinks and greens',
  'cyberpunk-neon': 'dark scene with neon magenta/cyan glow',
  'midnight-luxury': 'midnight navy/black with gold highlights',
  'industrial-grey': 'industrial concrete greys',
  'synthwave-night': 'synthwave purple-pink night glow',
  'lavender-haze': 'soft lavender haze',
  'vintage-film': 'faded vintage film colours',
  'monochrome-mist': 'misty monochrome greys',
  'ethereal-glow': 'ethereal soft glowing light',
};
const GRAINS: Record<Bg['grains'][number], string> = {
  'subtle-grain': 'a subtle film grain',
  'classic-film': 'classic film grain',
  'heavy-retro': 'heavy retro grain',
};
const SHAPES: Record<Bg['shapes'][number], string> = {
  'blurry-organic': 'blurry organic shapes',
  'abstract-blobs': 'abstract soft blobs',
  'liquid-flow': 'liquid flowing forms',
  'central-glow': 'a soft central glow',
};
const EFFECTS: Record<Bg['effects'][number], string> = {
  minimalist: 'a minimalist treatment',
  'dreamy-ethereal': 'a dreamy, ethereal haze',
  'lofi-vintage': 'a lo-fi vintage look',
  'high-contrast': 'high-contrast lighting',
};

const INTENT: Record<CampaignIntent, string> = {
  'flash-sale': 'promotional energy: punchy, attention-grabbing atmosphere',
  'product-launch': 'premium reveal: clean aspirational stage that makes a new product feel special',
  'brand-awareness': 'brand storytelling: cohesive, emotional atmosphere',
  'event': 'celebratory occasion atmosphere',
};

export function backgroundStylePhrase(style: FlowStyle, intents: CampaignIntent[] = []): string {
  const bg = style.backgroundConfig;
  const parts = [`${STYLE[style.style]}.`, `Mood: ${MOOD[style.mood]}.`, `Colour: ${PALETTE[style.colorPalette]}.`];
  const must = [
    bg.tones.length && `colour tones ${bg.tones.map((t) => TONES[t]).join(' / ')}`,
    bg.shapes.length && `${bg.shapes.map((s) => SHAPES[s]).join(' and ')}`,
    bg.effects.length && `${bg.effects.map((e) => EFFECTS[e]).join(' and ')}`,
    bg.grains.length && `${bg.grains.map((g) => GRAINS[g]).join(' and ')}`,
  ].filter(Boolean);
  if (must.length) parts.push(`Required background treatment: ${must.join('; ')}.`);
  if (intents.length) parts.push(`Campaign feel: ${intents.map((i) => INTENT[i]).join('; ')}.`);
  return parts.join(' ');
}
