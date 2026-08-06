import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { Plus } from '@phosphor-icons/react';
import type { InventoryItem } from '@/types/api';

interface Consumption { id: number; quantity: number; reason: string; created_at: string; inventory_item: InventoryItem; }

export function ConsumptionPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '', reason: '' });
  const [search, setSearch] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const filtered = useMemo(() =>
    consumptions.filter((c) =>
      c.inventory_item?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.reason?.toLowerCase().includes(search.toLowerCase())
    ), [consumptions, search]);

  const load = async () => {
    try {
      const [i, c] = await Promise.all([api.get('/inventory'), api.get('/consumptions')]);
      setItems(i.data);
      setConsumptions(c.data.data ?? c.data);
    } catch {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      await api.post('/consumptions', { inventory_item_id: Number(form.inventory_item_id), quantity: Number(form.quantity), reason: form.reason });
      showToast('Consumption recorded', 'success');
      setDialogOpen(false);
      setForm({ inventory_item_id: '', quantity: '', reason: '' });
      load();
    } catch {
      showToast('Failed to record consumption', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Manual Consumption"
        description="Record inventory used outside of sales"
        action={<Button onClick={() => setDialogOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="size-4 mr-1" /> Record</Button>}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search consumptions..." />
      {loading ? <TableSkeleton columns={4} /> : filtered.length === 0 ? (
        <EmptyState title={search ? 'No records match your search' : 'No consumption records found'} description={search ? 'Try a different search term' : 'Record your first manual consumption'} action={!search ? <Button onClick={() => setDialogOpen(true)} size="sm">Record</Button> : undefined} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{formatDate(c.created_at)}</TableCell>
                <TableCell className="font-medium">{c.inventory_item?.name}</TableCell>
                <TableCell>{c.quantity}</TableCell>
                <TableCell>{c.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Consumption</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Item" required>
              <Select value={form.inventory_item_id} onValueChange={(v) => setForm({ ...form, inventory_item_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select item">{items.find((i) => String(i.id) === form.inventory_item_id)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {items.map((i) => (<SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Quantity" required>
              <Input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </FormField>
            <FormField label="Reason" required>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Staff meal, Damaged, etc." required />
            </FormField>
            <DialogFooter><Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading}>Submit</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
