import { describe, expect, it } from 'vitest';
import { autoTextColors, autoTypography, contrastRatio, type BackgroundSample } from '../text/auto-style';
import { defaultTextStyle, TEXT_ROLE_DEFAULTS } from '../text/text-style';
import { DEFAULT_STYLE, type NodeParamsMap, type TextRole } from '../schema';
import { compileGraph } from '../compiler';
import { getTemplate, instantiateTemplate } from '../template';

const layer = (role: TextRole, extra: Partial<NodeParamsMap['text-layer']> = {}): NodeParamsMap['text-layer'] => ({
  layerId: role, role, content: 'Nội dung', renderSource: 'layer', priority: 1,
  minFontSizePx: TEXT_ROLE_DEFAULTS[role].minFontSizePx, style: { ...defaultTextStyle(role), align: 'left' },
  autoStyle: true, ...extra,
});
const bg = (hex: string, spread = 0.02): BackgroundSample => ({
  r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), spread,
});
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

describe('autoTypography', () => {
  it('tắt autoStyle hoặc chữ AI vẽ → giữ nguyên', () => {
    const manual = layer('headline', { autoStyle: false });
    expect(autoTypography(manual, {})).toBe(manual);
    const ai = layer('headline', { renderSource: 'ai' });
    expect(autoTypography(ai, {})).toBe(ai);
  });

  it('phong cách nổi bật → tiêu đề to, IN HOA; tối giản → nhỏ hơn, thường; giữ căn lề của layer', () => {
    const bold = autoTypography(layer('headline'), { style: { ...DEFAULT_STYLE, style: 'bold', fontStyle: 'display' } });
    const mini = autoTypography(layer('headline'), { style: { ...DEFAULT_STYLE, style: 'minimalist', mood: 'calm' } });
    expect(bold.style.fontSizePx).toBeGreaterThan(mini.style.fontSizePx);
    expect(bold.style.textTransform).toBe('uppercase');
    expect(bold.style.fontFamily).toBe('montserrat');
    expect(mini.style.textTransform).toBe('none');
    expect(bold.style.align).toBe('left');
  });

  it('font thương hiệu thắng; chữ viết tay chỉ cho tiêu đề, chữ nhỏ dùng sans', () => {
    expect(autoTypography(layer('subheadline'), { brandKit: { colors: [], fontPreference: 'Noto Serif' } }).style.fontFamily).toBe('noto-serif');
    const ctx = { style: { ...DEFAULT_STYLE, fontStyle: 'handwritten' as const } };
    expect(autoTypography(layer('headline'), ctx).style.fontFamily).toBe('dancing-script');
    expect(autoTypography(layer('subheadline'), ctx).style.fontFamily).toBe('be-vietnam-pro');
  });

  it('font thương hiệu thiếu độ đậm → lấy độ đậm gần nhất; Paytone One chỉ cho tiêu đề', () => {
    const paytone = { brandKit: { colors: [], fontPreference: 'Paytone One' } };
    const h = autoTypography(layer('headline'), paytone).style;
    expect([h.fontFamily, h.fontWeight]).toEqual(['paytone-one', 400]);
    expect(autoTypography(layer('cta'), paytone).style.fontFamily).toBe('be-vietnam-pro');
    const philo = { brandKit: { colors: [], fontPreference: 'Philosopher' } };
    expect(autoTypography(layer('subheadline'), philo).style.fontWeight).toBe(400);
    expect(autoTypography(layer('cta'), { ...philo, style: { ...DEFAULT_STYLE, style: 'luxury' } }).style.fontWeight).toBe(700);
  });

  it('CTA có nút; chữ khác không có nút/viền/bóng; cỡ tối thiểu không vượt cỡ chữ', () => {
    const cta = autoTypography(layer('cta'), {});
    expect(cta.style.plate).toBeDefined();
    const sub = autoTypography(layer('subheadline', { style: { ...defaultTextStyle('subheadline'), plate: { color: '#000000', paddingX: 1, paddingY: 1, radiusPx: 1 }, shadow: { color: '#000000', blurPx: 1, offsetX: 0, offsetY: 0 } } }), {});
    expect(sub.style.plate).toBeUndefined();
    expect(sub.style.shadow).toBeUndefined();
    for (const r of ['headline', 'subheadline', 'cta', 'custom'] as const) {
      const out = autoTypography(layer(r), {});
      expect(out.minFontSizePx).toBeLessThanOrEqual(out.style.fontSizePx);
    }
  });

  it('template mặc định: chữ tự động, compile ra kiểu theo node Phong cách', () => {
    const t = instantiateTemplate(getTemplate('sale-multi-ratio')!);
    const res = compileGraph(t.graph);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const head = res.job.textLayers.find((l) => l.role === 'headline')!;
    expect(head.autoStyle).toBe(true);
    expect(head.style.textTransform).toBe('uppercase'); // sale: bold + energetic
  });
});

describe('autoTextColors', () => {
  it('nền tối → chữ trắng, nền sáng → chữ tối; đủ tương phản', () => {
    const dark = autoTextColors('subheadline', bg('#1A2238'), [], 40);
    const light = autoTextColors('subheadline', bg('#F2EEE6'), [], 40);
    expect(dark.fill).toBe('#FFFFFF');
    expect(contrastRatio(rgb(light.fill), rgb('#F2EEE6'))).toBeGreaterThanOrEqual(4.5);
  });

  it('tiêu đề dùng màu thương hiệu khi đủ tương phản, không thì trắng/đen', () => {
    expect(autoTextColors('headline', bg('#101010'), ['#FFD60A'], 90).fill).toBe('#FFD60A');
    // Vàng trên nền vàng nhạt không đủ tương phản → không dùng.
    expect(autoTextColors('headline', bg('#FFF3B0'), ['#FFD60A'], 90).fill).not.toBe('#FFD60A');
  });

  it('nền rối → thêm bóng ngược màu chữ; nền phẳng tương phản cao → không bóng', () => {
    const busy = autoTextColors('headline', bg('#20242C', 0.3), [], 90);
    expect(busy.shadow).toBeDefined();
    expect(autoTextColors('headline', bg('#0A0A0A', 0.01), [], 90).shadow).toBeUndefined();
  });

  it('CTA: nút màu thương hiệu nổi trên nền, chữ trên nút đủ tương phản', () => {
    const c = autoTextColors('cta', bg('#F5F5F5'), ['#C1121F'], 36);
    expect(c.plateColor).toBe('#C1121F');
    expect(contrastRatio(rgb(c.fill), rgb(c.plateColor!))).toBeGreaterThanOrEqual(4.5);
    const noBrand = autoTextColors('cta', bg('#0B0B0B'), [], 36);
    expect(noBrand.plateColor).toBe('#FFFFFF');
  });
});
