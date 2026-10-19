'use client';

import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 1 bước của Simple view: header (số thứ tự hoặc dấu tích, tên, tóm tắt khi gập, "Cần điền") + nội dung gập được.
 * `open` do SimpleView giữ để mở sẵn đúng bước cần điền.
 */
export function StepSection({ index, title, summary, missing, optional, open, onToggle, children }: {
  index: number;
  title: string;
  summary: string;
  /** Số mục bắt buộc còn trống. */
  missing: number;
  optional?: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  const done = missing === 0 && !optional;
  const id = `step-${index}`;
  return (
    <section className="border-b last:border-b-0" aria-labelledby={`${id}-title`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => onToggle(!open)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
        >
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
              done ? 'bg-run-done/15 text-run-done' : missing ? 'bg-run-stale/15 text-run-stale' : 'bg-muted text-muted-foreground',
            )}
            aria-hidden
          >
            {done ? <Check className="size-3.5" /> : index}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
              {title}
              {optional && <span className="text-xs font-normal text-muted-foreground">Tuỳ chọn</span>}
              {missing > 0 && (
                <span className="rounded-full bg-run-stale/15 px-1.5 py-0.5 text-[11px] font-medium text-foreground">Cần điền</span>
              )}
            </span>
            {!open && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </button>
      </h3>
      <div id={`${id}-body`} hidden={!open} className="flex flex-col gap-4 px-4 pt-1 pb-5">
        {children}
      </div>
    </section>
  );
}
