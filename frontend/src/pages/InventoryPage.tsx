import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { formatPKR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { MagnifyingGlass, ArrowDown, ArrowsClockwise, Warning } from '@phosphor-icons/react';

interface InventoryItem { id: number; name: string; unit: string; current_stock: number; cost_per_unit: number; is_active: boolean; }

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'create' | 'stockin' | 'adjust' | 'expire'>('create');
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ name: '', unit: '', cost_per_unit: '', current_stock: '', quantity: '', reference: '', note: '' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    items.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.unit.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

  const load = async () => {
    try {
      const r = await api.get('/inventory');
      setItems(r.data);
    } catch {
      showToast('Failed to load inventory', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openDialog = (type: typeof dialogType, item?: InventoryItem) => {
    setDialogType(type);
    setSelected(item ?? null);
    setForm({ name: item?.name ?? '', unit: item?.unit ?? '', cost_per_unit: String(item?.cost_per_unit ?? ''), current_stock: String(item?.current_stock ?? ''), quantity: '', reference: '', note: '' });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (dialogType === 'create') { await api.post('/inventory', { ...form, cost_per_unit: Number(form.cost_per_unit), current_stock: Number(form.current_stock || 0) }); showToast('Inventory item created', 'success'); }
      else if (dialogType === 'stockin' && selected) { await api.post('/inventory/stock-in', { inventory_item_id: selected.id, quantity: Number(form.quantity), reference: form.reference, note: form.note }); showToast('Stock added', 'success'); }
      else if (dialogType === 'adjust' && selected) { await api.post(`/inventory/${selected.id}/adjust`, { quantity: Number(form.quantity), note: form.note }); showToast('Stock adjusted', 'success'); }
      else if (dialogType === 'expire' && selected) { await api.post(`/inventory/${selected.id}/expire`, { quantity: Number(form.quantity), note: form.note }); showToast('Stock expired', 'success'); }
      setDialogOpen(false);
      load();
    } catch {
      showToast('Failed to update inventory', 'error');
    }
  };

  const lowStockCount = items.filter((i) => i.current_stock < 10).length;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <Button onClick={() => openDialog('create')}>Add Item</Button>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="list">Stock List</TabsTrigger>
          <TabsTrigger value="low">
            Low Stock
            {lowStockCount > 0 && <Badge variant="destructive" className="ml-2 size-5 p-0 flex items-center justify-center text-xs">{lowStockCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {search ? 'No items match your search' : 'No inventory items found'}
                  </TableCell></TableRow>
                ) : filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell><Badge variant="outline">{item.unit}</Badge></TableCell>
                    <TableCell className={item.current_stock < 10 ? 'text-destructive font-bold' : ''}>{item.current_stock}</TableCell>
                    <TableCell>{formatPKR(item.cost_per_unit)}</TableCell>
                    <TableCell>{formatPKR(item.current_stock * item.cost_per_unit)}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <div className="flex gap-1">
                          <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openDialog('stockin', item)} />}>
                              <ArrowDown className="size-4" />
                          </TooltipTrigger><TooltipContent>Stock In</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openDialog('adjust', item)} />}>
                              <ArrowsClockwise className="size-4" />
                          </TooltipTrigger><TooltipContent>Adjust</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" className="text-orange-500" onClick={() => openDialog('expire', item)} />}>
                              <Warning className="size-4" />
                          </TooltipTrigger><TooltipContent>Expire</TooltipContent></Tooltip>
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="low">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Current Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.filter((i) => i.current_stock < 10).length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">All stock levels are healthy</TableCell></TableRow>
              ) : filtered.filter((i) => i.current_stock < 10).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-destructive font-bold">{item.current_stock}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogType === 'create' && 'Add Inventory Item'}
              {dialogType === 'stockin' && `Stock In — ${selected?.name}`}
              {dialogType === 'adjust' && `Adjust Stock — ${selected?.name}`}
              {dialogType === 'expire' && `Expire Stock — ${selected?.name}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {dialogType === 'create' && (
              <>
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, ml, g, kg" required /></div>
                <div className="space-y-2"><Label>Cost per Unit (PKR)</Label><Input type="number" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Initial Stock</Label><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></div>
              </>
            )}
            {dialogType !== 'create' && (
              <>
                <div className="space-y-2"><Label>Quantity</Label><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></div>
                {dialogType === 'stockin' && <div className="space-y-2"><Label>Reference (PO/UR)</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>}
                <div className="space-y-2"><Label>Note</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
              </>
            )}
            <DialogFooter>
              <Button type="submit">{dialogType === 'create' ? 'Create' : 'Submit'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
