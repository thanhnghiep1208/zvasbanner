/**
 * Brand kit trong Flow canvas (T4.5). `BrandKit` (lib/types.ts) dùng chung với form: các field là chuỗi tự do
 * để form cũ gửi thẳng vào prompt. Canvas chuẩn hoá về giá trị cố định:
 * - `logoPosition` ∈ LOGO_POSITIONS → gửi vào prompt để AI đặt logo vào góc đó.
 * - `fontPreference` = nhãn font trong FLOW_FONTS → gửi vào prompt để AI vẽ chữ theo font đó.
 */
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

/** Nhãn font (form/brand lưu dạng chữ) → FontId; không khớp → undefined. */
export function fontIdFromLabel(label: string | undefined): FontId | undefined {
  const norm = (s: string) => s.trim().toLowerCase();
  if (!label) return undefined;
  return (Object.keys(FLOW_FONTS) as FontId[]).find((id) => norm(FLOW_FONTS[id].label) === norm(label) || id === norm(label));
}

const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isHexColor = (c: string) => HEX.test(c);
