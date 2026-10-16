import { cn } from '@/lib/utils';

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Tỉ lệ dễ đọc: rút gọn được gọn (16:9, 5:3, 3:1) thì dùng phân số, không thì "1.92:1". */
export function aspectLabel(width: number, height: number): string {
  if (!(width > 0 && height > 0)) return '';
  const g = gcd(Math.round(width), Math.round(height));
  const w = Math.round(width) / g;
  const h = Math.round(height) / g;
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return width >= height ? `${(width / height).toFixed(2)}:1` : `1:${(height / width).toFixed(2)}`;
}

/**
 * Hình chữ nhật đúng tỉ lệ banner, nằm giữa ô vuông `size`px – nhìn là biết ngang, dọc hay vuông.
 * Màu theo `currentColor` để dùng được trong danh sách, menu, nút.
 */
export function RatioShape({ width, height, size = 16, className }: {
  width: number;
  height: number;
  size?: number;
  className?: string;
}) {
  const k = size / Math.max(width, height, 1);
  const min = Math.max(3, size * 0.18);
  return (
    <span className={cn('grid shrink-0 place-items-center', className)} style={{ width: size, height: size }} aria-hidden>
      <span
        className="rounded-[2px] border border-current bg-current/10"
        style={{ width: Math.max(min, width * k), height: Math.max(min, height * k) }}
      />
    </span>
  );
}
