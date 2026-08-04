# API Endpoints Quick Reference

All under `/api/v1/`. Sanctum auth required except login.
JSON responses. Error format: `{ "message": "...", "errors": {...} }`

---

## Auth

### POST `/api/v1/login`
No auth required.
```json
// Request
{ "email": "admin@canteen.com", "password": "password" }

// Response 200
{
  "token": "1|abc...",
  "user": { "id": 1, "name": "Admin", "email": "...", "roles": ["admin"], "permissions": ["menu:create", ...] }
}
```

### POST `/api/v1/logout`
Any authenticated user. Revokes current token.

### GET `/api/v1/me`
Any authenticated user. Returns user + roles + permissions.

---

## Categories

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/categories` | any |
| POST | `/categories` | `menu:create` |
| PUT | `/categories/{id}` | `menu:edit` |
| DELETE | `/categories/{id}` | `menu:delete` |

```json
// POST / PUT body
{ "name": "Burgers", "sort_order": 1 }
```

---

## Menu Items

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/menu` | any |
| GET | `/menu/{id}` | any |
| POST | `/menu` | `menu:create` |
| PUT | `/menu/{id}` | `menu:edit` |
| DELETE | `/menu/{id}` | `menu:delete` |

```json
// POST / PUT body
{
  "category_id": 1,
  "name": "Chicken Burger",
  "description": "Grilled chicken with lettuce",
  "price": 350,
  "image": null
}

// GET /menu response
{
  "id": 1,
  "name": "Chicken Burger",
  "price": 350,
  "category": { "id": 1, "name": "Burgers" },
  "is_active": true
}
```

> DELETE is soft-delete: sets `is_active = false`.

---

## Recipes

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/menu/{id}/recipe` | any |
| POST | `/menu/{id}/recipe` | `recipes:manage` |
| PUT | `/recipes/{id}` | `recipes:manage` |
| DELETE | `/recipes/{id}` | `recipes:manage` |

```json
// POST body (add ingredient to recipe)
{ "inventory_item_id": 1, "quantity": 2 }

// PUT body (update quantity)
{ "quantity": 3 }

// GET /menu/{id}/recipe response
[
  { "id": 1, "inventory_item": { "id": 1, "name": "Bun" }, "quantity": 2 },
  { "id": 2, "inventory_item": { "id": 2, "name": "Chicken Patty" }, "quantity": 1 }
]
```

---

## Inventory

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/inventory` | `inventory:view` |
| GET | `/inventory/{id}` | `inventory:view` |
| POST | `/inventory` | `inventory:adjust` |
| PUT | `/inventory/{id}` | `inventory:adjust` |
| POST | `/inventory/stock-in` | `inventory:stock-in` |
| POST | `/inventory/{id}/adjust` | `inventory:adjust` |
| POST | `/inventory/{id}/expire` | `inventory:adjust` |

```json
// POST /inventory body (create item)
{ "name": "Bun", "unit": "pcs", "cost_per_unit": 15, "current_stock": 100 }

// POST /inventory/stock-in body
{ "inventory_item_id": 1, "quantity": 50, "reference": "PO-001", "note": "Weekly restock" }

// POST /inventory/{id}/adjust body
{ "quantity": -5, "note": "Damaged" }

// POST /inventory/{id}/expire body
{ "quantity": 10, "note": "Batch expired" }
```

---

## Sales (POS)

| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | `/sales` | `pos:use` |
| GET | `/sales` | `sales:view-all` |
| GET | `/sales/{id}` | `sales:view-own` |
| GET | `/sales/{id}/receipt` | `sales:view-own` |

```json
// POST /sales body
{
  "items": [
    { "menu_item_id": 1, "quantity": 2 },
    { "menu_item_id": 5, "quantity": 1 }
  ]
}

// POST /sales response 200
{
  "id": 42,
  "total_amount": 450,
  "items": [
    { "menu_item_id": 1, "quantity": 2, "unit_price": 200 },
    { "menu_item_id": 5, "quantity": 1, "unit_price": 50 }
  ]
}

// POST /sales response 422 (insufficient stock)
{ "message": "Insufficient stock for Bun" }
```

> Backend: atomic transaction → validates recipe ingredients → deducts stock → creates sale + sale_items + stock_movements.

### GET `/sales` query params
- `?from=2026-08-01&to=2026-08-31` — date range (UTC)
- `?user_id=3` — filter by cashier
- `?per_page=20` — pagination

---

## Manual Consumption

| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | `/consumptions` | `consumptions:create` |
| GET | `/consumptions` | `consumptions:view` |

```json
// POST body
{ "inventory_item_id": 1, "quantity": 5, "reason": "Staff meal" }
```

---

## Reports

| Method | Endpoint | Permission | Returns |
|--------|----------|------------|---------|
| GET | `/reports/daily` | `reports:view` | Daily sales summary |
| GET | `/reports/items` | `reports:view` | Top-selling items |
| GET | `/reports/stock` | `reports:view` | Current stock levels + value |
| GET | `/reports/waste` | `reports:view` | Expired + manual consumption |

```json
// GET /reports/daily?date=2026-08-05
{
  "date": "2026-08-05",
  "total_sales": 12500,
  "total_transactions": 45,
  "items_sold": 78
}

// GET /reports/stock
[
  { "id": 1, "name": "Bun", "current_stock": 48, "cost_per_unit": 15, "total_value": 720 }
]
```

---

## Employees

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/employees` | `employees:view` |
| PUT | `/employees/{id}` | `employees:manage` |

```json
// PUT body
{ "name": "New Name", "is_active": true }

// Role change: use Spatie directly
// POST /employees/{id}/role
{ "role": "cashier" }
```

---

## Permissions Summary

| Permission | Roles |
|------------|-------|
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
