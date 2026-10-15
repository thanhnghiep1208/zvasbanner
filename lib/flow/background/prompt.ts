/**
 * Prompt Generate Background (SPEC 5.3). Pure, test được.
 *
 * Gồm: brief + mục tiêu chiến dịch, style (dùng chung câu chữ với form qua buildStylePhrase), brand,
 * hướng sáng, vùng phải để trống theo layout guide, cấm chữ (trừ headline AI trong đúng slot của nó).
 * Không mô tả chủ thể chính (focal subject): nền không được tự vẽ sản phẩm – sản phẩm thật ghép ở Compose.
 */
import { buildStylePhrase } from '@/lib/prompt-builder';
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

function zoneLine(g: GuideRect): string {
  const what = g.kind === 'product' ? 'product' : g.kind === 'logo' ? 'logo' : 'text';
  return `- ${what} zone: left ${pct(g.x)}, top ${pct(g.y)}, width ${pct(g.w)}, height ${pct(g.h)}`;
}

export function buildBackgroundPrompt(req: Omit<BackgroundRequest, 'guideImage' | 'references'> & {
  references?: Pick<BackgroundRequest['references'][number], 'role'>[];
}): string {
  const { width, height, platform, name } = req.canvasConfig;
  const light = lightDirectionLabel(req.lightDirectionDeg);
  const style = buildStylePhrase(
    { ...(req.style ?? DEFAULT_STYLE), strictPreserveMode: false },
    // Chỉ giữ mục tiêu chiến dịch; bỏ focal subject để model không vẽ sản phẩm/người vào nền.
    { campaignIntents: req.marketingBrief.campaignIntents ?? [], focalSubjects: [] },
  );
  const aiZone = req.aiHeadline && req.guide.find((g) => g.elementId === req.aiHeadline!.elementId);
  const zones = req.guide.filter((g) => g !== aiZone);
  const brand = req.brandKit;
  const refs = req.references ?? [];

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
  if (refs.some((r) => r.role === 'style-reference')) {
    lines.push('Match the attached STYLE REFERENCE images: palette relationships, gradients, grain and graphic language. Do not copy their text, logos or products.');
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

  lines.push('', '=== BRIEF ===', req.prompt.trim() || '(no extra brief)');
  return lines.join('\n');
}
