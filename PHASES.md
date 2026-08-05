# Build Phases — Step-by-Step Checklist

Read PLAN.md for context. This file is the execution script.

---

## Phase 1: Database & Models

### 1.1 Modify users migration
```bash
# File: api/database/migrations/0001_01_01_000000_create_users_table.php
# Add: $table->boolean('is_active')->default(true);
```

### 1.2 Create migrations (run in order)
```bash
# From api/
php artisan make:migration create_categories_table
php artisan make:migration create_menu_items_table
php artisan make:migration create_inventory_items_table
php artisan make:migration create_recipes_table
php artisan make:migration create_stock_movements_table
php artisan make:migration create_sales_table
php artisan make:migration create_sale_items_table
php artisan make:migration create_manual_consumptions_table
```

See SCHEMA.md for column definitions.

### 1.3 Create models
```bash
php artisan make:model Category
php artisan make:model MenuItem
php artisan make:model InventoryItem
php artisan make:model Recipe
php artisan make:model StockMovement
php artisan make:model Sale
php artisan make:model SaleItem
php artisan make:model ManualConsumption
```

See CONVENTIONS.md for model template.

### 1.4 Create seeder
```bash
php artisan make:seeder RolesAndPermissionSeeder
php artisan make:seeder DemoDataSeeder
```

Roles: super-admin, admin, manager, cashier, employee.
Sync permissions per PLAN.md.
Create demo users: admin, cashier1, employee1.
Create demo categories + menu items + inventory items + recipes.

### 1.5 Run
```bash
php artisan migrate:fresh --seed
php artisan test  # verify nothing breaks
```

---

## Phase 2: Auth & Core API

### 2.1 AuthController
```bash
php artisan make:controller Api/AuthController
```
- `login()` — validate email/password, create Sanctum token, return user + roles + permissions
- `logout()` — revoke current token
- `me()` — return authenticated user

### 2.2 CategoryController
```bash
php artisan make:controller Api/CategoryController --resource
```
Standard resource controller. Index: sortable by `sort_order`.

### 2.3 MenuItemController
```bash
php artisan make:controller Api/MenuItemController --resource
```
- Index: filter by `category_id`, only `is_active=true`
- Show: include `category` and `recipe` relations
- Destroy: soft-delete (`is_active = false`)

### 2.4 RecipeController
```bash
php artisan make:controller Api/RecipeController
```
- `index($menuItemId)` — list recipe ingredients
- `store($menuItemId)` — add ingredient (validate unique per menu_item)
- `update($request, $id)` — update quantity
- `destroy($id)` — remove ingredient

### 2.5 InventoryController
```bash
php artisan make:controller Api/InventoryController --resource
```
- `stockIn()` — record intake, create stock_movement (type=in)
- `adjust($id)` — manual correction, create stock_movement (type=adjustment)
- `expire($id)` — mark expired, create stock_movement (type=expiry)

### 2.6 Routes
```php
// api/routes/api.php
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('menu', MenuItemController::class);
    Route::get('/menu/{id}/recipe', [RecipeController::class, 'index']);
    Route::post('/menu/{id}/recipe', [RecipeController::class, 'store']);
    Route::put('/recipes/{id}', [RecipeController::class, 'update']);
    Route::delete('/recipes/{id}', [RecipeController::class, 'destroy']);

    Route::apiResource('inventory', InventoryController::class)->except(['destroy']);
    Route::post('/inventory/stock-in', [InventoryController::class, 'stockIn']);
    Route::post('/inventory/{id}/adjust', [InventoryController::class, 'adjust']);
    Route::post('/inventory/{id}/expire', [InventoryController::class, 'expire']);
});
```

### 2.7 Test
```bash
php artisan test
```

---

## Phase 3: POS & Sales

### 3.1 SaleController
```bash
php artisan make:controller Api/SaleController
```
- `store()` — **atomic transaction with `lockForUpdate()`**
- `index()` — paginated, filter by date/user
- `show($id)` — with sale_items
- `receipt($id)` — formatted receipt data

### 3.2 ManualConsumptionController
```bash
php artisan make:controller Api/ManualConsumptionController
```
- `store()` — record consumption, create stock_movement (type=out)
- `index()` — list with filters

### 3.3 Sale creation flow (critical)
```
1. Begin transaction + lockForUpdate()
2. For each item:
   - Load menu_item + recipe
   - needed = recipe.quantity × sale.quantity
   - Check inventory_item.current_stock >= needed
   - If any fail → rollback + 422
3. Create sale record
4. Create sale_item records (snapshot unit_price)
5. For each ingredient:
   - Decrement inventory_item.current_stock
   - Create stock_movement (type=out)
6. Commit
```

### 3.4 Routes
```php
Route::post('/sales', [SaleController::class, 'store']);
Route::get('/sales', [SaleController::class, 'index']);
Route::get('/sales/{id}', [SaleController::class, 'show']);
Route::get('/sales/{id}/receipt', [SaleController::class, 'receipt']);

Route::post('/consumptions', [ManualConsumptionController::class, 'store']);
Route::get('/consumptions', [ManualConsumptionController::class, 'index']);
```

### 3.5 Test
- Create sale with valid stock → verify deduction
- Create sale with insufficient stock → verify rollback
- Verify stock_movements created

---

## Phase 4: Reports

### 4.1 ReportController
```bash
php artisan make:controller Api/ReportController
```
- `daily()` — date param, sum sales, count transactions, items sold
- `items()` — group sale_items by menu_item, count quantity
- `stock()` — all inventory_items with current_stock
- `waste()` — stock_movements where type=expiry + manual_consumptions grouped by date

### 4.2 Routes
```php
Route::get('/reports/daily', [ReportController::class, 'daily']);
Route::get('/reports/items', [ReportController::class, 'items']);
Route::get('/reports/stock', [ReportController::class, 'stock']);
Route::get('/reports/waste', [ReportController::class, 'waste']);
```

---

## Phase 5: Frontend — Auth & Layout

### 5.1 Setup shadcn/ui
```bash
cd frontend
npx shadcn@latest init
# Select: New York style, CSS variables, React, TypeScript
```

### 5.2 Install shadcn components
```bash
npx shadcn@latest add button card dialog input label select table tabs toast dropdown-menu avatar separator
```

### 5.3 Install react-router
```bash
npm install react-router
```
> react-router is already installed (v8.3), just configure it.

### 5.4 Axios instance
```typescript
// frontend/src/services/api.ts
import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:8000/api/v1' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

### 5.5 Auth context
```typescript
// frontend/src/contexts/AuthContext.tsx
// Store: token, user, permissions
// Actions: login, logout
// Persist token in localStorage
```

### 5.6 Login page
- Email + password form
- Calls POST /login
- Stores token + user
- Redirects to POS page

### 5.7 Layout shell
- Sidebar nav (POS, Menu, Inventory, Reports, Employees)
- Header with user info + logout
- Protected routes: redirect to login if no token

### 5.8 Routes
```typescript
/login          → LoginPage
/               → POS page (default)
/menu           → Menu management
/inventory      → Inventory management
/recipes        → Recipe management
/reports        → Reports dashboard
/consumptions   → Manual consumption
/employees      → Employee management
```

---

## Phase 6: Frontend — POS

### 6.1 POS page
- Left: item grid grouped by category (tabs or sidebar)
- Right: cart sidebar
- Item card: name, price, click to add
- Cart: item list, quantity +/-, remove, total

### 6.2 Checkout flow
- Click "Pay" → POST /api/v1/sales
- Handle insufficient stock error (toast)
- On success: clear cart, show receipt

### 6.3 Receipt preview + print
- `<Receipt />` component: renders 80mm HTML receipt
- Browser print: `window.print()` with `@media print` CSS
- ESC/POS toggle: generate ESC/POS commands (Phase 8)

---

## Phase 7: Frontend — Admin

### 7.1 Menu management
- Table: name, category, price, status
- Create/Edit dialog (name, description, price, category, image)
- Toggle active/inactive

### 7.2 Inventory management
- Table: name, unit, stock, cost, expiry
- Stock-in dialog: item, quantity, reference, note
- Adjust dialog: quantity correction, note
- Expire button: mark as expired

### 7.3 Recipe management
- Select menu item → show recipe ingredients
- Add ingredient: select inventory item, set quantity
- Update/remove ingredients

### 7.4 Reports dashboard
- Daily summary card (total sales, transactions)
- Top items table (bar chart or table)
- Stock levels table (low stock alert)
- Waste/expired table

### 7.5 Manual consumption
- Form: select inventory item, quantity, reason
- List of past consumptions

### 7.6 Employee management
- Table: name, email, role, status
- Edit: name, role dropdown, is_active toggle

---

## Phase 8: Polish & Testing

### 8.1 Backend tests
```bash
cd api && php artisan test
```
Test: auth flow, CRUD, sale creation (valid + insufficient stock), reports

### 8.2 Frontend lint
```bash
cd frontend && npm run lint
```
Fix all oxlint warnings.

### 8.3 Error handling
- Toast notifications for all errors
- Loading spinners on API calls
- Empty states for tables

### 8.4 Responsive
- POS page: tablet-optimized (min 768px)
- Admin pages: responsive sidebar collapse

### 8.5 ESC/POS (optional)
- Web Serial API integration
- ESC/POS command generation
- Printer connection dialog
