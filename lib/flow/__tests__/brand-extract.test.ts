import { describe, expect, it } from 'vitest';
import {
  brandTokens, findImageUrls, googleFontFamilies, parseHtml, pickFontFamily, rankColors, countCssColors, rankLogos, suggestBrand,
} from '../brand-extract';

// Mô phỏng SPA thật (business.zbox.vn, 2026-10): HTML gần trống, theme-color mặc định, logo chỉ trong JS.
const HTML = `<!doctype html><html><head>
<meta name="theme-color" content="#000000" />
<title>zBusiness - Kinh doanh hiệu quả trên Zalo</title>
<meta property="og:description" content="Mô tả &amp; giới thiệu" />
<meta property="og:image" content="https://cdn.example/thumb_banner_1.jpg" />
<link rel="shortcut icon" href="https://cdn.example/favicon_zb_1.png" type="image/png" />
<link rel="stylesheet" href="/css/index.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;700&family=Inter" />
<script type="module" crossorigin src="/js/index.js"></script>
<script src="https://www.googletagmanager.com/gtag/js"></script>
</head><body><div id="root"></div></body></html>`;

const CSS = `
.btn{background:#0068ff;color:#fff}.btn:hover{background:#006af5}.a{color:#0068FF}.b{border-color:#006af5}
.c{color:#3d3d3d;background:#f7f7f8}.d{color:#ff6905}.e{color:#ff6905}.f{box-shadow:0 0 4px rgba(0,104,255,.2)}
.g{color:#1a1a1a}.h{color:#0e83aa}
body{font-family:Inter,Roboto,Helvetica,Arial}.t{font-family:-apple-system,BlinkMacSystemFont,Segoe UI}
.u{font-family:"Inter",sans-serif}.v{font-family:Google Sans Flex,Inter,sans-serif}`;

const JS = `const a="https://cdn.example/zBusiness_17.svg",b="https://cdn.example/footer_zBusiness_18.svg",
c="https://cdn.example/card_momo_1.svg",d="https://cdn.example/icon_close_2.svg",e="/assets/brand-logo.png";`;

describe('brand-extract – gợi ý Brand kit từ website', () => {
  it('parseHtml: tiêu đề, mô tả, CSS/JS module tuyệt đối, ảnh theo nguồn', () => {
    const s = parseHtml(HTML, 'https://business.zbox.vn/');
    expect(s.title).toBe('zBusiness - Kinh doanh hiệu quả trên Zalo');
    expect(s.description).toBe('Mô tả & giới thiệu');
    expect(s.themeColor).toBe('#000000');
    expect(s.stylesheets[0]).toBe('https://business.zbox.vn/css/index.css');
    expect(s.scripts).toEqual(['https://business.zbox.vn/js/index.js']);
    expect(s.images).toEqual(expect.arrayContaining([
      { url: 'https://cdn.example/favicon_zb_1.png', source: 'icon' },
      { url: 'https://cdn.example/thumb_banner_1.jpg', source: 'og' },
    ]));
  });

  it('màu: bỏ xám/trắng/đen và màu mờ, gộp màu gần nhau, bỏ màu lẻ tẻ', () => {
    const colors = rankColors(countCssColors(CSS));
    expect(colors[0]).toBe('#0068FF'); // #0068ff + #006af5 gộp lại
    expect(colors).toContain('#FF6905');
    expect(colors).not.toContain('#006AF5');
    expect(colors).not.toContain('#0E83AA'); // 1 lần
    expect(colors.some((c) => ['#3D3D3D', '#F7F7F8', '#1A1A1A', '#FFFFFF'].includes(c))).toBe(false);
  });

  it('màu: theme-color #000 không tính; màu logo SVG được ưu tiên', () => {
    const b = suggestBrand({ pageUrl: 'https://x.vn/', html: HTML, css: ['.a{color:#ff6905}.b{color:#ff6905}.c{color:#0068ff}.d{color:#0068ff}.e{color:#0068ff}'], js: [],
      logoSvg: '<svg><path fill="#FF6905"/></svg>' });
    expect(b.colors[0]).toBe('#FF6905');
  });

  it('font: họ đầu tiên không phải font hệ thống; Google Fonts được cộng điểm; map sang font canvas', () => {
    expect(pickFontFamily(CSS)).toBe('Inter');
    expect(googleFontFamilies(['https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400&family=Inter'])).toEqual(['Be Vietnam Pro', 'Inter']);
    expect(pickFontFamily('.a{font-family:Roboto,Arial}')).toBeUndefined();
    const b = suggestBrand({ pageUrl: 'https://x.vn/', html: '<title>X</title>', css: ['.a{font-family:"Be Vietnam Pro",Roboto}'], js: [] });
    expect(b).toMatchObject({ fontFamily: 'Be Vietnam Pro', fontId: 'be-vietnam-pro' });
    expect(suggestBrand({ pageUrl: 'https://x.vn/', html: '', css: ['.a{font-family:Lato}'], js: [] }).fontId).toBeUndefined();
  });

  it('logo: tên thương hiệu/“logo” trong tên file thắng; bỏ ảnh og, icon UI, thẻ thanh toán', () => {
    const s = parseHtml(HTML, 'https://business.zbox.vn/');
    const tokens = brandTokens(s, 'https://business.zbox.vn/');
    expect(tokens).toEqual(expect.arrayContaining(['zbusiness', 'zbox']));
    const urls = findImageUrls(JS, 'https://business.zbox.vn/');
    expect(urls).toContain('https://business.zbox.vn/assets/brand-logo.png');
    const logos = rankLogos(s.images, urls, tokens, 5).map((l) => l.url);
    expect(logos[0]).toBe('https://cdn.example/zBusiness_17.svg');
    expect(logos).toContain('https://cdn.example/favicon_zb_1.png');
    expect(logos).not.toContain('https://cdn.example/card_momo_1.svg');
    expect(logos).not.toContain('https://cdn.example/icon_close_2.svg');
    expect(logos).not.toContain('https://cdn.example/thumb_banner_1.jpg');
  });

  it('tên thương hiệu: og:site_name, không thì phần đầu tiêu đề', () => {
    expect(suggestBrand({ pageUrl: 'https://business.zbox.vn/', html: HTML, css: [], js: [] }).name).toBe('zBusiness');
    expect(suggestBrand({ pageUrl: 'https://x.vn/', html: '<meta property="og:site_name" content="zCloud"><title>a - b</title>', css: [], js: [] }).name).toBe('zCloud');
  });
});
