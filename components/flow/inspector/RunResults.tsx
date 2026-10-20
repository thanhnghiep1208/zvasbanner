'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportBanner } from '@/lib/export';
import type { NodeParamsMap } from '@/lib/flow/schema';
import type { RatioResult } from '@/lib/flow/executor';
import { useFlowStore } from '@/store/flow-store';

const BRANCH_LABELS: Record<NonNullable<RatioResult['branch']>, string> = { composed: 'Ghép layer', flat: 'Flat' };

/** Kết quả lần chạy gần nhất + tải về theo cấu hình node Xuất ảnh (dùng exportBanner của form). */
export function RunResults({ exportParams }: { exportParams: NodeParamsMap['export'] }) {
  const results = useFlowStore((s) => s.results);
  const [busy, setBusy] = useState<number | null>(null);

  if (!results.length) {
    return <p className="text-xs text-muted-foreground">Chưa có kết quả. Bấm &quot;Chạy tất cả&quot;.</p>;
  }

  const visible = exportParams.ratioIds === 'all'
    ? results
    : results.filter((r) => (exportParams.ratioIds as string[]).includes(r.ratioId));

  const download = async (r: RatioResult, index: number) => {
    setBusy(index);
    try {
      await exportBanner({
        imageUrl: r.image,
        canvasConfig: r.canvasConfig,
        format: exportParams.format,
        quality: exportParams.quality,
        scale: exportParams.scale,
        filenameStamp: r.branch ? `${r.ratioId}-${r.branch}` : r.ratioId,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Xuất ảnh thất bại.');
    } finally {
      setBusy(null);
    }
  };

  /** Tải lần lượt (mỗi file 1 lượt tải của trình duyệt); exportBanner đặt tên theo ratio nên không trùng. */
  const downloadAll = async () => {
    for (const [i, r] of visible.entries()) {
      await download(r, i);
      await new Promise((res) => setTimeout(res, 250)); // tránh trình duyệt gộp/chặn tải liên tiếp
    }
  };

  return (
    <section className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" aria-label="Kết quả">
      <div className="flex items-center justify-between gap-2">
        <h3 className="p-0 text-xs font-medium text-foreground">Kết quả ({visible.length})</h3>
        {visible.length > 1 && (
          <Button type="button" size="xs" variant="outline" disabled={busy !== null} onClick={() => void downloadAll()}>
            <Download aria-hidden />
            Tải tất cả
          </Button>
        )}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {visible.map((r, i) => (
          <li key={`${r.ratioId}-${r.branch ?? ''}`} className="flex flex-col gap-2 border-b pb-3 last:border-b-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL do API trả về */}
            <img src={r.image} alt={`Banner ${r.canvasConfig.name}`} className="block max-h-40 w-full rounded-lg border bg-muted object-contain" />
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{r.canvasConfig.name}{r.branch && ` · ${BRANCH_LABELS[r.branch]}`} <span className="text-xs text-muted-foreground">{r.canvasConfig.width}×{r.canvasConfig.height}</span></span>
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void download(r, i)}>
                <Download className="size-4" aria-hidden />
                {exportParams.format.toUpperCase()}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
