import { describe, expect, it } from 'vitest';
import { isPublicIp, normalizeSiteUrl } from '../brand-fetch';

describe('brand-fetch – chống SSRF', () => {
  it('isPublicIp: chặn loopback, mạng trong, link-local/metadata, CGNAT, multicast, IPv6 nội bộ', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2001:4860:4860::8888', '::ffff:8.8.8.8']) expect(isPublicIp(ip), ip).toBe(true);
  });

  it('normalizeSiteUrl: thêm https, chặn giao thức/cổng/tài khoản lạ và host nội bộ', () => {
    expect(normalizeSiteUrl('business.zbox.vn').href).toBe('https://business.zbox.vn/');
    for (const bad of ['ftp://x.vn', 'file:///etc/passwd', 'https://a:b@x.vn', 'http://x.vn:8080', 'http://localhost', 'http://127.0.0.1',
      'http://[::1]/', 'http://printer.local', 'javascript:alert(1)', 'http://']) {
      expect(() => normalizeSiteUrl(bad), bad).toThrow();
    }
  });
});
