import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { Plus, ArrowDown, ArrowsClockwise, Warning } from '@phosphor-icons/react';

interface InventoryItem { id: number; name: string; unit: string; current_stock: number; is_active: boolean; }

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'create' | 'stockin' | 'adjust' | 'expire'>('create');
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ name: '', unit: '', current_stock: '', quantity: '', reference: '', note: '' });
  const [search, setSearch] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

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
    setForm({ name: item?.name ?? '', unit: item?.unit ?? '', current_stock: String(item?.current_stock ?? ''), quantity: '', reference: '', note: '' });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      if (dialogType === 'create') { await api.post('/inventory', { ...form, current_stock: Number(form.current_stock || 0) }); showToast('Inventory item created', 'success'); }
      else if (dialogType === 'stockin' && selected) { await api.post('/inventory/stock-in', { inventory_item_id: selected.id, quantity: Number(form.quantity), reference: form.reference, note: form.note }); showToast('Stock added', 'success'); }
      else if (dialogType === 'adjust' && selected) { await api.post(`/inventory/${selected.id}/adjust`, { quantity: Number(form.quantity), note: form.note }); showToast('Stock adjusted', 'success'); }
      else if (dialogType === 'expire' && selected) { await api.post(`/inventory/${selected.id}/expire`, { quantity: Number(form.quantity), note: form.note }); showToast('Stock expired', 'success'); }
      setDialogOpen(false);
      load();
    } catch {
      showToast('Failed to update inventory', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const lowStockCount = items.filter((i) => i.current_stock < 10).length;

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Inventory"
        description="Track stock levels, costs, and movements"
        action={<Button onClick={() => openDialog('create')} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="size-4 mr-1" /> Add Item</Button>}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search inventory..." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list">Stock List</TabsTrigger>
          <TabsTrigger value="low">
            Low Stock
            {lowStockCount > 0 && <Badge variant="destructive" className="ml-2 size-5 p-0 flex items-center justify-center text-xs">{lowStockCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {loading ? <TableSkeleton columns={6} /> : filtered.length === 0 ? (
            <EmptyState title={search ? 'No items match your search' : 'No inventory items found'} description={search ? 'Try a different search term' : 'Add your first inventory item'} action={!search ? <Button onClick={() => openDialog('create')} size="sm">Add Item</Button> : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell><Badge variant="outline">{item.unit}</Badge></TableCell>
                    <TableCell className={item.current_stock < 10 ? 'text-destructive font-semibold' : ''}>{item.current_stock}</TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="low">
          {filtered.filter((i) => i.current_stock < 10).length === 0 ? (
            <EmptyState title="All stock levels are healthy" description="No items are running low" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Current Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.filter((i) => i.current_stock < 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-destructive font-semibold">{item.current_stock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
                <FormField label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></FormField>
                <FormField label="Unit" required><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, ml, g, kg" required /></FormField>
                <FormField label="Initial Stock"><Input type="number" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: e.target.value })} /></FormField>
              </>
            )}
            {dialogType !== 'create' && (
              <>
                <FormField label="Quantity" required><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></FormField>
                {dialogType === 'stockin' && <FormField label="Reference (PO/UR)"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></FormField>}
                <FormField label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></FormField>
              </>
            )}
            <DialogFooter>
              <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading}>{dialogType === 'create' ? 'Create' : 'Submit'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
