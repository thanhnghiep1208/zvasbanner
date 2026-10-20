/**
 * Font cho text layer của Flow canvas (Q10B). Self-host qua next/font (CSP font-src 'self'), subset tiếng Việt.
 * Chỉ gắn lên khung /flow (FlowCanvas) – form cũ không phải tải thêm font. Inter đã có sẵn ở app/layout.tsx.
 * Tên biến CSS phải khớp FONT_CSS_VAR trong lib/flow-ui/compose-render.ts.
 */
import {
  Barlow, Be_Vietnam_Pro, Dancing_Script, Merriweather, Montserrat, Noto_Serif, Paytone_One, Philosopher, Playfair_Display, Prompt,
} from 'next/font/google';

// Tham số next/font phải là literal viết thẳng trong lời gọi (compiler đọc tĩnh) – không dùng biến/spread.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-be-vietnam-pro',
});
const notoSerif = Noto_Serif({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-noto-serif',
});
const montserrat = Montserrat({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-montserrat',
});
const dancingScript = Dancing_Script({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-dancing-script',
});
const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-playfair-display',
});
const barlow = Barlow({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-barlow',
});
// Merriweather: chỉ tải bản variable – weight tĩnh bị Google trả URL `font?kit=…` mà Turbopack không resolve được.
const merriweather = Merriweather({
  subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--font-flow-merriweather',
});
const prompt = Prompt({
  subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-flow-prompt',
});
const philosopher = Philosopher({
  subsets: ['latin', 'vietnamese'], weight: ['400', '700'], display: 'swap', variable: '--font-flow-philosopher',
});
const paytoneOne = Paytone_One({
  subsets: ['latin', 'vietnamese'], weight: '400', display: 'swap', variable: '--font-flow-paytone-one',
});

/** className gắn lên phần tử gốc của /flow để khai báo các biến font. */
export const FLOW_FONT_VARIABLES = [
  beVietnamPro, notoSerif, montserrat, dancingScript, playfairDisplay, barlow, merriweather, prompt, philosopher, paytoneOne,
].map((f) => f.variable).join(' ');
