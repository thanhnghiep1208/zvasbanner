'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportBanner } from '@/lib/export';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';

/** Kết quả lần chạy gần nhất + tải về theo cấu hình node Xuất ảnh (dùng exportBanner của form). */
export function RunResults({ exportParams }: { exportParams: NodeParamsMap['export'] }) {
  const results = useFlowStore((s) => s.results);
  const [busy, setBusy] = useState<string | null>(null);

  if (!results.length) {
    return <p className="text-xs text-muted-foreground">Chưa có kết quả. Bấm &quot;Chạy tất cả&quot;.</p>;
  }

  const visible = exportParams.ratioIds === 'all'
    ? results
    : results.filter((r) => (exportParams.ratioIds as string[]).includes(r.ratioId));

  const download = async (ratioId: string) => {
    const r = results.find((x) => x.ratioId === ratioId)!;
    setBusy(ratioId);
    try {
      await exportBanner({
        imageUrl: r.image,
        canvasConfig: r.canvasConfig,
        format: exportParams.format,
        quality: exportParams.quality,
        scale: exportParams.scale,
        filenameStamp: ratioId,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Xuất ảnh thất bại.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" aria-label="Kết quả">
      <h3 className="p-0 text-xs font-medium text-foreground">Kết quả ({visible.length})</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {visible.map((r) => (
          <li key={r.ratioId} className="flex flex-col gap-2 border-b pb-3 last:border-b-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL do API trả về */}
            <img src={r.image} alt={`Banner ${r.canvasConfig.name}`} className="block max-h-40 w-full rounded-lg border bg-muted object-contain" />
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{r.canvasConfig.name} <span className="text-xs text-muted-foreground">{r.canvasConfig.width}×{r.canvasConfig.height}</span></span>
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void download(r.ratioId)}>
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
