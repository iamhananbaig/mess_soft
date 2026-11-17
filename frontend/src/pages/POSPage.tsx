import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { PageSpinner } from '@/components/PageSpinner';
import { EmptyState } from '@/components/EmptyState';
import type { ReceiptData } from '@/types/receipt';
import { PrintDialog } from '@/components/PrintDialog';
import { PrinterStatus } from '@/components/PrinterStatus';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePosSettings } from '@/hooks/usePosSettings';
import { showToast, showErrorToast } from '@/lib/toast';
import { formatPKR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ShoppingCart, Plus, Minus, Trash, MagnifyingGlass, X, CaretRight } from '@phosphor-icons/react';
import type { Category } from '@/types/api';

interface MenuItem { id: number; name: string; price: number; category_id: number; is_available: boolean; }
interface CartItem { menu_item_id: number; name: string; price: number; quantity: number; }

/** Exact amount plus the next round notes a customer is likely to hand over. */
function quickAmounts(total: number): number[] {
  if (total <= 0) return [];
  const up = (step: number) => Math.ceil(total / step) * step;
  return [...new Set([total, up(100), up(500), up(1000), up(5000)])].filter((n) => n >= total).slice(0, 4);
}

export function POSPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [reference, setReference] = useState('');
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printReceiptData, setPrintReceiptData] = useState<ReceiptData | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isMobile = useIsMobile();
  const pos = usePosSettings();
  const searchRef = useRef<HTMLInputElement>(null);

  const methods = useMemo(
    () => pos.available_payment_methods.filter((m) => pos.payment_methods.includes(m.key)),
    [pos],
  );
  // If an admin disables the selected method, fall back to the first enabled one.
  const activeMethod = methods.some((m) => m.key === paymentMethod) ? paymentMethod : methods[0]?.key ?? 'cash';
  const isCash = activeMethod === 'cash';

  const categoryIds = ['all', ...categories.map((c) => String(c.id))];
  const categoryIndex = categoryIds.indexOf(selectedCategory);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([api.get('/categories'), api.get('/menu')]).then(([catRes, menuRes]) => {
      setCategories(catRes.data);
      setMenuItems(menuRes.data);
    }).catch(() => {
      setLoadError('Could not load the menu. Check the connection and try again.');
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems
      .filter((i) => selectedCategory === 'all' || i.category_id === Number(selectedCategory))
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [menuItems, selectedCategory, search]);

  const addToCart = (item: MenuItem) => {
    if (!item.is_available || checkoutLoading) return;
    if ('vibrate' in navigator) navigator.vibrate?.(10); // small tap feedback on phones
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) return prev.map((c) => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQuantity = (menuItemId: number, delta: number) => {
    setCart((prev) => prev
      .map((c) => c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c)
      .filter((c) => c.quantity > 0));
  };

  const clearCart = useCallback(() => {
    setCart([]);
    setAmountReceived('');
    setReference('');
  }, []);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const received = Number(amountReceived);
  const change = isCash && amountReceived !== '' ? received - total : 0;
  const canCharge = cart.length > 0 && !checkoutLoading && (!isCash || (amountReceived !== '' && received >= total));

  const handleCheckout = async () => {
    if (!canCharge) return;
    setCheckoutLoading(true);
    try {
      const saleRes = await api.post('/sales', {
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.quantity })),
        payment_method: activeMethod,
        payment_reference: isCash ? null : reference.trim() || null,
        amount_received: isCash ? received : null,
      });
      const receiptRes = await api.get(`/sales/${saleRes.data.id}/receipt`);
      setPrintReceiptData(receiptRes.data as ReceiptData);
      setPrintDialogOpen(true);
      showToast(`Sale #${saleRes.data.id} — ${formatPKR(saleRes.data.total_amount)}`, 'success');
      clearCart();
      setCartOpen(false);
      // Refresh availability (stock changed).
      api.get('/menu').then((r) => setMenuItems(r.data)).catch(() => {});
    } catch (err) {
      showErrorToast(err, 'Sale failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleChargeClick = () => {
    if (cart.length === 0) return;
    if (isCash && (amountReceived === '' || received < total)) {
      showToast('Enter the cash received (at least the total)', 'error');
      return;
    }
    // On a phone the checkout sheet is the confirmation step; on desktop confirm in a dialog.
    if (isMobile) handleCheckout();
    else setConfirmOpen(true);
  };

  const handleSearchClear = useCallback(() => {
    if (search.length > 0) {
      setSearch('');
      return true;
    }
    return false;
  }, [search]);

  useKeyboardShortcuts({
    onSearchFocus: () => searchRef.current?.focus(),
    onSearchClear: handleSearchClear,
    onCheckout: handleChargeClick,
    onClearCart: clearCart,
    onCategoryPrev: () => { if (categoryIndex > 0) setSelectedCategory(categoryIds[categoryIndex - 1]); },
    onCategoryNext: () => { if (categoryIndex < categoryIds.length - 1) setSelectedCategory(categoryIds[categoryIndex + 1]); },
    onShowHelp: () => setShortcutsOpen(true),
  });

  if (loading) return <PageSpinner />;

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <p className="text-destructive font-medium">{loadError}</p>
      <Button variant="outline" onClick={load}>Retry</Button>
    </div>
  );

  const cartLines = cart.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <ShoppingCart className="size-10 mb-3 opacity-30" />
      <p className="text-sm font-medium">Cart is empty</p>
      <p className="text-xs mt-1 opacity-60">Tap an item to add it</p>
    </div>
  ) : (
    <ul className="divide-y">
      {cart.map((item) => (
        <li key={item.menu_item_id} className="flex items-center gap-2 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{item.name}</div>
            <div className="text-xs text-muted-foreground">{formatPKR(item.price)} × {item.quantity} = {formatPKR(item.price * item.quantity)}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-10 rounded-full" aria-label={`Remove one ${item.name}`} onClick={() => updateQuantity(item.menu_item_id, -1)}>
              {item.quantity === 1 ? <Trash className="size-4 text-destructive" /> : <Minus className="size-4" />}
            </Button>
            <span className="w-7 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
            <Button variant="outline" size="icon" className="size-10 rounded-full" aria-label={`Add one ${item.name}`} onClick={() => updateQuantity(item.menu_item_id, 1)}>
              <Plus className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );

  const payment = (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-lg font-bold">
        <span>Total</span>
        <span className="tabular-nums">{formatPKR(total)}</span>
      </div>

      {methods.length > 1 && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
          {methods.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={activeMethod === m.key}
              onClick={() => setPaymentMethod(m.key)}
              className={cn(
                'h-11 rounded-lg border text-sm font-medium transition-colors',
                activeMethod === m.key ? 'border-accent bg-accent/10 text-accent' : 'hover:bg-muted',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {isCash ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="cash-received">Cash received</label>
          <Input
            id="cash-received"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="h-12 text-lg tabular-nums"
            placeholder={String(total)}
            value={amountReceived}
            onChange={(e) => setAmountReceived(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <div className="flex flex-wrap gap-2">
            {quickAmounts(total).map((amt) => (
              <Button key={amt} type="button" variant="outline" size="sm" className="h-9 tabular-nums" onClick={() => setAmountReceived(String(amt))}>
                {amt === total ? 'Exact' : formatPKR(amt)}
              </Button>
            ))}
          </div>
          {amountReceived !== '' && (
            <div className={cn('flex justify-between text-base font-semibold', change >= 0 ? 'text-green-600' : 'text-destructive')}>
              <span>{change >= 0 ? 'Change' : 'Short'}</span>
              <span className="tabular-nums">{formatPKR(Math.abs(change))}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="pay-ref">Transaction ID (optional)</label>
          <Input id="pay-ref" className="h-11" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder="e.g. last 4 digits / TID" />
        </div>
      )}

      <PrinterStatus />
      <Button
        className="w-full h-12 text-base bg-accent hover:bg-accent/90 text-accent-foreground"
        disabled={!canCharge}
        onClick={handleChargeClick}
      >
        {checkoutLoading && <Spinner className="size-4 mr-2" />}
        {checkoutLoading ? 'Processing…' : `Charge ${formatPKR(total)}${methods.length > 1 ? ` · ${methods.find((m) => m.key === activeMethod)?.label}` : ''}`}
      </Button>
    </div>
  );

  return (
    <div className="flex h-full">
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <PrintDialog data={printReceiptData} open={printDialogOpen} onOpenChange={setPrintDialogOpen} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Confirm sale</DialogTitle>
            <DialogDescription>
              Charge <strong>{formatPKR(total)}</strong> by {methods.find((m) => m.key === activeMethod)?.label ?? 'Cash'}?
              {isCash && change > 0 && <> Give <strong>{formatPKR(change)}</strong> change.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" autoFocus disabled={checkoutLoading}
              onClick={() => { setConfirmOpen(false); handleCheckout(); }}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-12 md:top-16 z-20 bg-background/95 backdrop-blur border-b px-3 py-2 md:p-4 space-y-2">
          <div className="relative md:max-w-sm">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input ref={searchRef} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-9 h-10" />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          {/* Horizontally scrolling category chips — one thumb swipe on a phone */}
          <div className="-mx-3 px-3 md:mx-0 md:px-0 flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap">
            {[{ id: 'all', name: 'All' }, ...categories.map((c) => ({ id: String(c.id), name: c.name }))].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={cn(
                  'shrink-0 h-9 rounded-full border px-4 text-sm font-medium transition-colors',
                  selectedCategory === c.id ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className={cn('flex-1 p-3 md:p-4', isMobile && cart.length > 0 && 'pb-24')}>
          {filteredItems.length === 0 ? (
            <EmptyState title="No items found" description={search ? 'Try a different search' : 'Try another category'} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 md:gap-3">
              {filteredItems.map((item) => {
                const cartQty = cart.find((c) => c.menu_item_id === item.id)?.quantity ?? 0;
                const disabled = !item.is_available || checkoutLoading;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => addToCart(item)}
                    aria-label={`Add ${item.name}, ${formatPKR(item.price)}${!item.is_available ? ', out of stock' : ''}`}
                    className={cn(
                      'relative flex min-h-24 flex-col justify-between rounded-xl border bg-card p-3 text-left transition-all select-none',
                      disabled ? 'opacity-50' : 'active:scale-[0.97] hover:border-accent/60 hover:shadow-sm',
                      cartQty > 0 && 'border-accent ring-1 ring-accent/40',
                    )}
                  >
                    {cartQty > 0 && (
                      <Badge className="absolute top-2 right-2 h-6 min-w-6 rounded-full px-1.5 tabular-nums">{cartQty}</Badge>
                    )}
                    <span className="pr-7 text-sm font-medium leading-snug line-clamp-2">{item.name}</span>
                    <span className="mt-2 flex items-end justify-between">
                      <span className="text-base font-bold text-accent tabular-nums">{formatPKR(item.price)}</span>
                      {!item.is_available && <span className="text-[11px] font-medium text-destructive">Out of stock</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Desktop cart */}
      {!isMobile && (
        <aside className="w-80 lg:w-96 border-l flex flex-col bg-card">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Order</h2>
              {itemCount > 0 && <Badge variant="secondary">{itemCount}</Badge>}
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={clearCart}>
                <Trash className="size-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-auto px-4">{cartLines}</div>
          <div className="p-4 border-t">
            {payment}
            <p className="text-center text-xs text-muted-foreground mt-3">
              Press <kbd className="px-1 py-0.5 rounded bg-muted text-[0.625rem] font-medium">?</kbd> for keyboard shortcuts
            </p>
          </div>
        </aside>
      )}

      {/* Phone: cart bar pinned above the tab bar */}
      {isMobile && cart.length > 0 && !cartOpen && (
        <div className="fixed inset-x-0 z-30 px-3" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-3 text-accent-foreground shadow-lg active:scale-[0.99] transition-transform"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-accent-foreground/20 text-sm font-bold tabular-nums">{itemCount}</span>
            <span className="flex-1 text-left">
              <span className="block text-xs opacity-80">{itemCount === 1 ? '1 item' : `${itemCount} items`}</span>
              <span className="block text-lg font-bold tabular-nums">{formatPKR(total)}</span>
            </span>
            <span className="flex items-center gap-1 font-semibold">Checkout <CaretRight className="size-4" /></span>
          </button>
        </div>
      )}

      {isMobile && (
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetContent side="bottom" className="max-h-[92dvh] rounded-t-2xl p-0 flex flex-col gap-0">
            <SheetHeader className="px-4 pt-4 pb-2 border-b">
              <div className="flex items-center justify-between pr-8">
                <SheetTitle>Order · {itemCount} {itemCount === 1 ? 'item' : 'items'}</SheetTitle>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => { clearCart(); setCartOpen(false); }}>
                    Clear
                  </Button>
                )}
              </div>
              <SheetDescription className="sr-only">Review the order and take payment</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">{cartLines}</div>
            <div className="border-t p-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              {payment}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
