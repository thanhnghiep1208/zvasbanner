'use client';

import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/** Field có nhãn; `children` nhận id để gắn `htmlFor`. */
export function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <label htmlFor={id} className="p-0 text-xs font-medium text-foreground">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Textarea id={id} value={value} rows={4} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

/** Số: chỉ gọi onChange khi parse được và nằm trong [min, max]. */
export function NumberField({ label, value, onChange, min, max, step = 1, hint }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isNaN(v)) return;
            if ((min !== undefined && v < min) || (max !== undefined && v > max)) return;
            onChange(v);
          }}
        />
      )}
    </Field>
  );
}

export function SelectField<V extends string>({ label, value, options, onChange, hint }: {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (v: V) => void;
  hint?: string;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <Select value={value} items={items} onValueChange={(v) => { if (v) onChange(v as V); }}>
          <SelectTrigger id={id} className="h-9 w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

export function CheckboxField({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  const id = useId();
  return (
    <div className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Nhóm nút bật/tắt nhiều lựa chọn (giống chip marketing brief của form). */
export function ToggleGroupField<V extends string>({ label, values, options, onChange }: {
  label: string; values: V[]; options: readonly { value: V; label: string }[]; onChange: (v: V[]) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="p-0 text-xs font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
              )}
              onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
