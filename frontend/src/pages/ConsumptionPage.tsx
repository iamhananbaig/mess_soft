import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MagnifyingGlass } from '@phosphor-icons/react';

interface InventoryItem { id: number; name: string; unit: string; }
interface Consumption { id: number; quantity: number; reason: string; created_at: string; inventory_item: InventoryItem; }

export function ConsumptionPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '', reason: '' });
  const [search, setSearch] = useState('');

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
    try {
      await api.post('/consumptions', { inventory_item_id: Number(form.inventory_item_id), quantity: Number(form.quantity), reason: form.reason });
      showToast('Consumption recorded', 'success');
      setDialogOpen(false);
      setForm({ inventory_item_id: '', quantity: '', reason: '' });
      load();
    } catch {
      showToast('Failed to record consumption', 'error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Manual Consumption</h1>
        <Button onClick={() => setDialogOpen(true)}>Record Consumption</Button>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Search consumptions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
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
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {search ? 'No consumption records match your search' : 'No consumption records found'}
              </TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
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
            <div className="space-y-2">
              <Label>Item</Label>
              <Select value={form.inventory_item_id} onValueChange={(v) => setForm({ ...form, inventory_item_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select item">{items.find((i) => String(i.id) === form.inventory_item_id)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {items.map((i) => (<SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Staff meal, Damaged, etc." required />
            </div>
            <DialogFooter><Button type="submit">Submit</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
