import { describe, expect, it } from 'vitest';
import { getPresetById, presetToCanvasConfig } from '@/lib/canvas-presets';
import type { FlowAsset, PixelAssetRole, RatioSpec, Transform } from '../schema';
import { defaultTextStyle } from '../text/text-style';
import {
  classifyRatio, LAYOUT_VARIANTS, planLayout, planLayoutForJob, transformToRect,
  type LayoutInput, type Rect, type SlotKind,
} from '../layout';
import { composedFull } from './fixtures';

const preset = (id: string): RatioSpec => ({ id, ...presetToCanvasConfig(getPresetById(id)!) });
const custom = (w: number, h: number): RatioSpec =>
  ({ id: `custom-${w}x${h}`, width: w, height: h, platform: 'Custom', name: 'Custom' });

/** Mỗi ratio class ít nhất 1 kích thước thật (portrait chưa có preset → custom). */
const RATIOS: Record<string, RatioSpec> = {
  'landscape (Zalo OA)': preset('social-zalo-oa-img'),
  'ultra-wide (MP3 home 3:1)': preset('mp3-home'),
  'square (Báo Mới 300×250)': preset('baomoi-medium-rectangle'),
  'portrait (story 1080×1920)': custom(1080, 1920),
};

const asset = (assetId: string, role: PixelAssetRole, width: number, height: number): FlowAsset<PixelAssetRole> => ({
  assetId, role, hasAlpha: true, url: '', fileName: `${assetId}.png`, originalDims: { width, height },
});
const text = (layerId: string, role: 'headline' | 'subheadline' | 'cta' | 'custom', priority: number) => ({
  layerId, role, content: layerId, renderSource: 'layer' as const, priority, minFontSizePx: 14, style: defaultTextStyle(role),
});

const FULL: Omit<LayoutInput, 'ratios'> = {
  products: [asset('sp1', 'image', 1536, 1024), asset('sp2', 'decoration', 400, 800), asset('logo', 'logo', 224, 224)],
  textLayers: [text('h', 'headline', 1), text('s', 'subheadline', 2), text('c', 'cta', 3), text('x', 'custom', 4)],
  overrides: {},
};

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('classifyRatio', () => {
  it.each([
    [3000, 1000, 'ultra-wide'], [2501, 1000, 'ultra-wide'], [2500, 1000, 'landscape'],
    [1210, 1000, 'landscape'], [1200, 1000, 'square'], [800, 1000, 'square'], [799, 1000, 'portrait'],
  ])('%i×%i → %s', (w, h, cls) => expect(classifyRatio(w, h)).toBe(cls));
});

describe('variants', () => {
  for (const [cls, variants] of Object.entries(LAYOUT_VARIANTS)) {
    it(`${cls}: slot trong vùng an toàn 4% và không chồng nhau`, () => {
      for (const v of variants) {
        const slots = Object.entries(v.slots) as [SlotKind, Rect][];
        for (const [, r] of slots) {
          expect(r.x).toBeGreaterThanOrEqual(0.04);
          expect(r.y).toBeGreaterThanOrEqual(0.04);
          expect(r.x + r.w).toBeLessThanOrEqual(0.96 + 1e-9);
          expect(r.y + r.h).toBeLessThanOrEqual(0.96 + 1e-9);
        }
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            expect(overlap(slots[i]![1], slots[j]![1]), `${slots[i]![0]} ∩ ${slots[j]![0]}`).toBe(false);
          }
        }
      }
    });
  }
});

describe('planLayout', () => {
  for (const [name, ratio] of Object.entries(RATIOS)) {
    describe(name, () => {
      const res = planLayout({ ...FULL, ratios: [ratio] });
      if (!res.ok) throw new Error(res.message);
      const t = res.plan.transforms[ratio.id]!;

      it('mọi phần tử đều có vị trí, không bỏ phần tử nào', () => {
        expect(Object.keys(t).sort()).toEqual(['c', 'h', 'logo', 's', 'sp1', 'sp2', 'x']);
      });

      it('không phần tử nào chồng nhau, tất cả nằm trong canvas', () => {
        const rects = Object.entries(t).map(([id, tr]) => [id, transformToRect(tr)] as const);
        for (const [, r] of rects) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
          expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
        }
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            expect(overlap(rects[i]![1], rects[j]![1]), `${rects[i]![0]} ∩ ${rects[j]![0]}`).toBe(false);
          }
        }
      });

      it('asset giữ đúng tỉ lệ ảnh gốc (không méo)', () => {
        for (const a of FULL.products) {
          const tr = t[a.assetId]!;
          const px = (tr.w * ratio.width) / (tr.h * ratio.height);
          expect(px).toBeCloseTo(a.originalDims.width / a.originalDims.height, 6);
        }
      });

      it('guide có đủ phần tử, đúng loại', () => {
        const kinds = Object.fromEntries(res.plan.guide[ratio.id]!.map((g) => [g.elementId, g.kind]));
        expect(kinds).toEqual({ sp1: 'product', sp2: 'product', logo: 'logo', h: 'text', s: 'text', c: 'text', x: 'text' });
      });
    });
  }

  it('override tay thắng, chỉ ở đúng ratio đó', () => {
    const o: Transform = { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rotationDeg: 15 };
    const a = RATIOS['landscape (Zalo OA)']!;
    const b = RATIOS['portrait (story 1080×1920)']!;
    const res = planLayout({ ...FULL, ratios: [a, b], overrides: { [a.id]: { sp1: o } } });
    if (!res.ok) throw new Error();
    expect(res.plan.transforms[a.id]!.sp1).toEqual(o);
    expect(res.plan.transforms[b.id]!.sp1).not.toEqual(o);
  });

  it('override cho phần tử không còn tồn tại bị bỏ qua', () => {
    const r = RATIOS['landscape (Zalo OA)']!;
    const res = planLayout({ ...FULL, ratios: [r], overrides: { [r.id]: { gone: { cx: 0, cy: 0, w: 0, h: 0, rotationDeg: 0 } } } });
    expect(res.ok && Object.keys(res.plan.transforms[r.id]!)).not.toContain('gone');
  });

  it('deterministic', () => {
    const input = { ...FULL, ratios: Object.values(RATIOS) };
    expect(planLayout(input)).toEqual(planLayout(input));
  });

  it('text xếp theo priority, không theo thứ tự khai báo', () => {
    const r = RATIOS['square (Báo Mới 300×250)']!;
    const res = planLayout({ ...FULL, ratios: [r], textLayers: [text('x', 'custom', 1), text('s', 'subheadline', 2)] });
    if (!res.ok) throw new Error();
    expect(res.plan.transforms[r.id]!.x!.cy).toBeLessThan(res.plan.transforms[r.id]!.s!.cy);
  });

  it('kích thước không hợp lệ → lỗi, không throw', () => {
    expect(planLayout({ ...FULL, ratios: [custom(0, 100)] })).toMatchObject({ ok: false, reason: 'invalid-ratio' });
  });

  it('planLayoutForJob dùng override của job composed', () => {
    const res = planLayoutForJob(composedFull);
    if (!res.ok) throw new Error();
    expect(res.plan.transforms['custom-1080x1920']!['asset-hop-qua'])
      .toEqual(composedFull.composed!.layoutOverrides['custom-1080x1920']!['asset-hop-qua']);
    expect(Object.keys(res.plan.variantId)).toEqual(composedFull.ratios.map((r) => r.id));
  });
});
