/**
 * Fixture legacy (T1.4, Q1).
 * - `logged-*`: body thật form gửi POST /api/generate, log từ form chạy local ngày 2026-10-12.
 *   Đã làm sạch: asset id/url/fileName thay bằng tên cố định, dataUrl thay bằng placeholder.
 * - `constructed-*`: tự dựng cho trường hợp log chưa phủ (Q1B).
 * `form` = 4 field text trong store/editor.ts tại lúc gửi.
 */
import type { GenerationRequest } from '@/lib/types';
import type { LegacyFormText } from '../../../legacy/from-legacy-config';
import headlineCta from './logged-headline-cta.json';
import promptOnly from './logged-prompt-only.json';
import fullTextLogo from './logged-full-text-logo.json';
import miniappBold from './logged-miniapp-bold.json';
import allRoles from './constructed-all-roles.json';

export interface LegacyFixture {
  source: 'logged' | 'constructed';
  description: string;
  request: GenerationRequest;
  form: LegacyFormText;
}

const asFixture = (raw: unknown) => raw as LegacyFixture;

export const LEGACY_FIXTURES: Record<string, LegacyFixture> = {
  'logged-headline-cta': asFixture(headlineCta),
  'logged-prompt-only': asFixture(promptOnly),
  'logged-full-text-logo': asFixture(fullTextLogo),
  'logged-miniapp-bold': asFixture(miniappBold),
  'constructed-all-roles': asFixture(allRoles),
};
