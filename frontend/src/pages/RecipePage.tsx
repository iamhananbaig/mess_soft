import { useState, useEffect } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MenuItem { id: number; name: string; }
interface InventoryItem { id: number; name: string; unit: string; }
interface Recipe { id: number; quantity: number; inventory_item: InventoryItem; }

export function RecipePage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '1' });

  useEffect(() => {
    Promise.all([api.get('/menu'), api.get('/inventory')]).then(([m, i]) => {
      setMenuItems(m.data);
      setInventoryItems(i.data);
      setLoading(false);
    }).catch(() => {
      showToast('Failed to load data', 'error');
      setLoading(false);
    });
  }, []);

  const loadRecipes = async (menuItemId: string) => {
    setSelectedMenu(menuItemId);
    if (!menuItemId) { setRecipes([]); return; }
    try {
      const res = await api.get(`/menu/${menuItemId}/recipe`);
      setRecipes(res.data);
    } catch {
      showToast('Failed to load recipes', 'error');
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

  const handleDelete = async (recipeId: number) => {
    if (!confirm('Remove ingredient?')) return;
    try {
      await api.delete(`/recipes/${recipeId}`);
      showToast('Ingredient removed', 'success');
      loadRecipes(selectedMenu);
    } catch {
      showToast('Failed to remove ingredient', 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center p-6"><Spinner className="size-6" /></div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Recipe Management</h1>

      <div className="mb-6">
        <Label>Select Menu Item</Label>
        <Select value={selectedMenu} onValueChange={(v) => loadRecipes(v ?? '')}>
          <SelectTrigger className="w-64 mt-1"><SelectValue placeholder="Choose menu item" /></SelectTrigger>
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
                <TableRow><TableCell colSpan={4} className="text-center text-gray-400">No ingredients added yet</TableCell></TableRow>
              ) : recipes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.inventory_item.name}</TableCell>
                  <TableCell>{r.inventory_item.unit}</TableCell>
                  <TableCell>{r.quantity}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(r.id)}>Remove</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Ingredient</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Ingredient</Label>
              <Select value={form.inventory_item_id} onValueChange={(v) => setForm({ ...form, inventory_item_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((i) => (<SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity per menu item</Label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </div>
            <DialogFooter><Button type="submit">Add</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
