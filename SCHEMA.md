# Database Schema Quick Reference

SQLite. All monetary values: PKR (integer). Timestamps: UTC.

---

## users (modify existing)

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| name | varchar(255) | |
| email | varchar(255) | unique |
| password | varchar(255) | hashed |
| is_active | boolean | default: true |
| created_at | timestamp | |
| updated_at | timestamp | |

> Wallet deferred. Spatie manages roles via `model_has_roles`.

---

## categories

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| name | varchar(255) | unique |
| sort_order | int | default: 0 |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## menu_items

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| category_id | bigint FK → categories | |
| name | varchar(255) | |
| description | text | nullable |
| price | bigint | PKR |
| image | varchar(255) | nullable, path |
| is_active | boolean | default: true |
| created_at | timestamp | |
| updated_at | timestamp | |

> **No stock_quantity.** Stock lives on inventory_items. Recipe links them.

---

## inventory_items

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| name | varchar(255) | e.g. "Chicken Patty", "Bun" |
| unit | varchar(50) | pcs, ml, g, kg, bottle |
| current_stock | decimal(10,2) | quantity on hand |
| expiry_date | date | nullable, batch expiry |
| is_active | boolean | default: true |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## recipes

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| menu_item_id | bigint FK → menu_items | |
| inventory_item_id | bigint FK → inventory_items | |
| quantity | decimal(10,2) | inventory consumed per 1 menu item |
| created_at | timestamp | |
| updated_at | timestamp | |

> Unique constraint: `(menu_item_id, inventory_item_id)`
> Example: Burger → bun × 2, patty × 1, sauce × 1

---

## stock_movements

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| inventory_item_id | bigint FK → inventory_items | |
| type | enum(`in`, `out`, `adjustment`, `expiry`) | |
| quantity | decimal(10,2) | positive for `in`, negative for `out` |
| reference | varchar(255) | nullable, PO/UR number |
| note | varchar(255) | "Weekly restock", "Damaged", etc. |
| user_id | bigint FK → users | who performed |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## sales

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| user_id | bigint FK → users | cashier who processed |
| total_amount | bigint | PKR |
| payment_method | enum(`cash`) | wallet added later |
| amount_received | bigint | nullable, cash tendered |
| change | bigint | nullable, change given |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## sale_items

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| sale_id | bigint FK → sales | |
| menu_item_id | bigint FK → menu_items | |
| quantity | int | |
| unit_price | bigint | PKR (price snapshot at sale time) |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## manual_consumptions

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | auto |
| inventory_item_id | bigint FK → inventory_items | |
| quantity | decimal(10,2) | amount consumed |
| reason | varchar(255) | "Staff meal", "Damaged", "Expired", etc. |
| user_id | bigint FK → users | who recorded |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## Relationships

```
users ──< sales (user_id)
users ──< stock_movements (user_id)
users ──< manual_consumptions (user_id)

categories ──< menu_items (category_id)
menu_items ──< recipes (menu_item_id)
menu_items ──< sale_items (menu_item_id)

inventory_items ──< recipes (inventory_item_id)
inventory_items ──< stock_movements (inventory_item_id)
inventory_items ──< manual_consumptions (inventory_item_id)

sales ──< sale_items (sale_id)
```
