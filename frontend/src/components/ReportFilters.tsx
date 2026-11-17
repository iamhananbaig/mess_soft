import { useEffect, useState } from 'react';
import { format, startOfMonth, startOfWeek, subDays, subMonths, endOfMonth } from 'date-fns';
import api from '@/services/api';
import { DatePicker } from '@/components/DatePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Category } from '@/types/api';

export interface Option { value: string; label: string; }

/** Compact dropdown filter with an "All …" option (value ''). */
export function FilterSelect({ label, value, onChange, options, className }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select value={value || 'all'} onValueChange={(v) => onChange(!v || v === 'all' ? '' : v)}>
      <SelectTrigger className={cn('h-9 min-w-36', className)} aria-label={label}>
        <SelectValue>{current ? current.label : `All ${label.toLowerCase()}`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export interface DateRange { from: Date; to: Date; }

const PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: 'today', label: 'Today', range: () => ({ from: new Date(), to: new Date() }) },
  { key: 'yesterday', label: 'Yesterday', range: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { key: 'week', label: 'This week', range: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: new Date() }) },
  { key: 'month', label: 'This month', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { key: 'last-month', label: 'Last month', range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

const same = (a: Date, b: Date) => format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');

/** From/to pickers with one-tap presets (Today, This week, This month…). */
export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="space-y-2">
      <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar">
        {PRESETS.map((p) => {
          const r = p.range();
          const active = same(r.from, value.from) && same(r.to, value.to);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(r)}
              className={cn('shrink-0 h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                active ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted')}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker value={value.from} onChange={(d) => onChange({ from: d, to: d > value.to ? d : value.to })} />
        <span className="text-muted-foreground text-sm">to</span>
        <DatePicker value={value.to} onChange={(d) => onChange({ from: d < value.from ? d : value.from, to: d })} />
      </div>
    </div>
  );
}

/** Options for cashier / category / payment-method filters, loaded once. */
export function useFilterOptions() {
  const [cashiers, setCashiers] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [methods, setMethods] = useState<Option[]>([]);

  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/reports/cashiers')
      .then((r) => setCashiers(r.data.map((u) => ({ value: String(u.id), label: u.name })))).catch(() => {});
    api.get<Category[]>('/categories')
      .then((r) => setCategories(r.data.map((c) => ({ value: String(c.id), label: c.name })))).catch(() => {});
    api.get<{ available_payment_methods: { key: string; label: string }[] }>('/settings/pos')
      .then((r) => setMethods(r.data.available_payment_methods.map((m) => ({ value: m.key, label: m.label })))).catch(() => {});
  }, []);

  return { cashiers, categories, methods };
}
