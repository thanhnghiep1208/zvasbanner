/**
 * Brand kit trong Flow canvas (T4.5). `BrandKit` (lib/types.ts) dùng chung với form: các field là chuỗi tự do
 * để form cũ gửi thẳng vào prompt. Canvas chuẩn hoá về giá trị có nghĩa với layout/renderer:
 * - `logoPosition` ∈ LOGO_POSITIONS → layout đặt logo vào góc đó (nếu không đè vùng khác).
 * - `fontPreference` = nhãn font trong FLOW_FONTS → font mặc định cho Text mới.
 */
import type { Rect } from './layout/types';
import { FLOW_FONTS, type FontId } from './text/text-style';

export const LOGO_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  'top-left': 'Góc trên trái',
  'top-right': 'Góc trên phải',
  'bottom-left': 'Góc dưới trái',
  'bottom-right': 'Góc dưới phải',
};

export function asLogoPosition(v: string | undefined): LogoPosition | undefined {
  return (LOGO_POSITIONS as readonly string[]).includes(v ?? '') ? (v as LogoPosition) : undefined;
}

/** Lề an toàn khi đặt logo vào góc (cùng mức với variant). */
const CORNER_MARGIN = 0.05;

/** Ô logo cùng kích thước `slot`, dời vào góc `pos`. */
export function logoCornerRect(slot: Rect, pos: LogoPosition): Rect {
  const x = pos.endsWith('left') ? CORNER_MARGIN : 1 - CORNER_MARGIN - slot.w;
  const y = pos.startsWith('top') ? CORNER_MARGIN : 1 - CORNER_MARGIN - slot.h;
  return { x, y, w: slot.w, h: slot.h };
}

/** Nhãn font (form/brand lưu dạng chữ) → FontId; không khớp → undefined. */
export function fontIdFromLabel(label: string | undefined): FontId | undefined {
  const norm = (s: string) => s.trim().toLowerCase();
  if (!label) return undefined;
  return (Object.keys(FLOW_FONTS) as FontId[]).find((id) => norm(FLOW_FONTS[id].label) === norm(label) || id === norm(label));
}

const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isHexColor = (c: string) => HEX.test(c);
