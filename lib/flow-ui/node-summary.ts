/**
 * Tóm tắt params ngắn hiển thị inline trên node card (SPEC 5.6). Param dài để ở Inspector (T2.4).
 */
import { MOOD_SELECT_ITEMS, STYLE_SELECT_ITEMS } from '@/lib/style-options';
import type { FlowNode, ModelId, NodeParamsMap, NodeType, TextRole } from '@/lib/flow/schema';

/** Cùng nhãn với form hiện tại (components/canvas/CanvasArea.tsx). */
export const MODEL_LABELS: Record<ModelId, string> = {
  'nano-banana-pro': 'Nano Banana Pro',
  'nano-banana-2': 'Nano Banana 2',
};

const TEXT_ROLE_LABELS: Record<TextRole, string> = {
  headline: 'Tiêu đề chính',
  subheadline: 'Tiêu đề phụ',
  cta: 'CTA',
  custom: 'Text',
};

const SHADOW_LABELS = { auto: 'Bóng tự động', custom: 'Bóng tuỳ chỉnh', off: 'Không bóng' } as const;

const MAX = 40;
export function truncate(s: string, max = MAX): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

type Summarizers = { [K in NodeType]: (p: NodeParamsMap[K]) => string | null };

const SUMMARIZERS: Summarizers = {
  'product-asset': (p) => p.fileName || null,
  'reference-image': (p) => p.fileName || null,
  'brief': (p) => (p.prompt ? truncate(p.prompt) : null),
  'text-layer': (p) => `${TEXT_ROLE_LABELS[p.role]}: ${p.content ? truncate(p.content, 28) : '(trống)'}`,
  'brand-kit': (p) => (p.colors.length ? `${p.colors.length} màu` : null),
  'ratio': (p) => {
    const [first, ...rest] = p.ratios;
    if (!first) return null;
    const head = `${first.name} ${first.width}×${first.height}`;
    return rest.length ? `${head} +${rest.length}` : head;
  },
  'style': (p) => `${STYLE_SELECT_ITEMS[p.style]} · ${MOOD_SELECT_ITEMS[p.mood]}`,
  'auto-layout': (p) => {
    const n = Object.keys(p.overrides).length;
    return n ? `Chỉnh tay ${n} kích thước` : null;
  },
  'generate-background': (p) => MODEL_LABELS[p.model],
  'generate-flat': (p) => MODEL_LABELS[p.model],
  'compose': (p) => SHADOW_LABELS[p.shadow.mode],
  'export': (p) => `${p.format.toUpperCase()} · ${p.scale}x`,
};

export function summarizeNode(node: FlowNode): string | null {
  const fn = SUMMARIZERS[node.type] as (p: unknown) => string | null;
  return fn(node.params);
}
