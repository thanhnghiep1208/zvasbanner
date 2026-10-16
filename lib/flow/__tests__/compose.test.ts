import { describe, expect, it } from 'vitest';
import { buildComposition, contactShadow, fitAspect, lightVector, type ImageLayer, type TextLayerDraw } from '../compose/plan';
import { planLayoutForJob } from '../layout/engine';
import type { FlowAsset, PixelAssetRole, ShadowConfig } from '../schema';
import { composedFull, composedMinimal } from './fixtures';

const plan = (job = composedMinimal) => {
  const r = planLayoutForJob(job);
  if (!r.ok) throw new Error(r.message);
  return r.plan;
};

const product = (hasAlpha = true): FlowAsset<PixelAssetRole> => ({
  assetId: 'p', role: 'image', hasAlpha, url: '', fileName: 'p.png', originalDims: { width: 100, height: 100 },
});
const RECT = { x: 100, y: 100, w: 200, h: 200 };
const AUTO: ShadowConfig = { mode: 'auto', opacity: 0.35, blurPx: 24, offsetX: 0, offsetY: 8 };

describe('lightVector', () => {
  it('0° = trên, 90° = phải, 315° = trên-trái', () => {
    expect(lightVector(0).y).toBeCloseTo(-1);
    expect(lightVector(90).x).toBeCloseTo(1);
    const v = lightVector(315);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeLessThan(0);
  });
});

describe('contactShadow (SPEC 5.4)', () => {
  it('auto: elip ở đáy sản phẩm, lệch NGƯỢC hướng sáng', () => {
    const fromTopLeft = contactShadow(product(), RECT, undefined, AUTO, 315, 1)!;
    const fromTopRight = contactShadow(product(), RECT, undefined, AUTO, 45, 1)!;
    expect(fromTopLeft.cy).toBeGreaterThan(RECT.y + RECT.h * 0.9);
    expect(fromTopLeft.cy).toBeLessThanOrEqual(RECT.y + RECT.h);
    expect(fromTopLeft.cx).toBeGreaterThan(RECT.x + RECT.w / 2); // sáng trái → bóng phải
    expect(fromTopRight.cx).toBeLessThan(RECT.x + RECT.w / 2);
    expect(fromTopLeft.opacity).toBe(0.35);
  });

  it('dùng đáy vùng alpha thật, không phải đáy khung ảnh', () => {
    const s = contactShadow(product(), RECT, { x: 0.25, y: 0.1, w: 0.5, h: 0.6 }, AUTO, 0, 1)!;
    expect(s.cy).toBeLessThanOrEqual(RECT.y + RECT.h * 0.7);
    expect(s.rx).toBeCloseTo(RECT.w * 0.5 * 0.46);
    expect(s.cx).toBeCloseTo(RECT.x + RECT.w / 2); // sáng thẳng trên → không lệch ngang
  });

  it('custom: opacity/blur/offset theo config, scale theo ratio', () => {
    const custom: ShadowConfig = { mode: 'custom', opacity: 0.5, blurPx: 32, offsetX: 10, offsetY: 20 };
    const base = contactShadow(product(), RECT, undefined, { ...custom, offsetX: 0, offsetY: 0 }, 315, 0.5)!;
    const s = contactShadow(product(), RECT, undefined, custom, 315, 0.5)!;
    expect(s.opacity).toBe(0.5);
    expect(s.blurPx).toBe(16);
    expect(s.cx - base.cx).toBeCloseTo(5);
    expect(s.cy - base.cy).toBeCloseTo(10);
  });

  it('off hoặc ảnh không có alpha → không có bóng', () => {
    expect(contactShadow(product(), RECT, undefined, { ...AUTO, mode: 'off' }, 315, 1)).toBeNull();
    expect(contactShadow(product(false), RECT, undefined, AUTO, 315, 1)).toBeNull();
  });
});

describe('buildComposition', () => {
  it('thứ tự: bóng → sản phẩm → logo → chữ; kích thước = ratio', () => {
    const job = composedFull;
    const ratioId = job.ratios[0]!.id;
    const doc = buildComposition(job, plan(job), ratioId, 'bg');
    expect([doc.width, doc.height]).toEqual([job.ratios[0]!.width, job.ratios[0]!.height]);
    const kinds = doc.layers.map((l) => (l.kind === 'image' ? `image:${l.role}` : l.kind));
    const lastIndex = (k: string) => kinds.lastIndexOf(k);
    expect(lastIndex('shadow')).toBeLessThan(kinds.indexOf('image:image'));
    expect(lastIndex('image:image')).toBeLessThan(kinds.indexOf('image:logo'));
    expect(lastIndex('image:logo')).toBeLessThan(kinds.indexOf('text'));
  });

  it('headline AI không vẽ lại (đã có trong nền), text khác có dòng + cỡ đã đo', () => {
    const job = composedFull;
    const doc = buildComposition(job, plan(job), job.ratios[0]!.id, 'bg');
    const texts = doc.layers.filter((l): l is TextLayerDraw => l.kind === 'text');
    expect(texts.map((t) => t.layerId)).toEqual(['sub', 'cta']);
    expect(texts[0]!.lines).toEqual(['Quà tặng cao cấp từ 499K']);
  });

  it('style chữ scale theo cạnh ngắn ratio (plate, viền)', () => {
    const job = composedFull;
    const r = job.ratios[0]!; // 1075×645 → scale 645/1080
    const doc = buildComposition(job, plan(job), r.id, 'bg');
    const cta = doc.layers.find((l): l is TextLayerDraw => l.kind === 'text' && l.layerId === 'cta')!;
    expect(cta.style.plate!.paddingX).toBeCloseTo(40 * (645 / 1080));
  });

  it('sản phẩm/logo luôn đúng tỉ lệ gốc ở mọi kích thước, kể cả khi override tay khung lệch tỉ lệ', () => {
    const job = composedFull;
    for (const r of job.ratios) {
      const doc = buildComposition(job, plan(job), r.id, 'bg');
      for (const l of doc.layers.filter((x): x is ImageLayer => x.kind === 'image')) {
        const dims = job.products.find((p) => p.assetId === l.assetId)!.originalDims;
        expect(l.rect.w / l.rect.h).toBeCloseTo(dims.width / dims.height, 5);
      }
    }
    const logo = job.products.find((p) => p.role === 'logo')!;
    const r0 = job.ratios[0]!;
    const skewed = { ...job, composed: { ...job.composed!, layoutOverrides: {
      [r0.id]: { [logo.assetId]: { cx: 0.5, cy: 0.5, w: 0.6, h: 0.05, rotationDeg: 0 } },
    } } };
    const doc = buildComposition(skewed, plan(skewed), r0.id, 'bg');
    const l = doc.layers.find((x): x is ImageLayer => x.kind === 'image' && x.assetId === logo.assetId)!;
    expect(l.rect.w / l.rect.h).toBeCloseTo(logo.originalDims.width / logo.originalDims.height, 5);
    // Nằm gọn trong khung override, căn giữa.
    expect(l.rect.h).toBeCloseTo(0.05 * r0.height, 5);
    expect(l.rect.x + l.rect.w / 2).toBeCloseTo(0.5 * r0.width, 5);
  });

  it('fitAspect: contain + căn giữa; không rõ kích thước gốc thì giữ khung', () => {
    expect(fitAspect({ x: 0, y: 0, w: 200, h: 100 }, { width: 100, height: 100 })).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(fitAspect({ x: 10, y: 10, w: 50, h: 40 }, { width: 0, height: 0 })).toEqual({ x: 10, y: 10, w: 50, h: 40 });
  });

  it('text bị override tay vẫn được vẽ (renderer tự xuống dòng), không bỏ layer', () => {
    const job = {
      ...composedMinimal,
      composed: { ...composedMinimal.composed!, layoutOverrides: {
        [composedMinimal.ratios[0]!.id]: { headline: { cx: 0.3, cy: 0.3, w: 0.4, h: 0.2, rotationDeg: 0 } },
      } },
    };
    const doc = buildComposition(job, plan(job), job.ratios[0]!.id, 'bg');
    const h = doc.layers.find((l): l is TextLayerDraw => l.kind === 'text')!;
    expect(h.lines).toBeUndefined();
    expect(h.content).toBe('Giảm 30% cuối tuần');
    expect(h.rect.w).toBeCloseTo(0.4 * 1075);
  });

  it('sản phẩm xoay tay → không có bóng (P1)', () => {
    const ratioId = composedMinimal.ratios[0]!.id;
    const job = {
      ...composedMinimal,
      composed: { ...composedMinimal.composed!, layoutOverrides: {
        [ratioId]: { 'asset-noi-chien': { cx: 0.7, cy: 0.5, w: 0.3, h: 0.5, rotationDeg: 12 } },
      } },
    };
    const doc = buildComposition(job, plan(job), ratioId, 'bg');
    expect(doc.layers.some((l) => l.kind === 'shadow')).toBe(false);
    expect((doc.layers.find((l) => l.kind === 'image') as ImageLayer).rotationDeg).toBe(12);
  });
});
