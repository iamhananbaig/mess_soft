import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, showErrorToast } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { FilterSelect, DateRangeFilter, type DateRange } from '@/components/ReportFilters';
import { ExportMenu } from '@/components/ExportMenu';
import { Plus } from '@phosphor-icons/react';

interface Item { id: number; name: string; unit: string; current_stock?: string | number }
interface Consumption {
  id: number;
  quantity: string | number;
  reason: string;
  created_at: string;
  inventory_item: Item | null;
  user: { id: number; name: string } | null;
}

const REASONS = ['Staff meal', 'Damaged', 'Spilled', 'Tasting', 'Guest / free'];
const qty = (v: string | number) => Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 });

export function ConsumptionPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('consumptions:create');

  const [items, setItems] = useState<Item[]>([]);
  const [rows, setRows] = useState<Consumption[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(() => ({ from: new Date(Date.now() - 6 * 864e5), to: new Date() }));
  const [itemFilter, setItemFilter] = useState('');
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '', reason: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get<Item[]>('/inventory').then((r) => setItems(r.data)).catch(() => {}); }, []);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await api.get('/consumptions', { params: {
        page: p, per_page: 50,
        from: format(range.from, 'yyyy-MM-dd'), to: format(range.to, 'yyyy-MM-dd'),
        ...(itemFilter && { inventory_item_id: itemFilter }), ...(search.trim() && { search: search.trim() }),
      } });
      setRows((prev) => (p === 1 ? r.data.data : [...prev, ...r.data.data]));
      setPage(r.data.current_page);
      setLastPage(r.data.last_page);
      setTotal(r.data.total);
    } catch (err) {
      showErrorToast(err, 'Failed to load consumptions');
    } finally {
      setLoading(false);
    }
  }, [range, itemFilter, search]);

  useEffect(() => { const t = setTimeout(() => load(1), 300); return () => clearTimeout(t); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/consumptions', { inventory_item_id: Number(form.inventory_item_id), quantity: Number(form.quantity), reason: form.reason });
      showToast('Consumption recorded', 'success');
      setDialogOpen(false);
      setForm({ inventory_item_id: '', quantity: '', reason: '' });
      load(1);
      api.get<Item[]>('/inventory').then((r) => setItems(r.data)).catch(() => {});
    } catch (err) {
      showErrorToast(err, 'Failed to record consumption');
    } finally {
      setSaving(false);
    }
  };

  const selected = items.find((i) => String(i.id) === form.inventory_item_id);

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader
        title="Manual Consumption"
        description="Stock used outside of sales — staff meals, damage, tasting"
        action={canCreate && (
          <Button onClick={() => setDialogOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="size-4 sm:mr-1" /><span className="hidden sm:inline">Record</span>
          </Button>
        )}
      />

      <div className="space-y-3 rounded-xl border bg-card p-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Items" value={itemFilter} onChange={setItemFilter} options={items.map((i) => ({ value: String(i.id), label: i.name }))} />
          <div className="flex-1 min-w-48"><SearchInput value={search} onChange={setSearch} placeholder="Search item or reason…" /></div>
          <ExportMenu disabled={!rows.length} build={() => ({
            filename: `consumption_${format(range.from, 'yyyy-MM-dd')}_${format(range.to, 'yyyy-MM-dd')}`,
            heading: `Manual consumption — ${format(range.from, 'dd MMM yyyy')} – ${format(range.to, 'dd MMM yyyy')}`,
            tables: [{ title: 'Consumption', rows, columns: [
              { header: 'When', value: (c: Consumption) => formatDateTime(c.created_at) },
              { header: 'Item', value: (c: Consumption) => c.inventory_item?.name ?? '' },
              { header: 'Qty', value: (c: Consumption) => Number(c.quantity), type: 'number' },
              { header: 'Unit', value: (c: Consumption) => c.inventory_item?.unit ?? '' },
              { header: 'Reason', value: (c: Consumption) => c.reason, width: 30 },
              { header: 'By', value: (c: Consumption) => c.user?.name ?? '' },
            ] }],
          })} />
        </div>
      </div>

      {loading && rows.length === 0 ? <TableSkeleton columns={4} /> : rows.length === 0 ? (
        <EmptyState
          title="No consumption recorded"
          description="Nothing matches these filters"
          action={canCreate ? <Button onClick={() => setDialogOpen(true)} size="sm">Record</Button> : undefined}
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{total} record{total === 1 ? '' : 's'}</p>
          <ul className="divide-y rounded-xl border bg-card">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.inventory_item?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.reason} · {c.user?.name} · {formatDateTime(c.created_at)}</div>
                </div>
                <div className="text-right font-semibold tabular-nums whitespace-nowrap">{qty(c.quantity)} <span className="text-xs font-normal text-muted-foreground">{c.inventory_item?.unit}</span></div>
              </li>
            ))}
          </ul>
          {page < lastPage && <Button variant="outline" className="self-center" onClick={() => load(page + 1)} disabled={loading}>Load more</Button>}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record consumption</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <FormField label="Item" required>
              <FilterSelect label="Items" value={form.inventory_item_id} onChange={(v) => setForm({ ...form, inventory_item_id: v })}
                options={items.map((i) => ({ value: String(i.id), label: `${i.name} (${i.unit})` }))} className="w-full" />
              {selected?.current_stock !== undefined && <p className="text-xs text-muted-foreground">In stock: {qty(selected.current_stock)} {selected.unit}</p>}
            </FormField>
            <FormField label={`Quantity${selected ? ` (${selected.unit})` : ''}`} required>
              <Input inputMode="decimal" pattern="[0-9]*\.?[0-9]+" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </FormField>
            <FormField label="Reason" required>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why was it used?" required />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {REASONS.map((r) => (
                  <Button key={r} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setForm({ ...form, reason: r })}>{r}</Button>
                ))}
              </div>
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={saving || !form.inventory_item_id}>
                {saving && <Spinner className="size-4 mr-2" />} Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
