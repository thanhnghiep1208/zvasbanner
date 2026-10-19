/**
 * Tải website để lấy gợi ý Brand kit (lib/flow/brand-extract.ts). Chạy server, Node runtime.
 *
 * URL do user nhập → chống SSRF:
 * - Chỉ http/https, cổng 80/443, không có user:pass trong URL.
 * - Kiểm IP ngay lúc kết nối (`lookup` riêng cho http/https.request) nên DNS rebinding không lách được;
 *   chặn loopback, mạng nội bộ, link-local (gồm metadata 169.254.169.254), CGNAT, multicast, IPv6 ULA…
 * - Tự theo redirect (tối đa 3), kiểm lại từng bước.
 * Giới hạn: timeout mỗi request, dung lượng đọc tối đa theo loại file, số file CSS/JS tải thêm.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import type { LookupFunction } from 'node:net';
import { parseHtml, suggestBrand, type BrandSuggestion } from '@/lib/flow/brand-extract';

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const LIMITS = { html: 1_500_000, css: 1_500_000, js: 4_000_000, image: 1_500_000 } as const;
const MAX_CSS = 6;
const MAX_JS = 2;
const MAX_LOGOS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; zVasBannerAI/1.0; +brand-kit)';

export class BrandFetchError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/* ── Chặn địa chỉ nội bộ ─────────────────────────────────────── */

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return !V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]!);
    if (s === '::' || s === '::1') return false;
    // fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast), 64:ff9b::/96 (NAT64 – có thể trỏ vào mạng trong)
    return !/^(f[cd]|fe[89ab]|ff|64:ff9b:)/.test(s);
  }
  return false;
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => !isPublicIp(a.address));
    if (!list.length || bad) {
      return callback(Object.assign(new Error('blocked-address'), { code: 'EBLOCKED' }), '', 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

/** Kiểm URL user nhập; thêm https:// nếu thiếu. */
export function normalizeSiteUrl(raw: string): URL {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new BrandFetchError('Link website không hợp lệ.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BrandFetchError('Chỉ hỗ trợ link http(s).');
  if (u.username || u.password) throw new BrandFetchError('Link không được chứa tài khoản/mật khẩu.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new BrandFetchError('Chỉ hỗ trợ cổng web mặc định (80/443).');
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && !isPublicIp(u.hostname.replace(/^\[|\]$/g, ''))) {
    throw new BrandFetchError('Không lấy được từ địa chỉ nội bộ.');
  }
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(u.hostname)) throw new BrandFetchError('Không lấy được từ địa chỉ nội bộ.');
  return u;
}

/* ── GET an toàn ─────────────────────────────────────────────── */

interface Fetched {
  url: string;
  contentType: string;
  body: Buffer;
}

function getOnce(url: URL, maxBytes: number): Promise<Fetched | { redirect: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      headers: { 'user-agent': USER_AGENT, accept: '*/*', 'accept-encoding': 'gzip, deflate, br' },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url).href });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new BrandFetchError(`Website trả lỗi ${status}.`, 502));
      }
      const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip())
        : enc === 'deflate' ? res.pipe(zlib.createInflate())
        : enc === 'br' ? res.pipe(zlib.createBrotliDecompress())
        : res;
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          reject(new BrandFetchError('File quá lớn.', 413));
          return;
        }
        chunks.push(c);
      });
      stream.on('end', () => resolve({ url: url.href, contentType: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks) }));
      stream.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new BrandFetchError('Website phản hồi quá chậm.', 504)));
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (e instanceof BrandFetchError) return reject(e);
      if (e.code === 'EBLOCKED') return reject(new BrandFetchError('Không lấy được từ địa chỉ nội bộ.'));
      if (e.code === 'ENOTFOUND') return reject(new BrandFetchError('Không tìm thấy website.', 502));
      reject(new BrandFetchError('Không tải được website.', 502));
    });
    req.end();
  });
}

export async function safeGet(raw: string, maxBytes: number): Promise<Fetched> {
  let url = normalizeSiteUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await getOnce(url, maxBytes);
    if (!('redirect' in r)) return r;
    url = normalizeSiteUrl(r.redirect);
  }
  throw new BrandFetchError('Website chuyển hướng quá nhiều lần.', 502);
}

const text = (f: Fetched) => f.body.toString('utf8');
const settle = async <T>(ps: Promise<T>[]) => (await Promise.allSettled(ps)).flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));

/* ── Gộp ─────────────────────────────────────────────────────── */

export interface BrandLogo {
  url: string;
  /** data URL để client tạo node Asset (ảnh không lưu trên server). */
  dataUrl: string;
  fileName: string;
}

export interface BrandFromUrlResult extends Omit<BrandSuggestion, 'logos'> {
  pageUrl: string;
  logos: BrandLogo[];
}

const IMAGE_TYPES = /^image\/(png|jpeg|webp|svg\+xml)\b/i;

export async function brandFromUrl(raw: string): Promise<BrandFromUrlResult> {
  const page = await safeGet(raw, LIMITS.html);
  if (!/text\/html|application\/xhtml/i.test(page.contentType)) throw new BrandFetchError('Link không phải trang web (HTML).');
  const html = text(page);
  const signals = parseHtml(html, page.url);

  const [css, js] = await Promise.all([
    settle(signals.stylesheets.slice(0, MAX_CSS).map((u) => safeGet(u, LIMITS.css).then(text))),
    settle(signals.scripts.slice(0, MAX_JS).map((u) => safeGet(u, LIMITS.js).then(text))),
  ]);
  const first = suggestBrand({ pageUrl: page.url, html, css, js }, signals);

  const logos = await settle(first.logos.slice(0, MAX_LOGOS).map(async (l) => {
    const f = await safeGet(l.url, LIMITS.image);
    const type = f.contentType.split(';')[0]!.trim().toLowerCase();
    if (!IMAGE_TYPES.test(type)) throw new Error('not-image');
    const fileName = decodeURIComponent(new URL(f.url).pathname.split('/').pop() || 'logo');
    return { url: l.url, dataUrl: `data:${type};base64,${f.body.toString('base64')}`, fileName, svg: type === 'image/svg+xml' ? text(f) : undefined };
  }));

  // Màu tô trong logo SVG là tín hiệu màu thương hiệu mạnh nhất → chấm lại màu.
  const logoSvg = logos.find((l) => l.svg)?.svg;
  const final = logoSvg ? suggestBrand({ pageUrl: page.url, html, css, js, logoSvg }, signals) : first;
  return {
    ...final,
    pageUrl: page.url,
    logos: logos.map(({ url, dataUrl, fileName }) => ({ url, dataUrl, fileName })),
  };
}
