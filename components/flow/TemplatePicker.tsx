'use client';

import { useState } from 'react';
import { Check, ChevronDown, LayoutTemplate } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_TEMPLATES, type FlowTemplate } from '@/lib/flow/template';
import { estimateAiCalls } from '@/lib/flow/compiled-job';
import { compileGraph } from '@/lib/flow/compiler';
import type { NodeParamsMap } from '@/lib/flow/schema';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { setDocUrl } from './use-flow-docs';
import { trackFlow } from './flow-analytics';

function summary(t: FlowTemplate): string {
  const r = t.graph.nodes.find((n) => n.type === 'ratio');
  const sizes = r ? (r.params as NodeParamsMap['ratio']).ratios.length : 0;
  const job = compileGraph(t.graph);
  return job.ok ? `${sizes} kích thước · ${estimateAiCalls(job.job)} lượt AI` : `${sizes} kích thước`;
}
const SUMMARIES = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, summary(t)]));

/**
 * Chọn template (T5.4). Graph đã sửa so với lúc nạp template → hỏi lại trước khi thay, vì đổi template bỏ hết
 * thay đổi chưa lưu.
 */
export function TemplatePicker() {
  const templateId = useFlowStore((s) => s.templateId);
  // Có thay đổi chưa lưu: khác lúc nạp template và khác lần lưu gần nhất (T6.1).
  const edited = useFlowStore((s) => s.graph !== s.templateBaseline && s.graph !== s.savedGraph);
  const isRunning = useFlowStore((s) => s.isRunning);
  const loadTemplate = useFlowStore((s) => s.loadTemplate);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<FlowTemplate | null>(null);

  const current = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
  const apply = (t: FlowTemplate) => {
    loadTemplate(t);
    setDocUrl(null); // project mới, chưa lưu
    trackFlow('flow_template_used', { source: 'picker' });
    setPending(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPending(null); }}>
      <PopoverTrigger
        disabled={isRunning}
        aria-label={`Template: ${current?.name ?? 'Tự dựng'}. Đổi template`}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-w-0 gap-1.5 px-2 font-medium')}
      >
        <LayoutTemplate className="text-muted-foreground" aria-hidden />
        <span className="max-w-32 truncate xl:max-w-40">{current?.name ?? 'Tự dựng'}</span>
        <ChevronDown className="text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] gap-2 p-2">
        <PopoverTitle className="px-1.5 pt-1 text-xs font-medium text-muted-foreground">Bắt đầu từ template</PopoverTitle>

        {pending ? (
          <div className="flex flex-col gap-3 rounded-md bg-muted/60 p-3" role="alertdialog" aria-label="Xác nhận đổi template">
            <p className="text-sm">
              Mở <span className="font-medium">“{pending.name}”</span> sẽ bỏ thay đổi chưa lưu (ảnh, chữ, node đã sửa).
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>Huỷ</Button>
              <Button type="button" size="sm" onClick={() => apply(pending)}>Mở template</Button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {DEFAULT_TEMPLATES.map((t) => {
              const active = t.id === templateId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => (edited ? setPending(t) : apply(t))}
                    aria-current={active || undefined}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.description}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {SUMMARIES.get(t.id)}
                      </span>
                    </span>
                    {active && <Check className="mt-0.5 size-4 shrink-0" aria-label="Đang dùng" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
