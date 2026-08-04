# Code Conventions & Patterns

---

## Laravel Backend

### Migration template
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('table_name', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->bigInteger('price'); // PKR
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            // Indexes
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_name');
    }
};
```

### Model template
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuItem extends Model
{
    use HasFactory;

    protected $fillable = ['category_id', 'name', 'description', 'price', 'image', 'is_active'];
    protected $casts = ['price' => 'integer', 'is_active' => 'boolean'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function recipes(): HasMany
    {
        return $this->hasMany(Recipe::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
```

### Controller template
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MenuItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = MenuItem::with('category')
            ->when($request->category_id, fn($q, $catId) => $q->where('category_id', $catId))
            ->active()
            ->orderBy('name')
            ->get();

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'required|exists:categories,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'price' => 'required|integer|min:0',
            'image' => 'nullable|string|max:255',
        ]);

        $item = MenuItem::create($validated);
        return response()->json($item->load('category'), 201);
    }

    public function show(MenuItem $menuItem): JsonResponse
    {
        return response()->json($menuItem->load(['category', 'recipes.inventoryItem']));
    }

    public function update(Request $request, MenuItem $menuItem): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'sometimes|exists:categories,id',
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'price' => 'sometimes|integer|min:0',
            'image' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $menuItem->update($validated);
        return response()->json($menuItem->load('category'));
    }

    public function destroy(MenuItem $menuItem): JsonResponse
    {
        $menuItem->update(['is_active' => false]);
        return response()->json(['message' => 'Menu item deactivated']);
    }
}
```

### Stock validation pattern (sales)
```php
use Illuminate\Support\Facades\DB;

DB::transaction(function () use ($items) {
    foreach ($items as $item) {
        $menuItem = MenuItem::with('recipes.inventoryItem')->findOrFail($item['menu_item_id']);

        foreach ($menuItem->recipes as $recipe) {
            $needed = $recipe->quantity * $item['quantity'];
            $inventory = $recipe->inventoryItem;

            if ($inventory->current_stock < $needed) {
                abort(422, "Insufficient stock for {$inventory->name}");
            }
        }
    }

    // Create sale, deduct stock, create movements
    // ...
});
```

---

## React Frontend

### Component structure
```
frontend/src/
├── components/           # Shared/reusable components
│   ├── ui/               # shadcn/ui components (auto-generated)
│   ├── Layout.tsx        # Sidebar + header shell
│   └── Receipt.tsx       # Receipt preview component
├── pages/                # Route-level components
│   ├── LoginPage.tsx
│   ├── POSPage.tsx
│   ├── MenuPage.tsx
│   ├── InventoryPage.tsx
│   ├── RecipePage.tsx
│   ├── ReportsPage.tsx
│   ├── ConsumptionPage.tsx
│   └── EmployeesPage.tsx
├── contexts/             # React contexts
│   └── AuthContext.tsx
├── services/             # API layer
│   └── api.ts            # Axios instance + interceptors
├── App.tsx               # Router setup
├── main.tsx              # Entry point
└── index.css             # Tailwind imports
```

### Component template
```tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/services/api';

export function MenuPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/menu').then(res => {
      setItems(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="grid gap-4">
      {items.map(item => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle>{item.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Rs.{item.price}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### API service pattern
```typescript
// frontend/src/services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Auth context template
```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '@/services/api';

interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      api.get('/me').then(res => setUser(res.data));
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    api.post('/logout');
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const hasPermission = (permission: string) =>
    user?.permissions.includes(permission) ?? false;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext) as AuthContextType;
```

### Route setup
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { POSPage } from '@/pages/POSPage';
// ... other imports

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<POSPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="recipes" element={<RecipePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="consumptions" element={<ConsumptionPage />} />
            <Route path="employees" element={<EmployeesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

---

## shadcn/ui Setup

### Install
```bash
cd frontend
npx shadcn@latest init
# Style: New York
# Base color: Neutral
# CSS variables: yes

npx shadcn@latest add button card dialog input label select table tabs toast dropdown-menu avatar separator
```

### cn() utility
```typescript
// frontend/src/lib/utils.ts (auto-generated by shadcn)
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## Naming Conventions

| What | Convention | Example |
|------|------------|---------|
| DB tables | snake_case, plural | `menu_items`, `stock_movements` |
| DB columns | snake_case | `menu_item_id`, `current_stock` |
| Models | PascalCase, singular | `MenuItem`, `StockMovement` |
| Controllers | PascalCase, plural | `MenuItemController` |
| API URLs | kebab-case, plural | `/api/v1/menu-items` (or `/menu`) |
| React components | PascalCase | `MenuPage.tsx`, `Receipt.tsx` |
| React files | PascalCase for components, camelCase for utils | `MenuPage.tsx`, `api.ts` |
| JS variables | camelCase | `menuItem`, `totalAmount` |
| CSS classes | Tailwind utility classes | `className="text-lg font-bold"` |
