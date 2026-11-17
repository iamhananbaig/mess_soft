# Conventions

How code is written in this project. Match what's here; when in doubt, copy the
nearest existing example.

## Backend (Laravel, `api/`)

**Controllers** live in `app/Http/Controllers/Api/`, validate inline with
`$request->validate([...])`, and return `response()->json(...)`. Business-rule failures
return `422` with `{ "message": "…" }` — never a 500.

**Anything that changes stock or money runs in a transaction and locks rows:**

```php
return DB::transaction(function () use ($validated) {
    $item = InventoryItem::lockForUpdate()->findOrFail($validated['inventory_item_id']);
    // check, change, then write a StockMovement for every stock change
});
```

Closures need every outer variable in `use (...)` — forgetting one is the most common
bug here (tests catch it as a 500).

**Stock:** every change to `current_stock` writes a `stock_movements` row with
`type`, `source`, signed `quantity` and `unit_cost`. Reports and void reversal depend on it.

**Money** is integer PKR. Quantities and costs are decimals; cast with `(float)` /
`(int)` before arithmetic or JSON — MySQL returns `SUM()` as a string.

**Audit:** sensitive changes call `Activity::log($action, $description, $subject, $changes)`
(`App\Support\Activity`). For updates, record only what changed:

```php
$before = $menu->only(array_keys($validated));
$menu->update($validated);
Activity::log('menu.updated', "Updated menu item {$menu->name}", $menu,
    Activity::diff($before, $menu->only(array_keys($validated))));
```

**History is never deleted.** Menu items are deactivated (`is_active = false`); history
tables use `RESTRICT` foreign keys.

### Migrations

- Always reversible (`down()` undoes `up()`); test `migrate` → `migrate:rollback` → `migrate` on **MySQL**, not just SQLite.
- Production data exists: add columns with defaults or `nullable`, backfill in the same
  migration when needed, never rewrite history.
- They run automatically when the `api` container starts — only that container migrates.

### Permissions

1. Add the name to `RolesAndPermissionSeeder` (list + role defaults) — this covers fresh installs.
2. Add a migration that `Permission::findOrCreate()`s it and grants it to existing roles —
   the seeder never changes roles that already exist (so admins' edits on the Permissions page survive).
3. Protect the route with `->middleware('permission:x')`, and add the page to
   `frontend/src/lib/navigation.ts` with the same permission.

### Tests

Feature tests in `api/tests/Feature/` (SQLite in-memory). `TestCase` seeds roles and
signs in an admin (`$this->authHeaders()`). When a test acts as several users, reset
the auth guard between them:

```php
$this->app['auth']->forgetGuards();   // the guard caches the first user
```

Run `php artisan test` and `vendor/bin/pint` before committing.

## Frontend (React, `frontend/`)

- **Pages** in `src/pages/`, lazy-loaded in `App.tsx` and wrapped in `<RequirePermission path=…>`.
  Register each page once in `src/lib/navigation.ts` (sidebar, phone tab bar and guard all read it).
- **API** via `src/services/api.ts` (Axios, bearer token, 401 → login). Show errors with
  `showErrorToast(err, 'Fallback text')` — it surfaces the server's message.
- **UI**: shadcn/ui (base-mira style, **Phosphor** icons — not lucide), Tailwind 4, `cn()` for classes.
- **Phones first** — cashiers use phones. Lists render as cards on small screens
  (`md:hidden`) and tables from `md:` up; tap targets ≥ 36 px; filters as horizontally
  scrolling chips (`no-scrollbar`); page padding `p-3 sm:p-6`.
- **Money** with `formatPKR()`; dates with `formatDate()` / `formatDateTime()` (`src/lib/format.ts`).
- **Exports**: build an `ExportDocument` and pass it to `<ExportMenu build={…} />`; the
  Excel/PDF libraries load only when used.
- **Charts** (Recharts) use the validated colour tokens `--series-revenue` / `--series-profit`
  from `index.css`; one y-axis per chart.
- Lint with `npm run lint` (oxlint) and type-check with `npm run build`.

## Receipt printing

- `src/lib/escpos.ts` turns receipt data + settings into ESC/POS bytes;
  `src/lib/escposPreview.ts` reads the same bytes back for on-screen previews, so the
  preview is what prints. Change layout only in the encoder.
- Never truncate text on a receipt: use `twoColumns()` (moves the right part to its own
  line when it doesn't fit).
- `src/services/printer.ts` owns the USB/Bluetooth connection (auto-reconnect) and
  never retries a failed print on its own (to avoid duplicate slips).

## Naming

| Thing | Style | Example |
|---|---|---|
| Tables / columns | snake_case, plural tables | `stock_movements.unit_cost` |
| Permissions | `area:action` | `sales:void-approve` |
| Activity actions | `area.verb` | `stock.adjusted` |
| API paths | kebab-case | `/cash-closing`, `/void-requests` |
| React components / pages | PascalCase | `CashClosingPage.tsx` |
| Hooks | `useX` in `src/hooks/` | `useReceiptSettings` |

## Git

Branch from `master`, small focused commits with a why in the body, run tests + lint +
build before pushing.
