# API Reference

All endpoints are under **`/api/v1`**. Send `Authorization: Bearer <token>` (from
`/login`) and `Accept: application/json`. Money is integer PKR.

- Errors: `{ "message": "…", "errors": { "field": ["…"] } }` — 401 not signed in,
  403 missing permission, 422 validation or business rule (e.g. insufficient stock).
- "Permission" is a Spatie permission; `a | b` means either one.
- Lists that page return Laravel pagination: `{ data, current_page, last_page, total, … }`.

## Auth

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/login` | public, 10/min | `{ email, password }` → `{ token, user: { id, name, email, roles[], permissions[] } }`. Deactivated users get 403. |
| POST | `/logout` | signed in | Revokes the current token. |
| GET | `/me` | signed in | Same `user` shape as login. |
| PUT | `/me/password` | signed in, 10/min | `{ current_password, password, password_confirmation }` (min 8). Other sessions are signed out. |

## Dashboard

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | `reports:view` |

Returns `today` and `yesterday` (`revenue, transactions, average_ticket, cost, profit,
voided_count`), `trend` (30 days of `{date, revenue, profit, transactions}`), `hourly`
(24 × `{hour, revenue, transactions}`), `payments` (today, by method), `top_items`
(7 days), and `alerts` (`low_stock[]`, `expiring[]` within 7 days, `pending_voids`,
`open_drawers`, `stock_value`).

## Menu, categories, recipes

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/categories` | `categories:view` | |
| GET | `/categories/{id}` | `categories:view` | |
| POST | `/categories` | `categories:create` | `{ name }` (unique) |
| PUT | `/categories/{id}` | `categories:edit` | |
| DELETE | `/categories/{id}` | `categories:delete` | 422 if it has menu items |
| GET | `/menu?category_id=` | `menu:view` | Active items with `recipes`, `is_available` (enough stock for one), `food_cost`, `margin` (%) |
| GET | `/menu/{id}` | `menu:view` | |
| POST | `/menu` | `menu:create` | `{ category_id, name, price, description?, image? }` |
| PUT | `/menu/{id}` | `menu:edit` | any of the above + `is_active` |
| DELETE | `/menu/{id}` | `menu:delete` | Soft: sets `is_active = false` |
| GET | `/menu/{id}/recipe` | `recipes:manage` | |
| POST | `/menu/{id}/recipe` | `recipes:manage` | `{ inventory_item_id, quantity }` (quantity per one menu item) |
| PUT | `/recipes/{id}` | `recipes:manage` | `{ quantity }` |
| DELETE | `/recipes/{id}` | `recipes:manage` | |

## Inventory

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/inventory` | `inventory:view` | Active items incl. `current_stock`, `reorder_level`, `avg_cost`, `expiry_date` |
| GET | `/inventory/{id}` | `inventory:view` | With stock movements |
| POST | `/inventory` | `inventory:create` | `{ name, unit, current_stock?, reorder_level?, unit_cost?, expiry_date? }` |
| PUT | `/inventory/{id}` | `inventory:edit` | `{ name?, unit?, reorder_level?, avg_cost?, expiry_date?, is_active? }` |
| POST | `/inventory/stock-in` | `inventory:create` | `{ inventory_item_id, quantity, unit_cost? \| total_cost?, expiry_date?, reference?, note? }` — cost updates the weighted average |
| POST | `/inventory/{id}/adjust` | `inventory:edit` | `{ quantity (signed, ≠ 0), note? }`; can't go below 0 |
| POST | `/inventory/{id}/expire` | `inventory:edit` | `{ quantity, note? }` |
| GET | `/consumptions` | `consumptions:view` | `?from&to&inventory_item_id&search&per_page` (paginated) |
| POST | `/consumptions` | `consumptions:create` | `{ inventory_item_id, quantity, reason }` |

## Sales & receipts

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/sales` | `sales:create` | See below |
| GET | `/sales` | `sales:view` | `?from&to&user_id&payment_method&per_page` (paginated); includes `voided_at`, `has_pending_void` |
| GET | `/sales/{id}` | `sales:view` | |
| GET | `/sales/{id}/receipt` | `sales:view` | Print data: canteen name, date/time, cashier, items, totals, `payment_method` (label), `payment_reference`, `voided` |

```jsonc
// POST /sales
{
  "items": [{ "menu_item_id": 1, "quantity": 2 }],
  "payment_method": "cash",          // optional, default cash; must be enabled in /settings/pos
  "amount_received": 1000,           // required for cash (≥ total); ignored otherwise
  "payment_reference": "TX123"       // optional, non-cash only
}
// 201 → { id, total_amount, amount_received, change, items }
// 422 → { "message": "Insufficient stock for Burger Bun" }   (demand is summed across the cart)
```

In one transaction: locks the ingredients, checks stock for the whole cart, records the
sale with each item's food cost, decrements stock and writes `sale` stock movements.

## Voids

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/sales/{id}/void-requests` | `sales:void-request` | `{ reason }`. One pending request per sale. |
| GET | `/void-requests?status=` | `sales:void-request \| sales:void-approve` | Requesters see only their own. |
| POST | `/void-requests/{id}/approve` | `sales:void-approve` | `{ note? }` — returns exactly the stock the sale used and sets `sales.voided_at`. |
| POST | `/void-requests/{id}/reject` | `sales:void-approve` | `{ note? }` |

Anyone with `sales:void-approve` may approve, including their own request. Reviewed
requests are final. Voided sales are excluded from sales/profit reports and cash closing.

## Cash closing

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/cash-closing?date=` | `reports:view \| cash:close` | Per cashier: `sales_count, gross_amount, voided_*, expected_cash` (cash only), `non_cash[]`, `pending_voids`, `closing`, `changed_since_close`; plus `totals` |
| POST | `/cash-closing` | `cash:close` | `{ date, user_id, counted_cash, opening_float?, note? }` → `variance = counted − float − expected_cash`. One per cashier per day, final; refused while that cashier has pending voids; no future dates. |

## Reports

All `reports:view`. Sales reports accept `user_id`, `payment_method` and (sales/items) `category_id`.

| Path | Params | Returns |
|---|---|---|
| `/reports/daily` | `date` | `total_sales, total_transactions, items_sold, voided_count, voided_amount, total_cost, gross_profit, uncosted_quantity, payments[], items[]` |
| `/reports/receipts` | `date, status=valid\|voided` | receipts with items, cashier, payment label/reference, `is_voided` |
| `/reports/items` | `from, to` | per item: quantity, revenue, cost, profit, margin |
| `/reports/stock` | | current stock |
| `/reports/stock-summary` | `from, to` | per item: opening, additions, sold, manual, expired, adjustments, void returns, closing, `avg_cost`, `closing_value` |
| `/reports/ledger` | `inventory_item_id, from, to` | opening, closing and each movement with running balance |
| `/reports/waste` | `from, to` | expiry write-offs and manual consumption, with value |
| `/reports/cashiers` | | users who have made sales (for filters) |

## Staff & permissions

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/employees` | `employees:view` | Users with roles |
| POST | `/employees` | `employees:edit` | `{ name, email, password (min 8), roles: [...] }` |
| PUT | `/employees/{id}` | `employees:edit` | `{ name?, is_active? }` — deactivating signs them out; not for your own account |
| PUT | `/employees/{id}/password` | `employees:edit` | `{ password }` — signs them out everywhere |
| POST | `/employees/{id}/role` | `employees:edit` | `{ roles: [...] }` (legacy `{ role }` accepted) |
| GET | `/permissions` | `employees:edit` | Roles with permissions + all permissions |
| PUT | `/permissions/{role}` | `employees:edit` | `{ permissions: [...] }`; super-admin can't be edited |

Only a super-admin can grant `super-admin` or modify a super-admin account.

## Settings & activity

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/settings/receipt` | signed in | `canteen_name, branch_name, show_branch, header_lines, footer_text, show_cashier, show_payment, paper_width (58\|80), text_size (large\|compact), tear_feed_lines` |
| PUT | `/settings/receipt` | `settings:manage` | same fields |
| GET | `/settings/pos` | signed in | `payment_methods` (enabled) + `available_payment_methods` |
| PUT | `/settings/pos` | `settings:manage` | `{ payment_methods: [...] }` (at least one) |
| GET | `/activity` | `activity:view` | `?user_id&action&from&to&search&per_page` (paginated); `action=menu` matches `menu.*` |
| GET | `/activity/actions` | `activity:view` | distinct action names |

## Permissions

`pos:use` · `categories:view|create|edit|delete` · `menu:view|create|edit|delete` ·
`recipes:manage` · `inventory:view|create|edit` · `sales:create|view|void-request|void-approve` ·
`consumptions:create|view` · `reports:view` · `cash:close` · `employees:view|edit` ·
`settings:manage` · `activity:view`

Default role assignments are in [README.md](README.md#roles-defaults--editable-on-the-permissions-page).
New permissions reach existing roles through a migration (see [CONVENTIONS.md](CONVENTIONS.md#permissions)).
