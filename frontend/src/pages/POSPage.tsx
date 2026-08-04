import { useState, useEffect } from 'react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { printReceipt, type ReceiptData } from '@/components/Receipt';
import { showToast } from '@/lib/toast';

interface Category {
  id: number;
  name: string;
}

interface MenuItem {
  id: number;
  name: string;
  price: number;
  category_id: number;
}

interface CartItem {
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
}

export function POSPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/categories'),
      api.get('/menu'),
    ]).then(([catRes, menuRes]) => {
      setCategories(catRes.data);
      setMenuItems(menuRes.data);
      setLoading(false);
    });
  }, []);

  const filteredItems = selectedCategory === 'all'
    ? menuItems
    : menuItems.filter((item) => item.category_id === Number(selectedCategory));

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQuantity = (menuItemId: number, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((c) =>
        c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c
      );
      return updated.filter((c) => c.quantity > 0);
    });
  };

  const removeFromCart = (menuItemId: number) => {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== menuItemId));
  };

  const clearCart = () => setCart([]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);

    try {
      const saleRes = await api.post('/sales', {
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.quantity })),
      });

      const receiptRes = await api.get(`/sales/${saleRes.data.id}/receipt`);
      printReceipt(receiptRes.data as ReceiptData);

      showToast(`Sale #${saleRes.data.id} — Rs.${saleRes.data.total_amount}`, 'success');
      setCart([]);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Sale failed';
      showToast(message, 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-52px)] md:h-[calc(100vh-0px)]">
      {/* Left: Menu Items */}
      <div className="flex-1 p-4 overflow-auto">
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((cat) => (
              <TabsTrigger key={cat.id} value={String(cat.id)}>
                {cat.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            No menu items found
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => addToCart(item)}
              >
                <CardContent className="p-4 text-center">
                  <div className="font-medium text-sm">{item.name}</div>
                  <div className="text-lg font-bold mt-1">Rs.{item.price}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="w-full md:w-80 bg-white border-l flex flex-col max-h-[50vh] md:max-h-none">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">Cart</h2>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" className="text-red-500 mt-1" onClick={clearCart}>
              Clear all
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-gray-400 text-center mt-8">Cart is empty</div>
          ) : (
            cart.map((item) => (
              <div key={item.menu_item_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.name}</div>
                  <div className="text-xs text-gray-500">Rs.{item.price} each</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateQuantity(item.menu_item_id, -1)}
                  >
                    -
                  </Button>
                  <Badge variant="secondary" className="min-w-[24px] justify-center">
                    {item.quantity}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateQuantity(item.menu_item_id, 1)}
                  >
                    +
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500"
                    onClick={() => removeFromCart(item.menu_item_id)}
                  >
                    x
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t">
          <div className="flex justify-between text-lg font-bold mb-4">
            <span>Total</span>
            <span>Rs.{total}</span>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={cart.length === 0 || checkoutLoading}
            onClick={handleCheckout}
          >
            {checkoutLoading ? <Spinner className="h-4 w-4 mr-2" /> : null}
            {checkoutLoading ? 'Processing...' : `Pay Cash — Rs.${total}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
