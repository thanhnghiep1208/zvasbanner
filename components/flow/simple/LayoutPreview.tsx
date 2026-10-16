'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { exportedRatios, type CompiledJob } from '@/lib/flow/compiled-job';
import { compileGraph } from '@/lib/flow/compiler';
import { planLayoutForJob } from '@/lib/flow/layout/engine';
import type { GuideRect } from '@/lib/flow/layout/types';
import { canvasMeasurer, composeRatio, ensureFonts } from '@/lib/flow-ui/compose-render';
import { useFlowStore } from '@/store/flow-store';

const DEBOUNCE_MS = 350;

type Preview = { ratioId: string; name: string; width: number; height: number; image: string };
type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ready'; items: Preview[] }
  | { kind: 'unavailable'; message: string };

/**
 * Nền tạm thay cho nền AI: xám nhạt + khung nét đứt ở vùng sản phẩm chưa có ảnh, để thấy chữ và sản phẩm sẽ nằm đâu.
 */
function placeholderBackground(width: number, height: number, missing: GuideRect[]): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#eef0f3');
  g.addColorStop(1, '#dfe3e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  const unit = Math.min(width, height);
  ctx.setLineDash([unit * 0.02, unit * 0.014]);
  ctx.lineWidth = Math.max(2, unit * 0.004);
  ctx.strokeStyle = '#9aa3ae';
  ctx.fillStyle = '#7b8490';
  ctx.font = `600 ${Math.round(unit * 0.035)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of missing) {
    const x = r.x * width;
    const y = r.y * height;
    const w = r.w * width;
    const h = r.h * height;
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(r.kind === 'logo' ? 'Logo' : 'Ảnh', x + w / 2, y + h / 2);
  }
  return c.toDataURL('image/png');
}

async function buildPreviews(job: CompiledJob, dataUrls: Record<string, string>): Promise<State> {
  await ensureFonts(job.textLayers.map((l) => l.style)).catch(() => {});
  const layout = planLayoutForJob(job, { measurer: canvasMeasurer });
  if (!layout.ok) return { kind: 'unavailable', message: layout.message };
  // Ảnh chưa tải: vẫn giữ chỗ trong layout, chỉ không vẽ (khung nét đứt trên nền tạm).
  const missingIds = new Set(job.products.filter((p) => !dataUrls[p.assetId]).map((p) => p.assetId));
  const drawable: CompiledJob = { ...job, products: job.products.filter((p) => !missingIds.has(p.assetId)) };
  const items: Preview[] = [];
  for (const r of exportedRatios(job)) {
    const missing = (layout.plan.guide[r.id] ?? []).filter((g) => g.kind !== 'text' && missingIds.has(g.elementId));
    const image = await composeRatio({
      job: drawable, plan: layout.plan, ratioId: r.id, background: placeholderBackground(r.width, r.height, missing), dataUrls,
    });
    items.push({ ratioId: r.id, name: r.name, width: r.width, height: r.height, image });
  }
  return { kind: 'ready', items };
}

/**
 * Xem trước bố cục ở Simple view (chế độ ghép layer): cùng layout engine + hàm vẽ Compose với lúc chạy thật, chỉ thay
 * nền AI bằng nền tạm → sửa chữ/ảnh/kích thước thấy ngay, không tốn lượt AI.
 */
export function LayoutPreview() {
  const graph = useFlowStore((s) => s.graph);
  const assetData = useFlowStore((s) => s.assetData);
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const compiled = compileGraph(graph);
      if (!compiled.ok) {
        setState({ kind: 'unavailable', message: 'Điền đủ các mục bắt buộc để xem trước bố cục.' });
        return;
      }
      if (compiled.job.renderMode !== 'composed') {
        setState({ kind: 'unavailable', message: 'Template này để AI vẽ cả banner nên chỉ xem được sau khi chạy.' });
        return;
      }
      setState((s) => (s.kind === 'ready' ? s : { kind: 'busy' }));
      buildPreviews(compiled.job, assetData)
        .then((next) => { if (!cancelled) setState(next); })
        .catch(() => { if (!cancelled) setState({ kind: 'unavailable', message: 'Không vẽ được bản xem trước.' }); });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [graph, assetData]);

  if (state.kind === 'unavailable') return <p className="text-xs text-muted-foreground">{state.message}</p>;
  if (state.kind !== 'ready') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        Đang vẽ bản xem trước…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Vị trí sản phẩm và chữ như khi xuất. Nền xám là chỗ AI sẽ tạo nền – không tốn lượt AI.
      </p>
      {state.items.map((p) => (
        <figure key={p.ratioId} className="m-0 flex flex-col gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL vẽ bằng Canvas */}
          <img src={p.image} alt={`Xem trước bố cục ${p.name}`} width={p.width} height={p.height}
            className="h-auto w-full max-w-xl rounded-lg border bg-muted shadow-xs" />
          <figcaption className="text-xs text-muted-foreground">{p.name} · {p.width}×{p.height}</figcaption>
        </figure>
      ))}
    </div>
  );
}
