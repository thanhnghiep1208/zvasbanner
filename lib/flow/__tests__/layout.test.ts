import { describe, expect, it } from 'vitest';
import { getPresetById, presetToCanvasConfig } from '@/lib/canvas-presets';
import type { FlowAsset, NodeParamsMap, PixelAssetRole, RatioSpec, TextRole, Transform } from '../schema';
import { defaultTextStyle, type TextStyle } from '../text/text-style';
import {
  approxMeasurer, classifyRatio, layoutText, LAYOUT_VARIANTS, MIN_PRODUCT_SCALE, planLayout, planLayoutForJob,
  transformToRect, type LayoutInput, type LayoutVariant, type Rect, type SlotKind, type TextMeasurer,
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
const ZALO = RATIOS['landscape (Zalo OA)']!;

const asset = (assetId: string, role: PixelAssetRole, width: number, height: number): FlowAsset<PixelAssetRole> => ({
  assetId, role, hasAlpha: true, url: '', fileName: `${assetId}.png`, originalDims: { width, height },
});
const text = (
  layerId: string, role: TextRole, priority: number, content = layerId, style: Partial<TextStyle> = {}, minFontSizePx = 14,
): NodeParamsMap['text-layer'] => ({
  layerId, role, content, renderSource: 'layer', priority, minFontSizePx, style: { ...defaultTextStyle(role), ...style },
});

const FULL: Omit<LayoutInput, 'ratios'> = {
  products: [asset('sp1', 'image', 1536, 1024), asset('sp2', 'decoration', 400, 800), asset('logo', 'logo', 224, 224)],
  textLayers: [
    text('h', 'headline', 1, 'Giảm 30% cuối tuần'),
    text('s', 'subheadline', 2, 'Quà tặng cao cấp'),
    text('c', 'cta', 3, 'Mua ngay'),
    text('x', 'custom', 4, 'Áp dụng đến 31/12'),
  ],
  overrides: {},
};

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

const ok = (res: ReturnType<typeof planLayout>) => {
  if (!res.ok) throw new Error(res.message);
  return res.plan;
};

describe('classifyRatio', () => {
  it.each([
    [3000, 1000, 'ultra-wide'], [2501, 1000, 'ultra-wide'], [2500, 1000, 'landscape'],
    [1210, 1000, 'landscape'], [1200, 1000, 'square'], [800, 1000, 'square'], [799, 1000, 'portrait'],
  ])('%i×%i → %s', (w, h, cls) => expect(classifyRatio(w, h)).toBe(cls));
});

describe('variants', () => {
  const SCALES = [1, 0.9, 0.8, 0.7, MIN_PRODUCT_SCALE];
  for (const [cls, variants] of Object.entries(LAYOUT_VARIANTS)) {
    it(`${cls}: ≥ 2 variant`, () => expect(variants.length).toBeGreaterThanOrEqual(2));
    for (const v of variants) {
      it(`${v.id}: mọi productScale, slot trong vùng an toàn 4% và không chồng nhau`, () => {
        for (const s of SCALES) {
          const slots = Object.entries(v.slots(s)) as [SlotKind, Rect][];
          expect(slots).toHaveLength(5);
          for (const [name, r] of slots) {
            expect(r.w, `${name} @${s}`).toBeGreaterThan(0);
            expect(r.h, `${name} @${s}`).toBeGreaterThan(0);
            expect(r.x).toBeGreaterThanOrEqual(0.04 - 1e-9);
            expect(r.y).toBeGreaterThanOrEqual(0.04 - 1e-9);
            expect(r.x + r.w).toBeLessThanOrEqual(0.96 + 1e-9);
            expect(r.y + r.h).toBeLessThanOrEqual(0.96 + 1e-9);
          }
          for (let i = 0; i < slots.length; i++) {
            for (let j = i + 1; j < slots.length; j++) {
              expect(overlap(slots[i]![1], slots[j]![1]), `${slots[i]![0]} ∩ ${slots[j]![0]} @${s}`).toBe(false);
            }
          }
        }
      });
    }
  }

  // Nền AI vẽ mặt bục ~4/5 khung: đáy sản phẩm thấp hơn → sản phẩm như đứng trước bục (SPEC 2026-10-19).
  for (const v of [...LAYOUT_VARIANTS.landscape, ...LAYOUT_VARIANTS['ultra-wide']]) {
    it(`${v.id}: đáy slot sản phẩm ~0.82, không sát mép dưới`, () => {
      for (const s of SCALES) {
        const p = v.slots(s).product;
        expect(p.y + p.h).toBeCloseTo(0.82, 2);
      }
    });
  }
});

describe('layoutText', () => {
  const style = { ...defaultTextStyle('subheadline'), fontSizePx: 20, lineHeight: 1.2, maxLines: 0 };
  const fixed: TextMeasurer = { width: (t, _s, size) => t.length * size * 0.5 }; // mỗi ký tự = 0.5em

  it('xuống dòng tham lam theo khoảng trắng', () => {
    // 20px → 10px/ký tự; rộng 100px = 10 ký tự / dòng
    const box = layoutText('aaa bbb ccc ddd', style, 20, 100, 1, fixed);
    expect(box.lines).toEqual(['aaa bbb', 'ccc ddd']);
    expect(box.height).toBeCloseTo(2 * 20 * 1.2);
    expect(box.overflow).toBe(false);
  });
  it('từ dài hơn bề rộng → overflow', () => {
    expect(layoutText('aaaaaaaaaaaa', style, 20, 100, 1, fixed).overflow).toBe(true);
  });
  it('vượt maxLines → overflow', () => {
    expect(layoutText('aaa bbb ccc ddd', { ...style, maxLines: 1 }, 20, 100, 1, fixed).overflow).toBe(true);
  });
  it('uppercase đo bản viết hoa; plate cộng padding theo scale', () => {
    const seen: string[] = [];
    const spy: TextMeasurer = { width: (t, s, z) => { seen.push(t); return fixed.width(t, s, z); } };
    const plate = { color: '#000000', paddingX: 10, paddingY: 5, radiusPx: 0 };
    const box = layoutText('mua', { ...style, textTransform: 'uppercase', plate }, 20, 200, 2, spy);
    expect(seen).toContain('MUA');
    expect(box.width).toBeCloseTo(30 + 2 * 10 * 2);
    expect(box.height).toBeCloseTo(20 * 1.2 + 2 * 5 * 2);
  });
  it('xuống dòng cứng giữ nguyên', () => {
    expect(layoutText('một\nhai', style, 20, 1000, 1, fixed).lines).toEqual(['một', 'hai']);
  });
});

describe('planLayout – theo ratio class', () => {
  for (const [name, ratio] of Object.entries(RATIOS)) {
    describe(name, () => {
      const plan = ok(planLayout({ ...FULL, ratios: [ratio] }));
      const t = plan.transforms[ratio.id]!;

      it('mọi phần tử đều có vị trí, không bỏ phần tử nào', () => {
        expect(Object.keys(t).sort()).toEqual(['c', 'h', 'logo', 's', 'sp1', 'sp2', 'x']);
      });

      it('không phần tử nào chồng nhau, tất cả nằm trong canvas', () => {
        const rects = Object.entries(t).map(([id, tr]) => [id, transformToRect(tr)] as const);
        for (const [id, r] of rects) {
          expect(r.x, id).toBeGreaterThanOrEqual(-1e-9);
          expect(r.y, id).toBeGreaterThanOrEqual(-1e-9);
          expect(r.x + r.w, id).toBeLessThanOrEqual(1 + 1e-9);
          expect(r.y + r.h, id).toBeLessThanOrEqual(1 + 1e-9);
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
          expect((tr.w * ratio.width) / (tr.h * ratio.height)).toBeCloseTo(a.originalDims.width / a.originalDims.height, 6);
        }
      });

      it('mỗi text có cỡ chữ thật trong [min, gốc] × scale và các dòng', () => {
        const scale = Math.min(ratio.width, ratio.height) / 1080;
        for (const l of FULL.textLayers) {
          const placed = plan.text[ratio.id]![l.layerId]!;
          expect(placed.lines.join(' ')).toBe(l.content);
          expect(placed.fontSizePx).toBeLessThanOrEqual(l.style.fontSizePx * scale + 1e-6);
          expect(placed.fontSizePx).toBeGreaterThanOrEqual(Math.min(l.minFontSizePx, l.style.fontSizePx) * scale - 1e-6);
        }
      });

      it('guide có đủ phần tử, đúng loại', () => {
        const kinds = Object.fromEntries(plan.guide[ratio.id]!.map((g) => [g.elementId, g.kind]));
        expect(kinds).toEqual({ sp1: 'product', sp2: 'product', logo: 'logo', h: 'text', s: 'text', c: 'text', x: 'text' });
      });
    });
  }
});

describe('planLayout – co giãn', () => {
  it('chữ ngắn: không co sản phẩm, giữ cỡ chữ gốc', () => {
    const plan = ok(planLayout({ ...FULL, ratios: [ZALO] }));
    expect(plan.productScale[ZALO.id]).toBe(1);
    const scale = 645 / 1080;
    expect(plan.text[ZALO.id]!.h!.fontSizePx).toBeCloseTo(72 * scale);
  });

  it('headline dài hơn: co sản phẩm trước, cỡ chữ giữ nguyên', () => {
    // ~35 ký tự: không vừa 2 dòng ở cột chữ gốc, vừa khi cột chữ nới ra (sản phẩm co).
    const long = text('h', 'headline', 1, 'Siêu sale cuối năm giảm 50% hộp quà');
    const plan = ok(planLayout({ ...FULL, textLayers: [long], ratios: [ZALO] }));
    expect(plan.productScale[ZALO.id]).toBeLessThan(1);
    expect(plan.text[ZALO.id]!.h!.fontSizePx).toBeCloseTo(72 * (645 / 1080));
  });

  it('headline rất dài: sản phẩm co tối đa rồi mới co chữ (không dưới tối thiểu)', () => {
    const long = text('h', 'headline', 1,
      'Siêu sale cuối năm giảm đến 50% toàn bộ hộp quà Tết cao cấp, giao nhanh trong ngày tại Hà Nội và TP.HCM', {}, 20);
    const plan = ok(planLayout({ ...FULL, textLayers: [long], ratios: [ZALO] }));
    const scale = 645 / 1080;
    expect(plan.productScale[ZALO.id]).toBe(MIN_PRODUCT_SCALE);
    expect(plan.text[ZALO.id]!.h!.fontSizePx).toBeLessThan(72 * scale);
    expect(plan.text[ZALO.id]!.h!.fontSizePx).toBeGreaterThanOrEqual(20 * scale - 1e-6);
  });

  it('cùng slot: layer priority thấp co trước', () => {
    // maxLines 1 + nội dung dài: co sản phẩm chưa đủ, buộc co chữ.
    const long = 'Quà tặng cao cấp cho người thân yêu dịp Tết, giao nhanh toàn quốc trong ngày';
    const sub = text('s', 'subheadline', 2, long, { fontSizePx: 36, maxLines: 1 }, 10);
    const note = text('x', 'custom', 5, long, { fontSizePx: 36, maxLines: 1 }, 10);
    const plan = ok(planLayout({ ...FULL, textLayers: [sub, note], ratios: [ZALO] }));
    const placed = plan.text[ZALO.id]!;
    expect(placed.x!.fontSizePx).toBeLessThan(placed.s!.fontSizePx);
  });

  it('thử variant kế tiếp khi variant đầu không chứa nổi', () => {
    const tiny = (s: number) => ({ ...LAYOUT_VARIANTS.landscape[0]!.slots(s), headline: { x: 0.06, y: 0.2, w: 0.02, h: 0.02 } });
    const variants = { ...LAYOUT_VARIANTS, landscape: [
      { id: 'tiny', ratioClass: 'landscape', slots: tiny } satisfies LayoutVariant,
      LAYOUT_VARIANTS.landscape[1]!,
    ] };
    const plan = ok(planLayout({ ...FULL, ratios: [ZALO] }, { variants }));
    expect(plan.variantId[ZALO.id]).toBe('landscape-text-right');
  });

  it('không variant nào chứa nổi → no-fit, nêu đúng phần tử, không tự bỏ', () => {
    const huge = text('h', 'headline', 1, 'Supercalifragilisticexpialidocious-khong-the-xuong-dong', {}, 60);
    const res = planLayout({ ...FULL, textLayers: [huge, text('c', 'cta', 3, 'Mua ngay')], ratios: [ZALO] });
    expect(res).toMatchObject({ ok: false, reason: 'no-fit', ratioId: ZALO.id, elementIds: ['h'] });
    expect(!res.ok && res.message).toContain('Zalo OA Img');
  });

  it('maxLines nhỏ buộc phải co chữ', () => {
    const h = text('h', 'headline', 1, 'Giảm 30% toàn bộ cửa hàng cuối tuần này', { maxLines: 1 }, 10);
    const plan = ok(planLayout({ ...FULL, textLayers: [h], ratios: [ZALO] }));
    expect(plan.text[ZALO.id]!.h!.lines).toHaveLength(1);
    expect(plan.text[ZALO.id]!.h!.fontSizePx).toBeLessThan(72 * (645 / 1080));
  });

  it('dùng measurer truyền vào (T4.4 thay bằng Canvas 2D)', () => {
    let calls = 0;
    const spy: TextMeasurer = { width: (t, s, z) => { calls++; return approxMeasurer.width(t, s, z); } };
    ok(planLayout({ ...FULL, ratios: [ZALO] }, { measurer: spy }));
    expect(calls).toBeGreaterThan(0);
  });
});

describe('planLayout – override & khác', () => {
  it('override tay thắng, chỉ ở đúng ratio đó; text bị override không đo', () => {
    const o: Transform = { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rotationDeg: 15 };
    const b = RATIOS['portrait (story 1080×1920)']!;
    const plan = ok(planLayout({ ...FULL, ratios: [ZALO, b], overrides: { [ZALO.id]: { sp1: o, h: o } } }));
    expect(plan.transforms[ZALO.id]!.sp1).toEqual(o);
    expect(plan.transforms[ZALO.id]!.h).toEqual(o);
    expect(plan.text[ZALO.id]!).not.toHaveProperty('h');
    expect(plan.transforms[b.id]!.sp1).not.toEqual(o);
  });

  it('override cho phần tử không còn tồn tại bị bỏ qua', () => {
    const plan = ok(planLayout({ ...FULL, ratios: [ZALO], overrides: { [ZALO.id]: { gone: { cx: 0, cy: 0, w: 0, h: 0, rotationDeg: 0 } } } }));
    expect(Object.keys(plan.transforms[ZALO.id]!)).not.toContain('gone');
  });

  it('deterministic', () => {
    const input = { ...FULL, ratios: Object.values(RATIOS) };
    expect(planLayout(input)).toEqual(planLayout(input));
  });

  it('text cùng slot xếp theo priority, không theo thứ tự khai báo', () => {
    const r = RATIOS['square (Báo Mới 300×250)']!;
    const plan = ok(planLayout({ ...FULL, ratios: [r], textLayers: [text('x', 'custom', 1, 'Ghi chú'), text('s', 'subheadline', 2, 'Phụ')] }));
    expect(plan.transforms[r.id]!.x!.cy).toBeLessThan(plan.transforms[r.id]!.s!.cy);
  });

  it('kích thước không hợp lệ → lỗi, không throw', () => {
    expect(planLayout({ ...FULL, ratios: [custom(0, 100)] })).toMatchObject({ ok: false, reason: 'invalid-ratio' });
  });

  it('planLayoutForJob dùng override của job composed', () => {
    const plan = ok(planLayoutForJob(composedFull));
    expect(plan.transforms['custom-1080x1920']!['asset-hop-qua'])
      .toEqual(composedFull.composed!.layoutOverrides['custom-1080x1920']!['asset-hop-qua']);
    expect(Object.keys(plan.variantId)).toEqual(composedFull.ratios.map((r) => r.id));
  });
});

describe('planLayout – cột chữ (packText)', () => {
  const texts = [text('h', 'headline', 1, 'Tết Sum Vầy'), text('s', 'subheadline', 2, 'Quà tặng cao cấp từ 499K'), text('c', 'cta', 3, 'Mua ngay')];
  const plan = ok(planLayout({ ...FULL, textLayers: texts, ratios: [ZALO] }));
  const r = (id: string) => transformToRect(plan.transforms[ZALO.id]![id]!);

  it('headline → subheadline → CTA liền nhau, khoảng cách đều, ≤ 3% chiều cao', () => {
    const g1 = r('s').y - (r('h').y + r('h').h);
    const g2 = r('c').y - (r('s').y + r('s').h);
    expect(g1).toBeGreaterThan(0);
    expect(g1).toBeCloseTo(g2, 6);
    expect(g1).toBeLessThanOrEqual(0.03 + 1e-9);
  });

  it('CTA căn giữa thẳng hàng với headline/subheadline (cùng align center)', () => {
    const cx = (id: string) => r(id).x + r(id).w / 2;
    expect(cx('c')).toBeCloseTo(cx('h'), 6);
    expect(cx('s')).toBeCloseTo(cx('h'), 6);
  });

  it('cả khối nằm trong cột chữ, không đè sản phẩm', () => {
    const product = transformToRect(plan.transforms[ZALO.id]!.sp1!);
    for (const id of ['h', 's', 'c']) expect(overlap(r(id), product)).toBe(false);
  });
});
