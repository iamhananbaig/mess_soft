import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/services/api';
import { showToast, showErrorToast } from '@/lib/toast';
import { formatPKR } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { Plus, PencilSimple, Trash, X, ListPlus, Eye } from '@phosphor-icons/react';
import type { Category, InventoryItem } from '@/types/api';

interface MenuItem { id: number; name: string; price: number; category_id: number; is_active: boolean; description: string | null; category: Category; food_cost?: number; margin?: number | null; }
interface Recipe { id: number; quantity: number; inventory_item: InventoryItem; }

/** Margin %, coloured: under 30% is worth a look at the price or recipe. */
function MarginText({ margin }: { margin?: number | null }) {
  if (margin === null || margin === undefined) return <span className="text-muted-foreground">—</span>;
  const tone = margin < 0 ? 'text-destructive' : margin < 30 ? 'text-amber-600' : 'text-green-600';
  return <span className={`font-medium tabular-nums ${tone}`}>{margin}%</span>;
}

export function MenuPage() {
  const { hasPermission } = useAuth();
  // Only offer what the server will allow (routes/api.php); viewers get a read-only drawer.
  const canCreate = hasPermission('menu:create');
  const canEdit = hasPermission('menu:edit');
  const canDelete = hasPermission('menu:delete');
  const canRecipes = hasPermission('recipes:manage');
  const canCreateCategory = hasPermission('categories:create');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ name: '', price: '', category_id: '', description: '' });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeForm, setRecipeForm] = useState({ inventory_item_id: '', quantity: '1' });
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSubmitLoading, setRecipeSubmitLoading] = useState(false);
  const [deleteRecipeId, setDeleteRecipeId] = useState<number | null>(null);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [categorySubmitLoading, setCategorySubmitLoading] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);

  const filtered = useMemo(() =>
    items
      .filter((i) => categoryFilter === 'all' || i.category_id === categoryFilter)
      .filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category?.name.toLowerCase().includes(search.toLowerCase())
      ), [items, search, categoryFilter]);

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
    // Recipes (and the ingredient list for them) need recipes:manage — don't call what would be refused.
    if (canRecipes) {
      loadInventory();
      loadRecipes(item.id);
    }
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
    } catch (err) {
      showErrorToast(err, 'Failed to save menu item');
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
    } catch (err) {
      showErrorToast(err, 'Failed to deactivate item');
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
    } catch (err) {
      showErrorToast(err, 'Failed to add ingredient');
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
    } catch (err) {
      showErrorToast(err, 'Failed to remove ingredient');
    } finally {
      setRecipeSubmitLoading(false);
    }
  };

  const openCategoryDialog = (category?: Category) => {
    setEditingCategory(category ?? null);
    setCategoryForm({ name: category?.name ?? '' });
    setCategoryDialogOpen(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategorySubmitLoading(true);
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, { name: categoryForm.name });
        showToast('Category updated', 'success');
      } else {
        await api.post('/categories', { name: categoryForm.name });
        showToast('Category created', 'success');
      }
      setCategoryDialogOpen(false);
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to save category');
    } finally {
      setCategorySubmitLoading(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (deleteCategoryId === null) return;
    setCategorySubmitLoading(true);
    try {
      await api.delete(`/categories/${deleteCategoryId}`);
      showToast('Category deleted', 'success');
      setDeleteCategoryId(null);
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to delete category');
    } finally {
      setCategorySubmitLoading(false);
    }
  };

  const inventorySearchResults = useMemo(() => {
    return inventoryItems
      .filter((i) => !recipes.some((r) => r.inventory_item.id === i.id))
      .filter((i) => i.name.toLowerCase().includes(recipeSearch.toLowerCase()));
  }, [inventoryItems, recipes, recipeSearch]);

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader
        title="Menu Management"
        description="Manage menu items, categories, pricing, and recipes"
        action={
          <div className="flex gap-2">
            {hasPermission('categories:view') && (
              <Button variant="outline" onClick={() => openCategoryDialog()}>
                <ListPlus className="size-4 sm:mr-1" /><span className="hidden sm:inline">Categories</span>
              </Button>
            )}
            {canCreate && (
              <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="size-4 sm:mr-1" /><span className="hidden sm:inline">Add Item</span></Button>
            )}
          </div>
        }
      />
      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search menu items..." />
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {[{ id: 'all' as const, name: 'All' }, ...categories].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={`shrink-0 h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${categoryFilter === c.id ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <TableSkeleton columns={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title={search ? 'No menu items match your search' : 'No menu items found'} description={search ? 'Try a different search term' : 'Create your first menu item to get started'} action={!search && canCreate ? <Button onClick={openCreate} size="sm">Add Item</Button> : undefined} />
      ) : (
        <>
        {/* Phone: cards */}
        <ul className="md:hidden space-y-2">
          {filtered.map((item) => (
            <li key={item.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => openEdit(item)}>
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.category?.name}{!item.is_active && ' · Inactive'}</div>
                {(item.food_cost ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">Cost {formatPKR(Math.round(item.food_cost!))} · <MarginText margin={item.margin} /></div>
                )}
              </button>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{formatPKR(item.price)}</div>
              </div>
              {canDelete && (
                <Button variant="ghost" size="icon" className="size-9 text-destructive" aria-label={`Deactivate ${item.name}`} onClick={() => setDeleteId(item.id)}>
                  <Trash className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Food cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category?.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(item.price)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{(item.food_cost ?? 0) > 0 ? formatPKR(Math.round(item.food_cost!)) : '—'}</TableCell>
                <TableCell className="text-right">{(item.food_cost ?? 0) > 0 ? <MarginText margin={item.margin} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell><StatusBadge status={item.is_active ? 'Active' : 'Inactive'} /></TableCell>
                <TableCell>
                    <div className="flex gap-1">
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openEdit(item)} />}>
                        {canEdit || canRecipes ? <PencilSimple className="size-4" /> : <Eye className="size-4" />}
                      </TooltipTrigger><TooltipContent>{canEdit || canRecipes ? 'Edit' : 'View'}</TooltipContent></Tooltip>
                      {canDelete && (
                        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(item.id)} />}>
                          <Trash className="size-4" />
                        </TooltipTrigger><TooltipContent>Deactivate</TooltipContent></Tooltip>
                      )}
                    </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} swipeDirection="right">
        <DrawerContent className="w-full sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{editing ? (canEdit ? `Edit — ${editing.name}` : editing.name) : 'Add Menu Item'}</DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset disabled={!(editing ? canEdit : canCreate)} className="space-y-4">
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
                <Input type="text" inputMode="numeric" pattern="[0-9]*" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </FormField>
              <FormField label="Description">
                <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-input/20 px-3 py-2 text-xs/relaxed placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none resize-none dark:bg-input/30" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </FormField>
              </fieldset>
              {(editing ? canEdit : canCreate) && (
                <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading}>
                  {submitLoading && <Spinner className="size-4 mr-2" />}
                  {editing ? 'Update' : 'Create'}
                </Button>
              )}
            </form>

            {editing && canRecipes && (
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

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : canCreateCategory ? 'Add Category' : 'Categories'}</DialogTitle>
          </DialogHeader>
          {(editingCategory || canCreateCategory) && (<>
          <form onSubmit={handleCategorySubmit} className="space-y-4">
            <FormField label="Name" required>
              <Input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
            </FormField>
            <DialogFooter>
              <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={categorySubmitLoading}>
                {categorySubmitLoading && <Spinner className="size-4 mr-2" />}
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>

          <Separator className="my-2" />
          </>)}

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Existing Categories</h4>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No categories yet</p>
            ) : (
              <div className="space-y-1">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm">{c.name}</span>
                    <div className="flex gap-1">
                      {hasPermission('categories:edit') && (
                        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => openCategoryDialog(c)}>
                          <PencilSimple className="size-3.5" />
                        </Button>
                      )}
                      {hasPermission('categories:delete') && (
                        <Button variant="ghost" size="sm" className="size-7 p-0 text-destructive" onClick={() => setDeleteCategoryId(c.id)}>
                          <Trash className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteCategoryId !== null} onOpenChange={(open) => { if (!open) setDeleteCategoryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>This category will be permanently deleted. You cannot delete a category that has menu items.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={categorySubmitLoading}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
