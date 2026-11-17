# Database Schema

Generated from the live MySQL schema (all migrations applied). Money is **PKR in whole
rupees** (`bigint`); quantities are `decimal(10,2)`; costs per unit are `decimal(12,4)`.
Times are stored in `Asia/Karachi` (no UTC conversion).

**Foreign keys:** history tables use `RESTRICT` — deleting a user, sale, menu item or
inventory item that has history is refused, never cascaded. Only `recipes` cascade
(configuration, not history).

Framework tables (`personal_access_tokens`, `sessions`, `cache`, `jobs`, Spatie's
`roles` / `permissions` / `model_has_roles` …) are not listed.

## users
| Column | Type | Notes |
|---|---|---|
| id | bigint | |
| name, email, password | varchar | email unique; password hashed |
| is_active | bool, default 1 | deactivating revokes all tokens |

## categories
| Column | Type | Notes |
|---|---|---|
| id | bigint | |
| name | varchar | unique |

## menu_items
| Column | Type | Notes |
|---|---|---|
| id | bigint | |
| category_id | → categories | RESTRICT |
| name | varchar | |
| description | text, null | |
| price | bigint | PKR |
| image | varchar, null | |
| is_active | bool, default 1 | "delete" sets this to 0 (soft) |

## inventory_items
| Column | Type | Notes |
|---|---|---|
| id | bigint | |
| name, unit | varchar | unit e.g. pcs, kg, l |
| current_stock | decimal(10,2) | |
| reorder_level | decimal(10,2), default 0 | low-stock when stock ≤ this; 0 = no alert |
| avg_cost | decimal(12,4), default 0 | weighted-average PKR per unit |
| expiry_date | date, null | |
| is_active | bool, default 1 | |

## recipes
| Column | Type | Notes |
|---|---|---|
| menu_item_id | → menu_items | CASCADE |
| inventory_item_id | → inventory_items | CASCADE |
| quantity | decimal(10,2) | per one menu item; unique (menu_item_id, inventory_item_id) |

## sales
| Column | Type | Notes |
|---|---|---|
| id | bigint | receipt number = id zero-padded |
| user_id | → users | RESTRICT; the cashier |
| total_amount | bigint | |
| payment_method | varchar(20), default cash | cash · card · jazzcash · easypaisa · bank_transfer |
| payment_reference | varchar(100), null | transaction ID for non-cash |
| amount_received, change | bigint, null | non-cash: received = total, change = 0 |
| voided_at | timestamp, null | set when a void is approved |

## sale_items
| Column | Type | Notes |
|---|---|---|
| sale_id | → sales | RESTRICT |
| menu_item_id | → menu_items | RESTRICT |
| quantity | int | |
| unit_price | bigint | price at time of sale |
| unit_cost | decimal(12,2), null | food cost of one item at time of sale; null for sales before costing |

## stock_movements
Every change to `current_stock` writes one row.

| Column | Type | Notes |
|---|---|---|
| inventory_item_id | → inventory_items | RESTRICT |
| type | enum in · out · adjustment · expiry | |
| source | varchar | stock-in · sale · manual · adjustment · expiry · void |
| quantity | decimal(10,2) | signed: + in, − out |
| unit_cost | decimal(12,4), null | purchase cost (stock-in) or average cost at the time |
| reference | varchar, null | bill/PO no.; `VOID-<id>` for void returns |
| note | varchar, null | `Sale #<id>` for sale movements (used to reverse voids exactly) |
| user_id | → users | RESTRICT |

## manual_consumptions
| Column | Type | Notes |
|---|---|---|
| inventory_item_id | → inventory_items | RESTRICT |
| quantity | decimal(10,2) | |
| reason | varchar | |
| user_id | → users | RESTRICT |

## void_requests
| Column | Type | Notes |
|---|---|---|
| sale_id | → sales | RESTRICT |
| requested_by | → users | RESTRICT |
| reason | varchar | |
| status | enum pending · approved · rejected | one pending request per sale |
| reviewed_by | → users, null | RESTRICT |
| review_note | varchar, null | |
| reviewed_at | timestamp, null | |

## cash_closings
One row per cashier per day (`unique(date, user_id)`); figures are snapshotted at close.

| Column | Type | Notes |
|---|---|---|
| date | date | |
| user_id | → users | RESTRICT; whose drawer |
| sales_count, voided_count | int | |
| gross_amount, voided_amount | bigint | all payment methods |
| expected_cash | bigint | cash sales, non-voided |
| opening_float | bigint, default 0 | change the drawer started with |
| non_cash_amount | bigint, default 0 | card/wallet takings (not in drawer) |
| counted_cash | bigint | |
| variance | bigint | counted − float − expected; negative = short |
| note | varchar, null | |
| closed_by | → users | RESTRICT |

## settings
Key/value JSON. Keys: `receipt` (receipt layout, paper width, text size) and `pos`
(enabled payment methods). Defaults live in `App\Models\Setting`.

## activity_logs
| Column | Type | Notes |
|---|---|---|
| user_id | → users, null | SET NULL; null for failed sign-ins |
| action | varchar(60) | e.g. `menu.updated`, `void.approved`, `auth.failed` |
| subject_type, subject_id | null | e.g. `MenuItem`, 12 |
| description | varchar | human-readable |
| changes | json, null | `{field: {from, to}}` for updates |
| ip | varchar(45), null | |
| created_at | timestamp | no updated_at |
