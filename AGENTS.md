# mess_soft — Canteen POS & Inventory

Context for AI coding assistants. Read [CONVENTIONS.md](CONVENTIONS.md) before changing
code; [API.md](API.md) and [SCHEMA.md](SCHEMA.md) are the references.

## Production is live

A VM runs this with real sales data. Changes must be safe to deploy on top of it:
- Migrations: reversible, additive, backfill in the migration; verify up/down/up on **MySQL**.
- New permissions need a **migration** that grants them to existing roles (the seeder
  only seeds roles that don't exist yet).
- Say so explicitly if a change is breaking or needs a manual step on the VM.
- `.env.docker.local` holds real secrets and is gitignored — never commit it.

## Layout

```
api/                         Laravel 13 (PHP 8.4)
  app/Http/Controllers/Api/  15 controllers (Auth, Category, MenuItem, Recipe, Inventory,
                             ManualConsumption, Sale, VoidRequest, CashClosing, Report,
                             Dashboard, Employee, Permission, Setting, ActivityLog)
  app/Models/                13 models
  app/Support/               Activity (audit log), PaymentMethods
  database/migrations/       27 migrations
  database/seeders/          RolesAndPermissionSeeder (idempotent), DemoDataSeeder (skips production)
  routes/api.php             /api/v1, `permission:` middleware per route
  tests/Feature/             120 tests (SQLite in-memory)
frontend/                    React 19 + Vite 8 + TS + Tailwind 4 + shadcn/ui (base-mira, Phosphor icons)
  src/pages/                 14 pages (Dashboard, POS, Menu, Inventory, Reports, CashClosing, Voids,
                             Consumption, ReceiptDesign = Settings, Employees, Permissions, Activity, Login, NotFound)
  src/lib/navigation.ts      single list of pages → sidebar, phone tab bar, route guards
  src/lib/escpos.ts          receipt / closing-slip ESC/POS encoder
  src/lib/escposPreview.ts   reads those bytes back for previews
  src/lib/exporters.ts       Excel / PDF export (lazy-loaded)
  src/services/printer.ts    USB (Web Serial) / Bluetooth (Web Bluetooth) printer, auto-reconnect
android/                     Sunmi V2 cashier app (Kotlin, minSdk 24) — see android/README.md
docker/                      nginx image (builds the SPA, proxies /api)
deploy/backup.sh             nightly backup for the VM
docker-compose.yml           api + nginx only; MySQL is native on the VM (socket mount)
```

## Commands

```bash
cd api && php artisan test            # backend tests
cd api && vendor/bin/pint <files>     # format PHP (only files you changed)
cd frontend && npm run lint           # oxlint
cd frontend && npm run build          # tsc -b && vite build
cd api && php artisan migrate:fresh --seed   # reset local SQLite (demo admin: admin@canteen.com / password)
```

Local dev: `php artisan serve` (:8000) and `npm run dev` (:5173). Docker/prod: see DEPLOYMENT.md.

## Domain rules

- **Money** is integer PKR; receipts show `Rs.1,234`. Costs per unit are decimals.
- **Timezone** `Asia/Karachi`, stored as local time (no UTC). Frontend `parseLocal()` treats ISO strings as local.
- **Recipes:** a sale decrements every ingredient (`recipe.quantity × qty`); stock is checked for the whole cart under `lockForUpdate()` before any write.
- **Costs:** inventory keeps a weighted-average `avg_cost`; each `sale_items.unit_cost` snapshots food cost at sale time.
- **Every stock change** writes a `stock_movements` row (`source`: stock-in · sale · manual · adjustment · expiry · void).
- **Voids:** request (reason) → approve/reject by `sales:void-approve` (self-approval allowed). Approval reverses the sale's exact movements and sets `sales.voided_at`; voided sales are excluded from takings.
- **Payments:** cash · card · jazzcash · easypaisa · bank_transfer, enabled in Settings. Only cash counts toward the drawer.
- **Cash closing:** per cashier per day; `variance = counted − opening_float − cash sales`; final once saved; blocked while that cashier has pending voids.
- **History is never deleted:** menu items are deactivated; history foreign keys are `RESTRICT`.
- **Roles:** super-admin, admin, manager, cashier (= "registration staff"), employee. Users can hold several roles. Only a super-admin can grant super-admin or edit one.
- **Audit:** sensitive changes go through `Activity::log()`.

## Gotchas

- Auth: Sanctum bearer tokens; `Auth::attempt()` uses the `web` guard, routes use `auth:sanctum`. There is no `api` guard.
- Tests that act as several users must call `$this->app['auth']->forgetGuards()` between them.
- MySQL returns `SUM()` as a string — cast before returning JSON.
- Closures in `DB::transaction(...)` must `use` every outer variable.
- Only the `api` container migrates (`RUN_MIGRATIONS`); don't add services that run the entrypoint's migrate step.
- Receipt text must never be truncated — use `twoColumns()` in `escpos.ts`.
- Browser printing needs HTTPS + Chrome/Edge; phones print over Bluetooth Low Energy only.
- The canteen's printer: **Speed-X BT600M**, 80 mm, Bluetooth + USB. It is the battery/portable model (90 mm/s). Tested working: 80 mm, **compact, 66 mm print area** (58 columns); wider, or large text above 64 mm, makes it print a line and hang until power-cycled. Tear-off (no auto-cut). Never send a line that exactly fills the print area (`columnsFor()`). A bold or `ESC -` underlined line that reaches the right edge hangs it after the title; separators are bold `-`/`=` kept to `SAFE_W` (3 chars short), like the bold TOTAL line. Print darkness is a printer setting (Windows `Printer.exe` → Printing Density), not an ESC/POS command.
