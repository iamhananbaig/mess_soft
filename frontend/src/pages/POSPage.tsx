import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { PageSpinner } from '@/components/PageSpinner';
import { EmptyState } from '@/components/EmptyState';
import { printReceipt, type ReceiptData } from '@/components/Receipt';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { showToast } from '@/lib/toast';
import { formatPKR } from '@/lib/format';
import { ShoppingCart, Plus, Minus, X, Trash, MagnifyingGlass } from '@phosphor-icons/react';

interface Category { id: number; name: string; }
interface MenuItem { id: number; name: string; price: number; category_id: number; is_available: boolean; }
interface CartItem { menu_item_id: number; name: string; price: number; quantity: number; }

export function POSPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [posSearch, setPosSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const categoryIds = ['all', ...categories.map((c) => String(c.id))];
  const categoryIndex = categoryIds.indexOf(selectedCategory);

  useEffect(() => {
    Promise.all([api.get('/categories'), api.get('/menu')]).then(([catRes, menuRes]) => {
      setCategories(catRes.data);
      setMenuItems(menuRes.data);
    }).catch(() => {
      setLoadError('Failed to load menu data');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const filteredItems = (selectedCategory === 'all'
    ? menuItems
    : menuItems.filter((item) => item.category_id === Number(selectedCategory))
  ).filter((item) => item.name.toLowerCase().includes(posSearch.toLowerCase()));

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQuantity = (menuItemId: number, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((c) => c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c);
      return updated.filter((c) => c.quantity > 0);
    });
  };

  const removeFromCart = (menuItemId: number) => {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== menuItemId));
  };

  const clearCart = useCallback(() => setCart([]), []);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);
    try {
      const saleRes = await api.post('/sales', {
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.quantity })),
      });
      const receiptRes = await api.get(`/sales/${saleRes.data.id}/receipt`);
      printReceipt(receiptRes.data as ReceiptData);
      showToast(`Sale #${saleRes.data.id} — ${formatPKR(saleRes.data.total_amount)}`, 'success');
      setCart([]);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Sale failed';
      showToast(message, 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleSearchClear = useCallback(() => {
    if (posSearch.length > 0) {
      setPosSearch('');
      return true;
    }
    return false;
  }, [posSearch]);

  useKeyboardShortcuts({
    onSearchFocus: () => searchRef.current?.focus(),
    onSearchClear: handleSearchClear,
    onCheckout: handleCheckout,
    onClearCart: clearCart,
    onCategoryPrev: () => {
      if (categoryIndex > 0) {
        setSelectedCategory(categoryIds[categoryIndex - 1]);
      }
    },
    onCategoryNext: () => {
      if (categoryIndex < categoryIds.length - 1) {
        setSelectedCategory(categoryIds[categoryIndex + 1]);
      }
    },
    onShowHelp: () => setShortcutsOpen(true),
  });

  if (loading) return <PageSpinner />;

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-destructive font-medium">{loadError}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
    </div>
  );

  return (
    <div className="flex h-full">
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {/* Menu Items Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b space-y-3">
          <div className="relative max-w-sm">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input ref={searchRef} placeholder="Search items... ( / )" value={posSearch} onChange={(e) => setPosSearch(e.target.value)} className="pl-9" />
          </div>
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="all">All</TabsTrigger>
              {categories.map((cat) => (
                <TabsTrigger key={cat.id} value={String(cat.id)}>{cat.name}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {filteredItems.length === 0 ? (
            <EmptyState title="No menu items found" description="Try selecting a different category" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className={`transition-all ${item.is_available && !checkoutLoading ? 'cursor-pointer hover:shadow-md hover:border-accent/50 active:scale-[0.97]' : 'opacity-50 cursor-not-allowed'}`}
                  role="button"
                  tabIndex={item.is_available && !checkoutLoading ? 0 : -1}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (item.is_available && !checkoutLoading) addToCart(item); } }}
                  onClick={() => item.is_available && !checkoutLoading && addToCart(item)}
                  aria-label={`Add ${item.name} — ${formatPKR(item.price)}${!item.is_available ? ' (out of stock)' : ''}`}
                >
                  <CardContent className="p-4 text-center">
                    <div className="font-medium text-sm mb-1">{item.name}</div>
                    <div className="text-lg font-bold text-accent">{formatPKR(item.price)}</div>
                    {!item.is_available && (
                      <div className="text-xs text-destructive font-medium mt-1">Out of stock</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-80 lg:w-96 border-l flex flex-col bg-card">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">Order</h2>
            {itemCount > 0 && <Badge variant="secondary" className="text-xs">{itemCount}</Badge>}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={clearCart}>
              <Trash className="size-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="size-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Cart is empty</p>
              <p className="text-xs mt-1 opacity-60">Tap an item to add it</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.menu_item_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{formatPKR(item.price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="size-7 p-0" aria-label="Decrease quantity" onClick={() => updateQuantity(item.menu_item_id, -1)}>
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-7 text-center text-sm font-medium">{item.quantity}</span>
                    <Button variant="outline" size="sm" className="size-7 p-0" aria-label="Increase quantity" onClick={() => updateQuantity(item.menu_item_id, 1)}>
                      <Plus className="size-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="size-7 p-0 text-destructive" aria-label="Remove item" onClick={() => removeFromCart(item.menu_item_id)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>Subtotal ({itemCount} items)</span>
            <span>{formatPKR(total)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between text-lg font-bold mb-4">
            <span>Total</span>
            <span>{formatPKR(total)}</span>
          </div>
          <Button
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            size="lg"
            disabled={cart.length === 0 || checkoutLoading}
            onClick={handleCheckout}
          >
            {checkoutLoading ? <Spinner className="size-4 mr-2" /> : null}
            {checkoutLoading ? 'Processing...' : `Pay Cash — ${formatPKR(total)}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-3">
            Press <kbd className="px-1 py-0.5 rounded bg-muted text-[0.625rem] font-medium">?</kbd> for keyboard shortcuts
          </p>
        </div>
      </div>
    </div>
  );
}
