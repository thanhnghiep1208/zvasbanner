import { describe, expect, it } from 'vitest';
import { defaultTextStyle, FLOW_FONTS, TEXT_ROLE_DEFAULTS } from '../text/text-style';

describe('TextStyle mặc định', () => {
  it('defaultTextStyle trả bản sao, sửa không ảnh hưởng mặc định', () => {
    const s = defaultTextStyle('cta');
    s.plate!.color = '#000000';
    expect(TEXT_ROLE_DEFAULTS.cta.style.plate!.color).toBe('#111111');
  });
});

describe('Bộ font (danh sách font Brand kit)', () => {
  it('11 font, nhãn không trùng', () => {
    const labels = Object.values(FLOW_FONTS).map((f) => f.label);
    expect(labels).toHaveLength(11);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
