import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MagnifyingGlass, Trash } from '@phosphor-icons/react';

interface MenuItem { id: number; name: string; }
interface InventoryItem { id: number; name: string; unit: string; }
interface Recipe { id: number; quantity: number; inventory_item: InventoryItem; }

export function RecipePage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '1' });
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = useMemo(() =>
    inventoryItems.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.unit.toLowerCase().includes(search.toLowerCase())
    ), [inventoryItems, search]);

  useEffect(() => {
    Promise.all([api.get('/menu'), api.get('/inventory')]).then(([m, i]) => {
      setMenuItems(m.data);
      setInventoryItems(i.data);
    }).catch(() => {
      showToast('Failed to load data', 'error');
    });
  }, []);

  const loadRecipes = async (menuItemId: string) => {
    setSelectedMenu(menuItemId);
    if (!menuItemId) { setRecipes([]); return; }
    setRecipesLoading(true);
    try {
      const res = await api.get(`/menu/${menuItemId}/recipe`);
      setRecipes(res.data);
    } catch {
      showToast('Failed to load recipes', 'error');
    } finally {
      setRecipesLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/menu/${selectedMenu}/recipe`, { inventory_item_id: Number(form.inventory_item_id), quantity: Number(form.quantity) });
      showToast('Ingredient added', 'success');
      setDialogOpen(false);
      loadRecipes(selectedMenu);
    } catch {
      showToast('Failed to add ingredient', 'error');
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await api.delete(`/recipes/${deleteId}`);
      showToast('Ingredient removed', 'success');
      setDeleteId(null);
      loadRecipes(selectedMenu);
    } catch {
      showToast('Failed to remove ingredient', 'error');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Recipe Management</h1>

      <div className="mb-6">
        <Label>Select Menu Item</Label>
        <Select value={selectedMenu} onValueChange={(v) => loadRecipes(v ?? '')}>
          <SelectTrigger className="w-64 mt-1"><SelectValue placeholder="Choose menu item">{menuItems.find((m) => String(m.id) === selectedMenu)?.name}</SelectValue></SelectTrigger>
          <SelectContent>
            {menuItems.map((m) => (<SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {selectedMenu && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <Button onClick={() => { setForm({ inventory_item_id: '', quantity: '1' }); setDialogOpen(true); }}>Add Ingredient</Button>
          </div>

          {recipesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipes.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No ingredients added yet</TableCell></TableRow>
                ) : recipes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.inventory_item.name}</TableCell>
                    <TableCell>{r.inventory_item.unit}</TableCell>
                    <TableCell>{r.quantity}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(r.id)} />}>
                            <Trash className="size-4" />
                        </TooltipTrigger><TooltipContent>Remove</TooltipContent></Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Ingredient</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Ingredient</Label>
              <Select value={form.inventory_item_id} onValueChange={(v) => setForm({ ...form, inventory_item_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select ingredient">{inventoryItems.find((i) => String(i.id) === form.inventory_item_id)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {filtered.map((i) => (<SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>))}
                </SelectContent>
              </Select>
              <div className="relative mt-1">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input placeholder="Search ingredients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantity per menu item</Label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </div>
            <DialogFooter><Button type="submit">Add</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Ingredient?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the ingredient from the recipe. You can re-add it later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
