import { describe, expect, it } from 'vitest';
import { defaultTextStyle, FLOW_FONTS, FONT_FOR_STYLE, TEXT_ROLE_DEFAULTS, validateTextStyle } from '../text/text-style';
import type { TextRole } from '../schema';
import { validateGraph } from '../validate';
import { decompileJob } from '../decompiler';
import { composedMinimal } from './fixtures';

const ROLES = Object.keys(TEXT_ROLE_DEFAULTS) as TextRole[];

describe('TextStyle mặc định', () => {
  for (const role of ROLES) {
    it(`${role} hợp lệ`, () => {
      const d = TEXT_ROLE_DEFAULTS[role];
      expect(validateTextStyle(d.style, d.minFontSizePx)).toEqual([]);
    });
  }
  it('defaultTextStyle trả bản sao, sửa không ảnh hưởng mặc định', () => {
    const s = defaultTextStyle('cta');
    s.plate!.color = '#000000';
    expect(TEXT_ROLE_DEFAULTS.cta.style.plate!.color).toBe('#111111');
  });
});

describe('validateTextStyle', () => {
  const ok = defaultTextStyle('headline');
  it('cỡ tối thiểu lớn hơn cỡ chữ', () => {
    expect(validateTextStyle(ok, ok.fontSizePx + 1)).toContain('Cỡ chữ tối thiểu lớn hơn cỡ chữ.');
  });
  it('màu sai định dạng', () => {
    expect(validateTextStyle({ ...ok, fill: { kind: 'solid', color: 'red' } }, 10))
      .toContain('Màu chữ phải là mã hex #RRGGBB hoặc #RRGGBBAA.');
  });
  it('độ đậm font không có', () => {
    expect(validateTextStyle({ ...ok, fontWeight: 900 as 700 }, 10)).toContain('Inter không có độ đậm 900.');
  });
  it('font không hỗ trợ', () => {
    expect(validateTextStyle({ ...ok, fontFamily: 'comic-sans' as 'inter' }, 10)).toContain('Font không hỗ trợ: comic-sans.');
  });
  it('giãn dòng, số dòng, viền, nền chữ', () => {
    const errors = validateTextStyle({
      ...ok, lineHeight: 5, maxLines: 1.5,
      stroke: { color: '#000000', widthPx: 0 },
      plate: { color: '#000000', paddingX: -1, paddingY: 0, radiusPx: 0 },
    }, 10);
    expect(errors).toEqual([
      'Giãn dòng phải trong khoảng 0.8–3.',
      'Số dòng tối đa phải là số nguyên ≥ 0.',
      'Độ dày viền phải lớn hơn 0.',
      'Padding và bo góc nền chữ không được âm.',
    ]);
  });
});

describe('validateGraph với text style', () => {
  it('style sai → lỗi text-style-invalid trên node', () => {
    const g = decompileJob(composedMinimal);
    const t = g.nodes.find((n) => n.type === 'text-layer')!;
    (t.params as { minFontSizePx: number }).minFontSizePx = 999;
    const issue = validateGraph(g).find((i) => i.code === 'text-style-invalid');
    expect(issue).toMatchObject({ severity: 'error', nodeId: t.id });
  });
});

describe('Bộ font (Q10B)', () => {
  it('5 font, mỗi font có đủ độ đậm 400–700 mà UI cho chọn', () => {
    expect(Object.keys(FLOW_FONTS)).toHaveLength(5);
    for (const f of Object.values(FLOW_FONTS)) expect([...f.weights]).toEqual([400, 500, 600, 700]);
  });
  it('mỗi kiểu chữ của form map sang 1 font có trong registry', () => {
    expect(FONT_FOR_STYLE).toEqual({
      sans: 'be-vietnam-pro', serif: 'noto-serif', display: 'montserrat', handwritten: 'dancing-script', modern: 'inter',
    });
    for (const id of Object.values(FONT_FOR_STYLE)) expect(FLOW_FONTS).toHaveProperty(id);
  });
  it('style dùng font mới vẫn hợp lệ', () => {
    expect(validateTextStyle({ ...defaultTextStyle('headline'), fontFamily: 'dancing-script' }, 20)).toEqual([]);
  });
});
