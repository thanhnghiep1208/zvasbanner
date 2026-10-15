'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportBanner } from '@/lib/export';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { useFlowStore } from '@/store/flow-store';
import styles from '../flow-canvas.module.css';

/** Kết quả lần chạy gần nhất + tải về theo cấu hình node Xuất ảnh (dùng exportBanner của form). */
export function RunResults({ exportParams }: { exportParams: NodeParamsMap['export'] }) {
  const results = useFlowStore((s) => s.results);
  const [busy, setBusy] = useState<string | null>(null);

  if (!results.length) {
    return <p className={styles['flow-studio__hint']}>Chưa có kết quả. Bấm &quot;Chạy tất cả&quot;.</p>;
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
    <section className={styles['inspector__field']} aria-label="Kết quả">
      <h3 className={styles['inspector__label']}>Kết quả ({visible.length})</h3>
      <ul className={styles['inspector__list']}>
        {visible.map((r) => (
          <li key={r.ratioId} className={styles['inspector__result']}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL do API trả về */}
            <img src={r.image} alt={`Banner ${r.canvasConfig.name}`} className={styles['inspector__thumb']} />
            <div className={styles['inspector__list-item']}>
              <span>{r.canvasConfig.name} <span className={styles['flow-studio__hint']}>{r.canvasConfig.width}×{r.canvasConfig.height}</span></span>
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
