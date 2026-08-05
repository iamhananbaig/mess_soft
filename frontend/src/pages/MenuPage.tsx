import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { formatPKR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Plus, PencilSimple, Trash, X } from '@phosphor-icons/react';

interface Category { id: number; name: string; }
interface MenuItem { id: number; name: string; price: number; category_id: number; is_active: boolean; description: string | null; category: Category; }
interface InventoryItem { id: number; name: string; unit: string; }
interface Recipe { id: number; quantity: number; inventory_item: InventoryItem; }

export function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ name: '', price: '', category_id: '', description: '' });
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeForm, setRecipeForm] = useState({ inventory_item_id: '', quantity: '1' });
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSubmitLoading, setRecipeSubmitLoading] = useState(false);
  const [deleteRecipeId, setDeleteRecipeId] = useState<number | null>(null);

  const filtered = useMemo(() =>
    items.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.name.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

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

  const loadRecipes = useCallback(async (menuItemId: number) => {
    setRecipesLoading(true);
    try {
      const res = await api.get(`/menu/${menuItemId}/recipe`);
      setRecipes(res.data);
    } catch {
      showToast('Failed to load recipes', 'error');
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  const loadInventory = useCallback(async () => {
    try {
      const res = await api.get('/inventory');
      setInventoryItems(res.data);
    } catch {
      showToast('Failed to load inventory', 'error');
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', price: '', category_id: '', description: '' });
    setRecipes([]);
    setRecipeForm({ inventory_item_id: '', quantity: '1' });
    setRecipeSearch('');
    loadInventory();
    setDrawerOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setForm({ name: item.name, price: String(item.price), category_id: String(item.category_id), description: item.description ?? '' });
    setRecipeForm({ inventory_item_id: '', quantity: '1' });
    setRecipeSearch('');
    loadInventory();
    loadRecipes(item.id);
    setDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    const payload = { ...form, price: Number(form.price), category_id: Number(form.category_id) };
    try {
      if (editing) {
        await api.put(`/menu/${editing.id}`, payload);
        showToast('Menu item updated', 'success');
        load();
      } else {
        const res = await api.post('/menu', payload);
        showToast('Menu item created', 'success');
        setEditing(res.data);
        loadRecipes(res.data.id);
        load();
      }
    } catch {
      showToast('Failed to save menu item', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    setSubmitLoading(true);
    try {
      await api.delete(`/menu/${deleteId}`);
      showToast('Menu item deactivated', 'success');
      setDeleteId(null);
      load();
    } catch {
      showToast('Failed to deactivate item', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !recipeForm.inventory_item_id) return;
    setRecipeSubmitLoading(true);
    try {
      await api.post(`/menu/${editing.id}/recipe`, {
        inventory_item_id: Number(recipeForm.inventory_item_id),
        quantity: Number(recipeForm.quantity),
      });
      showToast('Ingredient added', 'success');
      setRecipeForm({ inventory_item_id: '', quantity: '1' });
      setRecipeSearch('');
      loadRecipes(editing.id);
    } catch {
      showToast('Failed to add ingredient', 'error');
    } finally {
      setRecipeSubmitLoading(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (deleteRecipeId === null || !editing) return;
    setRecipeSubmitLoading(true);
    try {
      await api.delete(`/recipes/${deleteRecipeId}`);
      showToast('Ingredient removed', 'success');
      setDeleteRecipeId(null);
      loadRecipes(editing.id);
    } catch {
      showToast('Failed to remove ingredient', 'error');
    } finally {
      setRecipeSubmitLoading(false);
    }
  };

  const inventorySearchResults = useMemo(() => {
    return inventoryItems
      .filter((i) => !recipes.some((r) => r.inventory_item.id === i.id))
      .filter((i) => i.name.toLowerCase().includes(recipeSearch.toLowerCase()));
  }, [inventoryItems, recipes, recipeSearch]);

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Menu Management"
        description="Manage menu items, categories, pricing, and recipes"
        action={<Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="size-4 mr-1" /> Add Item</Button>}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search menu items..." />
      {loading ? (
        <TableSkeleton columns={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title={search ? 'No menu items match your search' : 'No menu items found'} description={search ? 'Try a different search term' : 'Create your first menu item to get started'} action={!search ? <Button onClick={openCreate} size="sm">Add Item</Button> : undefined} />
      ) : (
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
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category?.name}</TableCell>
                <TableCell>{formatPKR(item.price)}</TableCell>
                <TableCell><StatusBadge status={item.is_active ? 'Active' : 'Inactive'} /></TableCell>
                <TableCell>
                    <div className="flex gap-1">
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openEdit(item)} />}>
                        <PencilSimple className="size-4" />
                      </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(item.id)} />}>
                        <Trash className="size-4" />
                      </TooltipTrigger><TooltipContent>Deactivate</TooltipContent></Tooltip>
                    </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} swipeDirection="right">
        <DrawerContent className="w-full sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{editing ? `Edit — ${editing.name}` : 'Add Menu Item'}</DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Name" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </FormField>
              <FormField label="Category" required>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Select category">{categories.find((c) => String(c.id) === form.category_id)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Price (PKR)" required>
                <Input type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </FormField>
              <FormField label="Description">
                <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-input/20 px-3 py-2 text-xs/relaxed placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none resize-none dark:bg-input/30" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </FormField>
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading}>
                {submitLoading && <Spinner className="size-4 mr-2" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </form>

            {editing && (
              <>
                <Separator className="my-6" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Recipe Ingredients</h3>
                  </div>

                  {recipesLoading ? (
                    <div className="flex items-center justify-center py-6"><Spinner className="size-5" /></div>
                  ) : recipes.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipes.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.inventory_item.name}</TableCell>
                            <TableCell>{r.inventory_item.unit}</TableCell>
                            <TableCell className="text-right">{r.quantity}</TableCell>
                            <TableCell>
                              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" className="text-destructive size-7 p-0" onClick={() => setDeleteRecipeId(r.id)} />}>
                                <Trash className="size-3.5" />
                              </TooltipTrigger><TooltipContent>Remove</TooltipContent></Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No ingredients added yet</p>
                  )}

                  <form onSubmit={handleAddRecipe} className="space-y-2">
                    <Input placeholder="Search ingredients..." value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} />
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Select value={recipeForm.inventory_item_id} onValueChange={(v) => setRecipeForm({ ...recipeForm, inventory_item_id: v ?? '' })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select ingredient">{recipeForm.inventory_item_id ? inventoryItems.find((i) => String(i.id) === recipeForm.inventory_item_id)?.name : ''}</SelectValue></SelectTrigger>
                          <SelectContent>
                            {inventorySearchResults.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No ingredients available</div>
                            ) : inventorySearchResults.map((i) => (<SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20">
                        <Input type="text" inputMode="numeric" pattern="[0-9]*" value={recipeForm.quantity} onChange={(e) => setRecipeForm({ ...recipeForm, quantity: e.target.value })} required />
                      </div>
                      <Button type="submit" size="sm" variant="outline" disabled={recipeSubmitLoading || !recipeForm.inventory_item_id}>
                        {recipeSubmitLoading ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose render={<Button variant="outline" />}>
              <X className="size-4 mr-1" /> Close
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Menu Item?</AlertDialogTitle>
            <AlertDialogDescription>This item will be marked inactive and hidden from the POS. You can reactivate it later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={submitLoading}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteRecipeId !== null} onOpenChange={(open) => { if (!open) setDeleteRecipeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Ingredient?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the ingredient from the recipe. You can re-add it later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecipe} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={recipeSubmitLoading}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
