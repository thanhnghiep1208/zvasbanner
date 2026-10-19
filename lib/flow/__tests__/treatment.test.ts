import { describe, expect, it } from 'vitest';
import { planLayout } from '../layout/engine';
import { approxMeasurer } from '../layout/measure';
import { DEFAULT_RATIO } from '../schema';
import { TEXT_ROLE_DEFAULTS } from '../text/text-style';
import { logoHalo, mix, plateTreatment, scrimFor, textTreatment, type Look } from '../text/treatment';

const DARK_BUSY = { r: 90, g: 20, b: 30, spread: 0.2 };
const DARK_FLAT = { r: 40, g: 10, b: 20, spread: 0.02 };
const LIGHT = { r: 245, g: 240, b: 230, spread: 0.02 };
const look = (style: Look['style'], mood: Look['mood'] = 'calm'): Look => ({ style, mood });
const white = { fill: '#FFFFFF' };

describe('hiệu ứng chữ theo phong cách', () => {
  it('bold: gradient sáng + bóng khối màu nhấn đậm + glow; chữ nhỏ không có hiệu ứng tiêu đề', () => {
    const t = textTreatment('headline', look('bold'), DARK_FLAT, white, ['#F26B1D'], 100);
    expect(t.fill.to).toBeDefined();
    expect(t.extrude?.offsetX).toBeCloseTo(3.5);
    expect(t.extrude?.offsetY).toBeCloseTo(5);
    expect(t.glow?.color).toContain('242, 107, 29');
    const sub = textTreatment('subheadline', look('bold'), DARK_FLAT, white, ['#F26B1D'], 40);
    expect(sub).toEqual({ fill: { from: '#FFFFFF' } });
  });

  it('vui tươi: viền sticker; sang trọng: gradient champagne + glow; tối giản: sạch', () => {
    expect(textTreatment('headline', look('playful'), DARK_FLAT, white, [], 100).stroke?.widthPx).toBe(6);
    const lux = textTreatment('headline', look('luxury'), DARK_FLAT, white, [], 100);
    expect(lux.fill).toEqual({ from: '#FFFDF6', to: '#E6D3A3' });
    expect(lux.glow).toBeDefined();
    const min = textTreatment('headline', look('minimalist'), DARK_FLAT, white, [], 100);
    expect(min).toEqual({ fill: { from: '#FFFFFF' } });
    // Mood năng động làm tối giản "to" lên (bóng khối), trừ sang trọng.
    expect(textTreatment('headline', look('minimalist', 'energetic'), DARK_FLAT, white, [], 100).extrude).toBeDefined();
    expect(textTreatment('headline', look('luxury', 'energetic'), DARK_FLAT, white, [], 100).extrude).toBeUndefined();
  });

  it('nút CTA: gradient cùng họ màu + bóng; sang trọng có viền, năng động có glow, tối giản phẳng', () => {
    const p = plateTreatment(look('bold'), '#F26B1D', 60);
    expect(p.from).toBe(mix('#F26B1D', '#FFFFFF', 0.14));
    expect(p.to).toBe(mix('#F26B1D', '#000000', 0.16));
    expect(p.glow).toBeDefined();
    expect(plateTreatment(look('luxury'), '#F26B1D', 60).border).toBeDefined();
    const flat = plateTreatment(look('minimalist'), '#F26B1D', 60);
    expect([flat.from, flat.to, flat.highlight]).toEqual(['#F26B1D', '#F26B1D', false]);
  });
});

describe('vầng làm rõ chữ + quầng logo', () => {
  it('nền rối → vầng tối sau chữ sáng; nền phẳng tương phản cao → không cần', () => {
    expect(scrimFor(look('bold'), [DARK_BUSY], ['#FFFFFF'])).toMatchObject({ color: '#000000' });
    expect(scrimFor(look('bold'), [DARK_FLAT], ['#FFFFFF'])).toBeUndefined();
    expect(scrimFor(look('bold'), [{ ...LIGHT, spread: 0.2 }], ['#141414'])?.color).toBe('#FFFFFF');
    const s = scrimFor(look('bold'), [{ r: 200, g: 60, b: 40, spread: 0.25 }], ['#FFFFFF'])!;
    expect(s.alpha).toBeGreaterThan(0.25);
    expect(s.alpha).toBeLessThanOrEqual(0.6);
  });

  it('logo tương phản thấp → quầng ngược màu; đủ tương phản → không', () => {
    expect(logoHalo(0.02, DARK_FLAT, 100)).toMatchObject({ color: expect.stringContaining('255, 255, 255') });
    expect(logoHalo(0.9, LIGHT, 100)).toMatchObject({ color: expect.stringContaining('0, 0, 0') });
    expect(logoHalo(0.9, DARK_FLAT, 100)).toBeUndefined();
  });
});

describe('layout: phóng cụm chữ tự động cho vừa khung', () => {
  const text = (layerId: string, role: 'headline' | 'subheadline', content: string, autoStyle: boolean) => ({
    layerId, role, content, renderSource: 'layer' as const, priority: role === 'headline' ? 1 : 2, autoStyle,
    minFontSizePx: TEXT_ROLE_DEFAULTS[role].minFontSizePx, style: { ...TEXT_ROLE_DEFAULTS[role].style, fontSizePx: role === 'headline' ? 60 : 26 },
  });
  const run = (autoStyle: boolean, ratio = { ...DEFAULT_RATIO, id: 'r', width: 1071, height: 357 }) => {
    const r = planLayout({
      ratios: [ratio], products: [],
      textLayers: [text('h', 'headline', 'Giảm đến 50%', autoStyle), text('s', 'subheadline', 'Chỉ 3 ngày cuối tuần', autoStyle)],
      overrides: {},
    }, { measurer: approxMeasurer });
    if (!r.ok) throw new Error(r.message);
    return r.plan.text.r!;
  };

  it('chữ tự động to lên (≤ 1.5×), giữ tỉ lệ tiêu đề/mô tả; chữ chỉnh tay giữ cỡ', () => {
    const manual = run(false);
    const auto = run(true);
    const g = auto.h!.fontSizePx / manual.h!.fontSizePx;
    expect(g).toBeGreaterThan(1.05);
    expect(g).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(auto.s!.fontSizePx / manual.s!.fontSizePx).toBeCloseTo(g, 5);
  });

  it('không đổi cách ngắt dòng khi phóng', () => {
    const manual = run(false, { ...DEFAULT_RATIO, id: 'r', width: 1075, height: 645 });
    const auto = run(true, { ...DEFAULT_RATIO, id: 'r', width: 1075, height: 645 });
    expect(auto.h!.lines.map((l) => l.split(' ').length)).toEqual(manual.h!.lines.map((l) => l.split(' ').length));
  });
});
