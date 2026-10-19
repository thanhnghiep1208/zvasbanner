/**
 * Prompt Generate Background (SPEC 5.3). Pure, test được.
 *
 * Gồm: brief + mục tiêu chiến dịch, style (dùng chung câu chữ với form qua buildStylePhrase), brand,
 * hướng sáng, vùng phải để trống theo layout guide, cấm chữ (trừ headline AI trong đúng slot của nó).
 * Không mô tả chủ thể chính (focal subject): nền không được tự vẽ sản phẩm – sản phẩm thật ghép ở Compose.
 */
import { campaignPromptLines } from '../brief';
import { harmonyPromptLines } from '../palette';
import { backgroundStylePhrase } from './style';
import type { GuideRect } from '../layout/types';
import { DEFAULT_STYLE } from '../schema';
import type { BackgroundRequest } from './request';

const DIRECTIONS = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'] as const;

/** 0 = trên, theo chiều kim đồng hồ, làm tròn về 8 hướng. 315 → top-left. */
export function lightDirectionLabel(deg: number): (typeof DIRECTIONS)[number] {
  const norm = ((deg % 360) + 360) % 360;
  return DIRECTIONS[Math.round(norm / 45) % 8]!;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/*
 * ── 'natural' (T4.2b) ─────────────────────────────────────────────
 * Thí nghiệm 20 lượt: ảnh guide + toạ độ % đẩy model vào chế độ "mockup" ở square/portrait (vẽ chữ
 * "LAYOUT GUIDE", toạ độ, "Your text here", panel cắt dán). Mô tả bố cục bằng lời, không con số,
 * không từ "zone/layout/guide" → 0/6 ảnh có chữ hay panel kiểu template. Xem docs/flow/t4.2b/.
 */

const unionRect = (rs: GuideRect[]) => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

function where(r: { x: number; y: number; w: number; h: number }): string {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const v = cy < 0.36 ? 'upper' : cy > 0.64 ? 'lower' : 'middle';
  const hz = cx < 0.36 ? 'left' : cx > 0.64 ? 'right' : 'center';
  const size = r.w > 0.7 ? 'spanning almost the full width' : r.w > 0.45 ? 'about half the width'
    : r.w > 0.25 ? 'about a third of the width' : 'a narrow strip';
  return `the ${v === 'middle' && hz === 'center' ? 'central' : `${v} ${hz}`} part of the picture (${size})`;
}

/**
 * Ảnh "Banner tham chiếu style" ở chế độ ghép: nền phải giống ảnh mẫu nhất có thể (loại nền, màu, ánh sáng, hoạ tiết
 * và vị trí của chúng). Chữ, sản phẩm, logo do phần mềm ghép sau nên không lấy từ ảnh mẫu.
 */
const HARMONY_NOTE = 'These colour rules override any colour in the brief or style above where they conflict.';

/** Đồng bộ nhiều kích thước: ảnh SCENE ANCHOR = nền kích thước đầu của cùng lần chạy. */
export const SCENE_ANCHOR_RULES = [
  'The attached SCENE ANCHOR is this same campaign\'s background at another banner size. Keep the same scene, the same',
  'background colours and colour balance, lighting, materials and kind of props so all sizes look like one set;',
  're-compose them for this canvas size and the calm areas above.',
  'Do not copy it pixel for pixel and do not stretch it.',
];

export const REFERENCE_BACKGROUND_RULES = [
  'Recreate the BACKGROUND of the attached REFERENCE BANNER as closely as possible: same kind of backdrop (studio, scene or',
  'gradient), same palette and gradients, same lighting mood, same texture/grain, and the same decorative graphic elements',
  'placed in the same areas of the frame, re-fitted to this canvas size.',
  'Leave out everything that will be added later: its text, logos, buttons, products and people.',
  'The reference wins over the style settings above wherever they conflict; the reserved zones above still apply.',
];

function naturalPrompt(
  req: Parameters<typeof buildBackgroundPrompt>[0], zones: GuideRect[], aiZone: GuideRect | undefined | false,
  light: string, style: string,
): string {
  const { platform, name } = req.canvasConfig;
  const texts = zones.filter((g) => g.kind === 'text');
  const products = zones.filter((g) => g.kind === 'product');
  const refs = req.references ?? [];
  const lines = [
    `A finished background photograph/illustration for a ${platform} advertising banner (${name}).`,
    'It is NOT a template or mockup: no frames, panels, boxes, cards, placeholder text, labels, captions, numbers, watermarks or UI.',
    'The real product photo, logo and copy will be added later by software, so do not draw any product, packaging, logo or person.',
    '',
    'Composition:',
    ...(texts.length ? [`- Keep ${where(unionRect(texts))} calm and plain (smooth wall, open sky or soft light) so text can sit on it later.`] : []),
    ...(products.length ? [
      `- Keep ${where(unionRect(products))} open and empty, where a product will stand: an uncluttered floor or tabletop with a simple backdrop behind it.`,
      '  If you show a pedestal or soft spotlight for it, place it in the middle of that open space.',
    ] : []),
    '- Put decorative elements (plants, furniture, shapes, light effects) toward the outer edges, away from those calm areas.',
    '- The scene is one continuous space: no visible boundaries or blocks marking the calm areas.',
    '',
    `Lighting: one key light from the ${light}; highlights and shadows consistent with it.`,
    '',
    `Style: ${style}`,
  ];
  if (req.brandKit?.colors.length) lines.push(`Build the palette around these brand colors: ${req.brandKit.colors.join(', ')}.`);
  if (req.sceneAnchor) lines.push('', ...SCENE_ANCHOR_RULES);
  if (refs.some((r) => r.role === 'style-reference')) {
    lines.push(...REFERENCE_BACKGROUND_RULES);
  }
  if (refs.some((r) => r.role === 'background')) lines.push('Use the attached BACKGROUND image as the base scene, adapted to this format.');
  lines.push('');
  if (aiZone) {
    lines.push(`Render this headline exactly, spelled correctly, only in ${where(aiZone)}: "${req.aiHeadline!.content}". No other text anywhere.`);
  } else if (req.strictNoText) {
    lines.push('Absolutely no text, letters or numbers anywhere in the image.');
  }
  const campaign = campaignPromptLines(req.campaign);
  if (campaign.length) lines.push('', ...campaign);
  lines.push('', `Scene brief: ${req.prompt.trim() || '(none)'}`);
  // Đặt SAU brief + style (model ưu tiên chỉ dẫn cuối): brief template hay ghi màu trùng sản phẩm ("nền đỏ cam").
  const harmony = harmonyPromptLines(req.elementColors);
  if (harmony.length) lines.push('', 'Colour harmony:', ...[...harmony, HARMONY_NOTE].map((h) => `- ${h}`));
  return lines.join('\n');
}

function zoneLine(g: GuideRect): string {
  const what = g.kind === 'product' ? 'product' : g.kind === 'logo' ? 'logo' : 'text';
  return `- ${what} zone: left ${pct(g.x)}, top ${pct(g.y)}, width ${pct(g.w)}, height ${pct(g.h)}`;
}

export function buildBackgroundPrompt(req: Omit<BackgroundRequest, 'guideImage' | 'references'> & {
  references?: Pick<BackgroundRequest['references'][number], 'role'>[];
}): string {
  const { width, height, platform, name } = req.canvasConfig;
  const light = lightDirectionLabel(req.lightDirectionDeg);
  // Câu phong cách riêng cho nền (style.ts): không có hướng dẫn kiểu chữ / khung khuyến mãi / chủ thể.
  const style = backgroundStylePhrase(req.style ?? DEFAULT_STYLE, req.marketingBrief.campaignIntents ?? []);
  const aiZone = req.aiHeadline && req.guide.find((g) => g.elementId === req.aiHeadline!.elementId);
  const zones = req.guide.filter((g) => g !== aiZone);
  const brand = req.brandKit;
  const refs = req.references ?? [];

  if (req.guideStyle === 'natural') return naturalPrompt(req, zones, aiZone, light, style);

  const lines = [
    '=== TASK ===',
    `Create ONLY the background plate for a ${platform} banner (${name}), exactly ${width}×${height}px.`,
    'The real product photos, logo and text will be composited on top later by software.',
    'Do NOT draw any product, packaging, logo, person or object that could be mistaken for the advertised product.',
    '',
    '=== LAYOUT GUIDE ===',
    'The attached LAYOUT GUIDE image marks reserved zones as hatched grey boxes on white. It is only a map:',
    'never reproduce the boxes, hatching, borders, seams or any rectangular panel matching them in the output.',
    'The scene must flow continuously through every zone (same wall, same surface, same light) with no visible edge at zone borders.',
    'Keep every reserved zone clean, low-detail and low-contrast so content placed there stays readable:',
    ...zones.map(zoneLine),
    ...(zones.some((g) => g.kind === 'product')
      ? [
        'Product zone rules (most important): the real product photo will be placed exactly there.',
        '- Inside the product zone show only the continuing backdrop and an empty surface: NO props, jars, plants, towels, utensils, furniture details or objects.',
        '- If you add a pedestal, plinth or soft spotlight for the product, center it horizontally in the product zone and place it at the bottom of that zone.',
      ]
      : []),
    'Put the visual interest (props, scenery, shapes, light effects, texture) outside all reserved zones.',
    '',
    '=== LIGHTING ===',
    `Single key light from the ${light} (${Math.round(req.lightDirectionDeg)}°). All highlights and shadows in the scene must agree with it`,
    '— product shadows will be generated from the same direction.',
    '',
    '=== STYLE ===',
    style,
  ];
  // Font/vị trí logo của brand không áp cho nền (chữ và logo ghép sau) – chỉ dùng màu.
  if (brand?.colors.length) lines.push(`Brand colors to build the palette around: ${brand.colors.join(', ')}.`);
  if (req.sceneAnchor) lines.push('', '=== SAME CAMPAIGN ===', ...SCENE_ANCHOR_RULES);
  if (refs.some((r) => r.role === 'style-reference')) {
    lines.push(...REFERENCE_BACKGROUND_RULES);
  }
  if (refs.some((r) => r.role === 'background')) {
    lines.push('Use the attached BACKGROUND image as the base scene; adapt it to the canvas size and keep reserved zones clean.');
  }

  lines.push('', '=== TEXT ===');
  if (aiZone) {
    lines.push(
      `Render this headline exactly, spelled correctly, ONLY inside the headline zone (left ${pct(aiZone.x)}, top ${pct(aiZone.y)}, width ${pct(aiZone.w)}, height ${pct(aiZone.h)}):`,
      `"${req.aiHeadline!.content}"`,
      req.strictNoText ? 'No other text, letters, numbers, watermarks or signage anywhere else.' : 'Avoid any other text.',
    );
  } else if (req.strictNoText) {
    lines.push('ABSOLUTELY NO text, letters, numbers, watermarks, signage or UI elements anywhere in the image.');
  } else {
    lines.push('Avoid text; the real copy will be added later.');
  }

  const campaign = campaignPromptLines(req.campaign);
  if (campaign.length) lines.push('', '=== CAMPAIGN ===', ...campaign);
  lines.push('', '=== BRIEF ===', req.prompt.trim() || '(no extra brief)');
  const harmony = harmonyPromptLines(req.elementColors);
  if (harmony.length) lines.push('', '=== COLOUR HARMONY ===', ...harmony, HARMONY_NOTE);
  return lines.join('\n');
}
