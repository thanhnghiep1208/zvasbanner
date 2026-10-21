import { describe, expect, it } from 'vitest';
import { contactInfoFromEnv, phoneTelHref, validateContactInfo } from '../contact-info';

describe('validateContactInfo', () => {
  it('trim và chấp nhận email + số hợp lệ', () => {
    expect(validateContactInfo({ email: ' a@example.com ', phone: ' 0901 234 567 ' })).toEqual({
      ok: true,
      value: { email: 'a@example.com', phone: '0901 234 567' },
    });
  });

  it('chuỗi rỗng hợp lệ (ẩn mục đó)', () => {
    expect(validateContactInfo({ email: '', phone: '' })).toEqual({ ok: true, value: { email: '', phone: '' } });
  });

  it.each([
    [{ email: 'khong-phai-email', phone: '' }],
    [{ email: '', phone: 'abc12345678' }],
    [{ email: '', phone: '12345' }],
    [{ email: 'a@example.com' }],
    [null],
  ])('từ chối %j', (input) => {
    expect(validateContactInfo(input).ok).toBe(false);
  });
});

describe('phoneTelHref', () => {
  it('bỏ ký tự phân cách, giữ +', () => {
    expect(phoneTelHref('0901 234-567')).toBe('tel:0901234567');
    expect(phoneTelHref('+84 (90) 123 4567')).toBe('tel:+84901234567');
  });
});

describe('contactInfoFromEnv', () => {
  it('đọc CONTACT_EMAIL / CONTACT_PHONE, thiếu thì rỗng', () => {
    expect(contactInfoFromEnv({ CONTACT_EMAIL: ' a@example.com ' })).toEqual({ email: 'a@example.com', phone: '' });
  });
});
