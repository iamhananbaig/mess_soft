import { useState, useEffect, useMemo, useCallback } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, showErrorToast } from '@/lib/toast';
import { formatPKR, formatDate, parseLocal } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { Plus, ArrowDown, ArrowsClockwise, Warning, PencilSimple, DotsThreeVertical } from '@phosphor-icons/react';

interface Item {
  id: number;
  name: string;
  unit: string;
  current_stock: string | number;
  reorder_level: string | number;
  avg_cost: string | number;
  expiry_date: string | null;
  is_active: boolean;
}

type Filter = 'all' | 'low' | 'expiring' | 'out';
type DialogType = 'create' | 'edit' | 'stockin' | 'adjust' | 'expire';

const EXPIRY_WINDOW_DAYS = 7;
const num = (v: string | number | null | undefined) => Number(v ?? 0);
const qty = (v: string | number) => num(v).toLocaleString('en-PK', { maximumFractionDigits: 2 });

function daysToExpiry(item: Item): number | null {
  if (!item.expiry_date) return null;
  return differenceInCalendarDays(parseLocal(item.expiry_date), new Date());
}
const isLow = (i: Item) => num(i.reorder_level) > 0 && num(i.current_stock) <= num(i.reorder_level);
const isOut = (i: Item) => num(i.current_stock) <= 0;
const isExpiring = (i: Item) => { const d = daysToExpiry(i); return d !== null && d <= EXPIRY_WINDOW_DAYS && num(i.current_stock) > 0; };

function ExpiryBadge({ item }: { item: Item }) {
  const d = daysToExpiry(item);
  if (d === null) return null;
  if (d < 0) return <Badge variant="destructive">Expired {formatDate(item.expiry_date!)}</Badge>;
  if (d <= EXPIRY_WINDOW_DAYS) return <Badge variant="outline" className="border-amber-500 text-amber-600">{d === 0 ? 'Expires today' : `Expires in ${d}d`}</Badge>;
  return <span className="text-xs text-muted-foreground">Exp. {formatDate(item.expiry_date!)}</span>;
}

const EMPTY_FORM = {
  name: '', unit: '', current_stock: '', reorder_level: '', unit_cost: '', expiry_date: '',
  quantity: '', costMode: 'total' as 'total' | 'unit', cost: '', reference: '', note: '',
};

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('inventory:create');
  const canEdit = hasPermission('inventory:edit');

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogType | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Item[]>('/inventory');
      setItems(r.data);
    } catch (err) {
      showErrorToast(err, 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    low: items.filter(isLow).length,
    expiring: items.filter(isExpiring).length,
    out: items.filter(isOut).length,
  }), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => filter === 'all' || (filter === 'low' && isLow(i)) || (filter === 'expiring' && isExpiring(i)) || (filter === 'out' && isOut(i)))
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.unit.toLowerCase().includes(q))
      .sort((a, b) => filter === 'expiring' ? (daysToExpiry(a) ?? 0) - (daysToExpiry(b) ?? 0) : 0);
  }, [items, filter, search]);

  const stockValue = useMemo(() => items.reduce((s, i) => s + Math.max(0, num(i.current_stock)) * num(i.avg_cost), 0), [items]);

  const open = (type: DialogType, item?: Item) => {
    setSelected(item ?? null);
    setForm({
      ...EMPTY_FORM,
      name: item?.name ?? '',
      unit: item?.unit ?? '',
      reorder_level: item ? String(num(item.reorder_level)) : '10',
      unit_cost: item ? String(num(item.avg_cost)) : '',
      expiry_date: item?.expiry_date?.slice(0, 10) ?? '',
    });
    setDialog(type);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (dialog === 'create') {
        await api.post('/inventory', {
          name: form.name, unit: form.unit,
          current_stock: Number(form.current_stock || 0),
          reorder_level: Number(form.reorder_level || 0),
          unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
          expiry_date: form.expiry_date || null,
        });
        showToast(`${form.name} added`, 'success');
      } else if (dialog === 'edit' && selected) {
        await api.put(`/inventory/${selected.id}`, {
          name: form.name, unit: form.unit,
          reorder_level: Number(form.reorder_level || 0),
          avg_cost: Number(form.unit_cost || 0),
          expiry_date: form.expiry_date || null,
        });
        showToast(`${form.name} updated`, 'success');
      } else if (dialog === 'stockin' && selected) {
        const cost = form.cost === '' ? {} : form.costMode === 'total' ? { total_cost: Number(form.cost) } : { unit_cost: Number(form.cost) };
        await api.post('/inventory/stock-in', {
          inventory_item_id: selected.id, quantity: Number(form.quantity), ...cost,
          expiry_date: form.expiry_date || null, reference: form.reference || null, note: form.note || null,
        });
        showToast(`Added ${form.quantity} ${selected.unit} ${selected.name}`, 'success');
      } else if (dialog === 'adjust' && selected) {
        await api.post(`/inventory/${selected.id}/adjust`, { quantity: Number(form.quantity), note: form.note || null });
        showToast('Stock adjusted', 'success');
      } else if (dialog === 'expire' && selected) {
        await api.post(`/inventory/${selected.id}/expire`, { quantity: Number(form.quantity), note: form.note || null });
        showToast('Expired stock written off', 'success');
      }
      setDialog(null);
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const actions = (item: Item) => (canCreate || canEdit) && (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${item.name}`} />}>
        <DotsThreeVertical className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canCreate && <DropdownMenuItem onClick={() => open('stockin', item)}><ArrowDown className="size-4" /> Stock in</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onClick={() => open('adjust', item)}><ArrowsClockwise className="size-4" /> Adjust count</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onClick={() => open('expire', item)}><Warning className="size-4" /> Write off expired</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onClick={() => open('edit', item)}><PencilSimple className="size-4" /> Edit item</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const stockCell = (i: Item) => (
    <span className={cn('tabular-nums', isOut(i) ? 'text-destructive font-semibold' : isLow(i) ? 'text-amber-600 font-semibold' : '')}>
      {qty(i.current_stock)} <span className="text-muted-foreground font-normal">{i.unit}</span>
    </span>
  );

  const chips: { key: Filter; label: string; count?: number; tone?: string }[] = [
    { key: 'all', label: 'All', count: items.length },
    { key: 'low', label: 'Low stock', count: counts.low, tone: 'text-amber-600' },
    { key: 'expiring', label: `Expiring ≤ ${EXPIRY_WINDOW_DAYS}d`, count: counts.expiring, tone: 'text-amber-600' },
    { key: 'out', label: 'Out of stock', count: counts.out, tone: 'text-destructive' },
  ];

  const unitLabel = selected?.unit ?? form.unit ?? '';

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader
        title="Inventory"
        description={`Stock levels, reorder alerts and expiry · stock value ${formatPKR(Math.round(stockValue))}`}
        action={canCreate && (
          <Button onClick={() => open('create')} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="size-4 sm:mr-1" /><span className="hidden sm:inline">Add item</span>
          </Button>
        )}
      />

      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search inventory…" />
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={cn('shrink-0 h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
                filter === c.key ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted')}
            >
              {c.label}
              {!!c.count && <span className={cn('ml-1.5 tabular-nums', filter === c.key ? '' : c.tone)}>{c.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? <TableSkeleton columns={6} /> : visible.length === 0 ? (
        <EmptyState
          title={search || filter !== 'all' ? 'Nothing matches' : 'No inventory items yet'}
          description={filter === 'low' ? 'All stock is above its reorder level' : filter === 'expiring' ? 'Nothing expires in the next week' : undefined}
          action={!search && filter === 'all' && canCreate ? <Button onClick={() => open('create')} size="sm">Add item</Button> : undefined}
        />
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="md:hidden space-y-2">
            {visible.map((i) => (
              <li key={i.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{i.name}</div>
                    <div className="mt-1 text-lg font-semibold">{stockCell(i)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {num(i.reorder_level) > 0 && <span>Reorder at {qty(i.reorder_level)}</span>}
                      {num(i.avg_cost) > 0 && <span>{formatPKR(Number(num(i.avg_cost).toFixed(2)))}/{i.unit}</span>}
                      <ExpiryBadge item={i} />
                    </div>
                  </div>
                  {actions(i)}
                </div>
                {canCreate && (
                  <Button variant="outline" size="sm" className="mt-3 w-full h-9" onClick={() => open('stockin', i)}>
                    <ArrowDown className="size-4 mr-1" /> Stock in
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="text-right">Reorder at</TableHead>
                  <TableHead className="text-right">Cost / unit</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-right">{stockCell(i)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{num(i.reorder_level) > 0 ? qty(i.reorder_level) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(i.avg_cost) > 0 ? `Rs.${num(i.avg_cost).toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(i.avg_cost) > 0 ? formatPKR(Math.round(Math.max(0, num(i.current_stock)) * num(i.avg_cost))) : '—'}</TableCell>
                    <TableCell><ExpiryBadge item={i} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canCreate && <Button variant="outline" size="sm" onClick={() => open('stockin', i)}>Stock in</Button>}
                        {actions(i)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'create' && 'Add inventory item'}
              {dialog === 'edit' && `Edit — ${selected?.name}`}
              {dialog === 'stockin' && `Stock in — ${selected?.name}`}
              {dialog === 'adjust' && `Adjust count — ${selected?.name}`}
              {dialog === 'expire' && `Write off expired — ${selected?.name}`}
            </DialogTitle>
            {selected && dialog !== 'edit' && (
              <DialogDescription>In stock: {qty(selected.current_stock)} {selected.unit}</DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto space-y-4 px-0.5">
            {(dialog === 'create' || dialog === 'edit') && (
              <>
                <FormField label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Unit" required><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, l" required /></FormField>
                  {dialog === 'create' && (
                    <FormField label="Opening stock"><Input inputMode="decimal" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} placeholder="0" /></FormField>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={`Reorder at (${form.unit || 'units'})`}>
                    <Input inputMode="decimal" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} placeholder="0 = no alert" />
                  </FormField>
                  <FormField label={`Cost per ${form.unit || 'unit'} (Rs.)`}>
                    <Input inputMode="decimal" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} placeholder="optional" />
                  </FormField>
                </div>
                <FormField label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></FormField>
                {dialog === 'edit' && <p className="text-xs text-muted-foreground">Cost per unit is normally kept up to date by stock-ins. Set it here once to start costing stock you already have.</p>}
              </>
            )}

            {dialog === 'stockin' && (
              <>
                <FormField label={`Quantity received (${unitLabel})`} required>
                  <Input inputMode="decimal" pattern="[0-9]*\.?[0-9]+" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required autoFocus />
                </FormField>
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {(['total', 'unit'] as const).map((m) => (
                      <Button key={m} type="button" size="sm" variant={form.costMode === m ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm({ ...form, costMode: m })}>
                        {m === 'total' ? 'Bill total' : `Price per ${unitLabel || 'unit'}`}
                      </Button>
                    ))}
                  </div>
                  <Input inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Rs. — optional, used for food cost and profit" />
                  {form.cost && Number(form.quantity) > 0 && form.costMode === 'total' && (
                    <p className="text-xs text-muted-foreground">= Rs.{(Number(form.cost) / Number(form.quantity)).toFixed(2)} per {unitLabel}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></FormField>
                  <FormField label="Bill / PO no."><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></FormField>
                </div>
                <FormField label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></FormField>
              </>
            )}

            {(dialog === 'adjust' || dialog === 'expire') && (
              <>
                <FormField label={dialog === 'adjust' ? `Change (${unitLabel}) — use minus to reduce, e.g. -2` : `Quantity expired (${unitLabel})`} required>
                  <Input
                    inputMode={dialog === 'adjust' ? 'text' : 'decimal'}
                    pattern={dialog === 'adjust' ? '-?[0-9]*\\.?[0-9]+' : '[0-9]*\\.?[0-9]+'}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                    autoFocus
                  />
                </FormField>
                <FormField label={dialog === 'adjust' ? 'Reason' : 'Note'}><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={dialog === 'adjust' ? 'e.g. recount, breakage' : ''} /></FormField>
              </>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={saving}>
                {saving && <Spinner className="size-4 mr-2" />}
                {dialog === 'create' ? 'Add item' : dialog === 'edit' ? 'Save' : dialog === 'stockin' ? 'Add stock' : dialog === 'expire' ? 'Write off' : 'Adjust'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
