/**
 * Đo + xuống dòng chữ cho layout engine (SPEC 5.2).
 *
 * Engine chỉ cần độ rộng 1 dòng (`TextMeasurer.width`); xuống dòng, plate, maxLines tính ở đây.
 * - Mặc định: `approxMeasurer` ước lượng theo độ rộng trung bình ký tự (domain thuần, chạy được trong test).
 * - T4.4: text renderer Canvas 2D truyền measurer thật (ctx.measureText) để khớp WYSIWYG với preview/export.
 */
import type { TextStyle } from '../text/text-style';

export interface TextMeasurer {
  /** Độ rộng (px) của 1 dòng `text` (đã áp textTransform) ở `fontSizePx`. */
  width(text: string, style: TextStyle, fontSizePx: number): number;
}

/** Độ rộng trung bình ký tự / fontSize của Inter (đo thực nghiệm, tiếng Việt có dấu không đổi bề rộng). */
const AVG_CHAR_EM = 0.55;
const UPPER_CHAR_EM = 0.66;
const SPACE_EM = 0.28;

export const approxMeasurer: TextMeasurer = {
  width(text, style, fontSizePx) {
    const weightBoost = 1 + (style.fontWeight - 400) / 1000; // 700 → +30%… ước lượng
    let em = 0;
    for (const ch of text) {
      if (ch === ' ') em += SPACE_EM;
      else em += ch !== ch.toLowerCase() ? UPPER_CHAR_EM : AVG_CHAR_EM;
    }
    const spacing = Math.max(0, [...text].length - 1) * style.letterSpacingEm;
    return (em * weightBoost + spacing) * fontSizePx;
  },
};

export interface TextBox {
  lines: string[];
  /** Kích thước khối chữ (px), đã cộng padding plate nếu có. */
  width: number;
  height: number;
  /** Có từ nào dài hơn bề rộng cho phép, hoặc vượt maxLines. */
  overflow: boolean;
}

/**
 * Xuống dòng tham lam theo khoảng trắng trong `maxWidthPx` (đã gồm plate).
 * `scale` = cạnh ngắn ratio / 1080 – áp cho padding plate (font size truyền vào đã scale sẵn).
 */
export function layoutText(
  content: string,
  style: TextStyle,
  fontSizePx: number,
  maxWidthPx: number,
  scale: number,
  measurer: TextMeasurer,
): TextBox {
  const text = style.textTransform === 'uppercase' ? content.toUpperCase() : content;
  const padX = style.plate ? style.plate.paddingX * scale : 0;
  const padY = style.plate ? style.plate.paddingY * scale : 0;
  const avail = Math.max(0, maxWidthPx - padX * 2);

  const lines: string[] = [];
  let overflow = false;
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measurer.width(next, style, fontSizePx) <= avail) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      if (measurer.width(word, style, fontSizePx) > avail) overflow = true;
      line = word;
    }
    lines.push(line);
  }
  if (style.maxLines > 0 && lines.length > style.maxLines) overflow = true;

  const textWidth = Math.max(0, ...lines.map((l) => measurer.width(l, style, fontSizePx)));
  return {
    lines,
    width: textWidth + padX * 2,
    height: lines.length * fontSizePx * style.lineHeight + padY * 2,
    overflow,
  };
}
