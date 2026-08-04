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
import { Badge } from '@/components/ui/badge';

interface Category { id: number; name: string; }
interface MenuItem { id: number; name: string; price: number; category_id: number; is_active: boolean; description: string | null; category: Category; }

export function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ name: '', price: '', category_id: '', description: '' });

  const load = async () => {
    try {
      const [m, c] = await Promise.all([api.get('/menu'), api.get('/categories')]);
      setItems(m.data);
      setCategories(c.data);
    } catch {
      showToast('Failed to load menu items', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', price: '', category_id: '', description: '' }); setDialogOpen(true); };
  const openEdit = (item: MenuItem) => { setEditing(item); setForm({ name: item.name, price: String(item.price), category_id: String(item.category_id), description: item.description ?? '' }); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, price: Number(form.price), category_id: Number(form.category_id) };
    try {
      if (editing) { await api.put(`/menu/${editing.id}`, payload); showToast('Menu item updated', 'success'); }
      else { await api.post('/menu', payload); showToast('Menu item created', 'success'); }
      setDialogOpen(false);
      load();
    } catch {
      showToast('Failed to save menu item', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this item?')) return;
    try {
      await api.delete(`/menu/${id}`);
      showToast('Menu item deactivated', 'success');
      load();
    } catch {
      showToast('Failed to deactivate item', 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center p-6"><Spinner className="size-6" /></div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Menu Management</h1>
        <Button onClick={openCreate}>Add Item</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-gray-400">No menu items found</TableCell></TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.category?.name}</TableCell>
              <TableCell>Rs.{item.price}</TableCell>
              <TableCell>
                <Badge variant={item.is_active ? 'default' : 'secondary'}>
                  {item.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(item.id)}>Del</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Price (PKR)</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
