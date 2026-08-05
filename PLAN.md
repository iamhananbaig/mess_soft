# Implementation Plan — mess_soft (Canteen Management)

## Overview
POS + inventory system for a canteen. Key feature: **recipe-based stock consumption** — selling a burger deducts bun + patty from inventory. Simple items (cold drink) consume 1:1. Includes manual consumption, expired items, sale reports, and thermal receipt printing (browser print + ESC/POS).

**Currency: PKR (Pakistani Rupee).** All monetary values stored as integers in PKR.

**Cash only for now.** Prepaid employee wallet deferred to Phase 4.

---

## Project Layout

```
mess_soft/
├── api/                     # Laravel 13 app
│   ├── app/
│   │   ├── Http/Controllers/Api/
│   │   ├── Models/
│   │   └── Services/        # POS logic, receipt generation
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   └── routes/api.php
├── frontend/                # Standalone React 19 + Vite 8 app
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── contexts/
│       └── services/
├── PLAN.md
└── AGENTS.md
```

---

## Database Schema

### users (modify existing)
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| name | varchar(255) | |
| email | varchar(255) | unique |
| password | varchar(255) | hashed |
| is_active | boolean | default: true |
| timestamps | | |

> Wallet deferred. Spatie manages roles via `model_has_roles`.

### categories
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| name | varchar(255) | unique |
| sort_order | int | default: 0 |
| timestamps | | |

### menu_items
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| category_id | bigint FK → categories | |
| name | varchar(255) | |
| description | text | nullable |
| price | bigint | in PKR |
| image | varchar(255) | nullable, path |
| is_active | boolean | default: true |
| timestamps | | |

> **No stock_quantity on menu item.** Stock lives on inventory_items. Recipe links them.

### inventory_items
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| name | varchar(255) | e.g. "Chicken Patty", "Bun", "Coke 500ml" |
| unit | varchar(50) | pcs, ml, g, kg, bottle |
| current_stock | decimal(10,2) | quantity on hand |
| expiry_date | date | nullable, batch expiry |
| is_active | boolean | default: true |
| timestamps | | |

### recipes
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| menu_item_id | bigint FK → menu_items | |
| inventory_item_id | bigint FK → inventory_items | |
| quantity | decimal(10,2) | how much inventory 1 menu item consumes |
| timestamps | | |

> Unique constraint: `(menu_item_id, inventory_item_id)`. A burger has multiple rows: bun × 2, patty × 1, sauce × 1.

### stock_movements
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| inventory_item_id | bigint FK → inventory_items | |
| type | enum(`in`, `out`, `adjustment`, `expiry`) | |
| quantity | decimal(10,2) | positive for in, negative for out |
| reference | varchar(255) | nullable, PO/UR number |
| note | varchar(255) | "Weekly restock", "Damaged", etc. |
| user_id | bigint FK → users | who performed |
| timestamps | | |

### sales
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| user_id | bigint FK → users | cashier who processed |
| total_amount | bigint | in PKR |
| payment_method | enum(`cash`) | wallet added later |
| timestamps | | |

### sale_items
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| sale_id | bigint FK → sales | |
| menu_item_id | bigint FK → menu_items | |
| quantity | int | |
| unit_price | bigint | in PKR (price snapshot at sale time) |
| timestamps | | |

### manual_consumptions
| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| inventory_item_id | bigint FK → inventory_items | |
| quantity | decimal(10,2) | amount consumed |
| reason | varchar(255) | "Staff meal", "Damaged", "Expired", etc. |
| user_id | bigint FK → users | who recorded |
| timestamps | | |

---

## Roles & Permissions (Spatie)

### Roles
| Role | Description |
|------|-------------|
| `super-admin` | Full system access |
| `admin` | Manages menu, inventory, reports, recipes |
| `manager` | Views reports, manages stock |
| `cashier` | POS operations only |
| `employee` | Buys items, views menu, own history |

### Permissions
| Permission | Assigned To |
|------------|-------------|
| `pos:use` | super-admin, admin, manager, cashier |
| `menu:view` | all |
| `menu:create` | super-admin, admin |
| `menu:edit` | super-admin, admin, manager |
| `menu:delete` | super-admin, admin |
| `inventory:view` | super-admin, admin, manager |
| `inventory:stock-in` | super-admin, admin, manager |
| `inventory:adjust` | super-admin, admin |
| `recipes:manage` | super-admin, admin |
| `reports:view` | super-admin, admin, manager |
| `employees:view` | super-admin, admin, manager |
| `employees:manage` | super-admin, admin |
| `consumptions:create` | super-admin, admin, manager |
| `consumptions:view` | super-admin, admin, manager |
| `sales:view-own` | all |
| `sales:view-all` | super-admin, admin, manager |

---

## API Endpoints

All under `/api/v1/`. Sanctum auth required except login.

### Auth
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| POST | `/login` | none | Email + password → token + user + permissions |
| POST | `/logout` | any | Revoke current token |
| GET | `/me` | any | Current user with roles + permissions |

### Categories
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| GET | `/categories` | any | List categories |
| POST | `/categories` | menu:create | Create |
| PUT | `/categories/{id}` | menu:edit | Update |
| DELETE | `/categories/{id}` | menu:delete | Delete |

### Menu Items
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| GET | `/menu` | any | List active items with category |
| GET | `/menu/{id}` | any | Single item with recipe |
| POST | `/menu` | menu:create | Create |
| PUT | `/menu/{id}` | menu:edit | Update |
| DELETE | `/menu/{id}` | menu:delete | Soft-delete (`is_active=false`) |

### Recipes
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| GET | `/menu/{id}/recipe` | any | Get recipe for a menu item |
| POST | `/menu/{id}/recipe` | recipes:manage | Add ingredient to recipe |
| PUT | `/recipes/{id}` | recipes:manage | Update quantity |
| DELETE | `/recipes/{id}` | recipes:manage | Remove ingredient |

### Inventory
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| GET | `/inventory` | inventory:view | List all items with stock levels |
| GET | `/inventory/{id}` | inventory:view | Single item + stock history |
| POST | `/inventory` | inventory:adjust | Create new inventory item |
| PUT | `/inventory/{id}` | inventory:adjust | Update item details |
| POST | `/inventory/stock-in` | inventory:stock-in | Record stock intake (with reference) |
| POST | `/inventory/{id}/adjust` | inventory:adjust | Manual stock correction |
| POST | `/inventory/{id}/expire` | inventory:adjust | Mark stock as expired |

### Sales (POS)
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| POST | `/sales` | pos:use | **Create sale** — validates stock, deducts ingredients atomically |
| GET | `/sales` | sales:view-all | List (admin: all, employee: own) |
| GET | `/sales/{id}` | sales:view-own | Sale detail with line items |
| GET | `/sales/{id}/receipt` | sales:view-own | Receipt data for printing |

### Manual Consumption
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| POST | `/consumptions` | consumptions:create | Record manual stock reduction |
| GET | `/consumptions` | consumptions:view | List all |

### Reports
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| GET | `/reports/daily` | reports:view | Daily sales summary |
| GET | `/reports/items` | reports:view | Top-selling items |
| GET | `/reports/stock` | reports:view | Current stock levels + value |
| GET | `/reports/waste` | reports:view | Expired + manual consumption |

### Employees
| Method | Endpoint | Permission | Purpose |
|--------|----------|------------|---------|
| GET | `/employees` | employees:view | List all users |
| PUT | `/employees/{id}` | employees:manage | Update user (name, role, is_active) |

---

## Sale Creation Flow (Critical Path)

```
POST /api/v1/sales
{
  "items": [
    { "menu_item_id": 1, "quantity": 2 },
    { "menu_item_id": 5, "quantity": 1 }
  ]
}
```

**Backend processing (atomic transaction):**

1. Begin DB transaction with `lockForUpdate()`
2. For each sale item:
   - Load menu item + recipe ingredients
   - Calculate total needed: `recipe.quantity × sale.quantity`
   - Check `inventory_item.current_stock >= needed` for each ingredient
   - If any insufficient → **rollback**, return 422 with `"Insufficient stock for {ingredient}"`
3. Calculate `total_amount` from menu prices (in PKR)
4. Create `sale` record
5. Create `sale_item` records (snapshot `unit_price`)
6. For each ingredient:
   - Decrement `inventory_item.current_stock`
   - Create `stock_movement` (type=out)
7. Commit transaction

---

## Receipt Printing

### Format (80mm thermal paper)
```
        [CANTEEN NAME]
      [Address, Phone]
    ─────────────────────
    Date: 2026-08-05 14:30
    Receipt #: 000042
    Cashier: John
    ─────────────────────
    Item          Qty   Price   Amount
    ─────────────────────
    Burger         2    200     400
    Coke           1     50      50
    ─────────────────────
    Total:              Rs.450
    Payment: Cash
    ─────────────────────
        Thank you!
```

### Two Modes

**Mode 1: Browser Print (default)**
- Format receipt as HTML div (80mm width, monospace font)
- `window.print()` with print-specific CSS (`@media print`)
- Works with any printer driver installed on the OS

**Mode 2: ESC/POS (optional)**
- Generate ESC/POS commands (initialize, text, cut, etc.)
- Send via Web Serial API or USB endpoint
- For dedicated POS terminals with thermal printers

**Frontend:** `<Receipt />` component renders receipt data. `<PrintButton />` handles both modes with a toggle.

---

## Implementation Phases

### Phase 1: Database & Models
- Modify `users` migration (add `is_active`)
- Create migrations: `categories`, `menu_items`, `inventory_items`, `recipes`, `stock_movements`, `sales`, `sale_items`, `manual_consumptions`
- Create Eloquent models with relationships
- Seeder: roles, permissions, role-permission sync, demo users, demo categories + menu items + inventory items + recipes

### Phase 2: Auth & Core API
- `AuthController` (login, logout, me)
- `CategoryController` (CRUD)
- `MenuItemController` (CRUD)
- `RecipeController` (CRUD for recipe ingredients)
- `InventoryController` (CRUD, stock-in with reference, adjust, expire)

### Phase 3: POS & Sales
- `SaleController` (create with atomic stock deduction, list, show, receipt data)
- Recipe consumption logic with `lockForUpdate()`
- `ManualConsumptionController` (record + list)

### Phase 4: Reports
- `ReportController` (daily summary, top items, stock levels, waste/expired)

### Phase 5: Frontend — Auth & Layout
- Axios instance + auth interceptor
- Auth context (login, logout, token storage, permissions)
- Login page
- Layout shell (sidebar nav, header)

### Phase 6: Frontend — POS
- POS page: item grid by category, cart sidebar, checkout
- Receipt preview + print (browser + ESC/POS toggle)

### Phase 7: Frontend — Admin
- Menu management (CRUD with image upload)
- Inventory management (stock levels, stock-in form, adjustments)
- Recipe management (assign ingredients to menu items, set quantities)
- Reports dashboard (daily sales, top items, stock value, waste)
- Manual consumption page
- Employee management

### Phase 8: Polish & Testing
- API tests (PHPUnit with SQLite in-memory)
- Error handling (insufficient stock toasts, validation messages)
- Loading states, empty states
- Responsive layout (POS on tablet)
- oxlint clean frontend

---

## Key Business Rules
- All monetary values in **PKR** (integer)
- Use `lockForUpdate()` in DB transactions for stock validation
- Soft deletes on menu items: `is_active = false`, never hard delete
- Stock movements are the audit trail — never delete them
- `unit_price` on `sale_items` is a snapshot (menu price can change later)
- Manual consumption requires a reason (for reporting)
- Expired items: mark expiry → creates stock movement (type=expiry) → reduces stock
- Error responses: `{ "message": "...", "errors": {...} }`
- All dates/times stored in **UTC**. Display/export in **GMT+5** (Pakistan timezone)
- Receipts show prices in PKR format: `Rs.XXX`
