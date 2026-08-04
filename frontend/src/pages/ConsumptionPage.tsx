import { useState, useEffect } from 'react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InventoryItem { id: number; name: string; unit: string; }
interface Consumption { id: number; quantity: number; reason: string; created_at: string; inventory_item: InventoryItem; }

export function ConsumptionPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '', reason: '' });

  const load = () => {
    Promise.all([api.get('/inventory'), api.get('/consumptions')]).then(([i, c]) => {
      setItems(i.data);
      setConsumptions(c.data.data ?? c.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/consumptions', { inventory_item_id: Number(form.inventory_item_id), quantity: Number(form.quantity), reason: form.reason });
    setDialogOpen(false);
    setForm({ inventory_item_id: '', quantity: '', reason: '' });
    load();
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Manual Consumption</h1>
        <Button onClick={() => setDialogOpen(true)}>Record Consumption</Button>
      </div>

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
          {consumptions.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
              <TableCell>{c.inventory_item?.name}</TableCell>
              <TableCell>{c.quantity}</TableCell>
              <TableCell>{c.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Consumption</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Item</Label>
              <Select value={form.inventory_item_id} onValueChange={(v) => setForm({ ...form, inventory_item_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
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
