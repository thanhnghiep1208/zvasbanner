'use client';

import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CampaignIntent } from '@/lib/types';

/** Mẫu brief: bám công thức Bối cảnh + Đạo cụ/chất liệu + Ánh sáng + Tông màu, không có chữ, không tả sản phẩm. */
export const BRIEF_EXAMPLES: { label: string; intent: CampaignIntent; prompt: string }[] = [
  {
    label: 'Ra mắt sản phẩm · Tối giản',
    intent: 'product-launch',
    prompt: 'Mặt bàn đá cẩm thạch trắng trong studio, vài cành lá khô bên cạnh, ánh sáng tự nhiên dịu từ cửa sổ bên trái, tông kem và be.',
  },
  {
    label: 'Flash sale · Nổi bật',
    intent: 'flash-sale',
    prompt: 'Nền gradient đỏ cam rực rỡ, khối hình học 3D và tia sáng toả ra từ giữa, confetti vàng bay, không khí sôi động.',
  },
  {
    label: 'Sự kiện · Tết',
    intent: 'event',
    prompt: 'Không gian Tết ấm cúng, cành mai vàng và đèn lồng đỏ mờ phía sau, bàn gỗ trầm, nắng chiều vàng ấm.',
  },
  {
    label: 'Thương hiệu · Doanh nghiệp',
    intent: 'brand-awareness',
    prompt: 'Văn phòng hiện đại mờ phía sau, bề mặt kính và kim loại, ánh sáng trắng sạch, tông xanh dương và trắng.',
  },
  {
    label: 'Mỹ phẩm · Sang trọng',
    intent: 'product-launch',
    prompt: 'Bục tròn đá đen bóng trên mặt nước gợn nhẹ, vài cánh hoa hồng rơi, ánh sáng viền vàng kim, nền tối sâu.',
  },
];

const FORMULA = ['Bối cảnh', 'Đạo cụ, chất liệu', 'Ánh sáng', 'Tông màu'];

/**
 * Gợi ý viết Brief trong Inspector (user không biết viết gì). Mở sẵn khi prompt còn trống.
 * "Dùng" thay prompt bằng mẫu (Hoàn tác được) và thêm mục tiêu chiến dịch của mẫu nếu chưa chọn mục tiêu nào.
 */
export function BriefGuide({ empty, onUse }: { empty: boolean; onUse: (ex: (typeof BRIEF_EXAMPLES)[number]) => void }) {
  return (
    <details open={empty} className="group rounded-lg border bg-muted/30 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
        <Lightbulb className="size-4 text-run-stale" aria-hidden />
        Gợi ý cách viết
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Xem</span>
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 pt-2.5 pb-3">
        <div>
          <p className="text-xs text-muted-foreground">Tả <b className="font-medium text-foreground">nền phía sau sản phẩm</b>, theo thứ tự:</p>
          <ol className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
            {FORMULA.map((f, i) => (
              <li key={f} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground" aria-hidden>+</span>}
                <span className="rounded-md border bg-background px-1.5 py-0.5">{f}</span>
              </li>
            ))}
          </ol>
        </div>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li><span className="font-medium text-destructive">Không</span> ghi chữ, giá, slogan – thêm bằng node Text.</li>
          <li><span className="font-medium text-destructive">Không</span> tả lại sản phẩm – ảnh sản phẩm được giữ nguyên.</li>
        </ul>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium">Ví dụ</p>
          {BRIEF_EXAMPLES.map((ex) => (
            <div key={ex.label} className="rounded-md border bg-background p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{ex.label}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => onUse(ex)} aria-label={`Dùng mẫu ${ex.label}`}>
                  Dùng
                </Button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ex.prompt}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
