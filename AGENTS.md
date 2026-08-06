# mess_soft — Canteen Management System

## Status
Fully built POS + inventory app. Two separate apps with custom code throughout:
- `api/` — Laravel 13 backend: 9 models, 10 API controllers, full route tree, seeders
- `frontend/` — React 19 SPA: 9 pages, 60+ shadcn/ui components, auth flow, lazy-loaded routes

Key features: recipe-based stock consumption (burger = bun + patty), manual consumption tracking, expired items, sale reports, thermal receipt printing (browser + ESC/POS).

## Tech Stack
- **Backend:** Laravel 13, PHP 8.3+, Sanctum 4, Spatie Permission 8
- **Frontend:** React 19, Vite 8, TypeScript 6, TailwindCSS 4, shadcn/ui (base-mira style, phosphor icons), Axios, oxlint
- **Database:** SQLite for local dev (`api/.env`: `DB_CONNECTION=sqlite`); MySQL 8.4 in Docker (`.env.docker.local`)
- **Auth:** Laravel Sanctum tokens + Spatie roles/permissions (roles: super-admin, admin, manager, cashier, employee)

## Project Layout
```
mess_soft/
├── api/                     # Laravel app
│   ├── app/
│   │   ├── Http/Controllers/Api/   # 10 controllers (Auth, Category, MenuItem, Recipe, Inventory, Sale, ManualConsumption, Report, Employee, Permission)
│   │   ├── Models/                 # 9 models (User, Category, MenuItem, InventoryItem, Recipe, Sale, SaleItem, StockMovement, ManualConsumption)
│   │   └── Services/
│   ├── database/
│   │   ├── migrations/     # 18 migration files
│   │   └── seeders/        # DatabaseSeeder calls RolesAndPermissionSeeder + DemoDataSeeder
│   ├── routes/api.php      # Full route tree under /api/v1 with permission middleware
│   ├── phpunit.xml         # SQLite in-memory for tests
│   └── .env                # DB_CONNECTION=sqlite, SESSION_DRIVER=database
├── frontend/                # Standalone Vite app (NOT in Laravel resources/)
│   ├── src/
│   │   ├── pages/          # 9 pages (Login, POS, Menu, Inventory, Reports, Consumption, Employees, Permissions, NotFound)
│   │   ├── components/     # 14 shared components + ui/ (60+ shadcn components)
│   │   ├── contexts/       # AuthContext, ThemeContext
│   │   ├── hooks/          # use-mobile, useKeyboardShortcuts
│   │   ├── services/       # api.ts (Axios instance + interceptors)
│   │   ├── lib/            # utils, format, toast
│   │   └── App.tsx         # react-router with lazy-loaded routes + ProtectedRoute
│   ├── components.json     # shadcn config (base-mira style, phosphor icons)
│   ├── .oxlintrc.json      # react/hooks + only-export-components rules
│   └── vite.config.ts      # react() + tailwindcss() plugins, @ alias → ./src
├── PLAN.md                 # Full implementation plan (source of truth for schema, roles, API design)
├── SCHEMA.md               # DB quick reference
├── API.md                  # API quick reference
├── PHASES.md               # Build checklist
├── CONVENTIONS.md          # Code style + templates
├── DEPLOYMENT.md           # Production deployment guide (Docker + manual)
├── docker-compose.yml      # Docker stack: api + queue + nginx + MySQL
├── .env.docker             # Docker environment template
└── docker/                 # Docker configs
    ├── Dockerfile.nginx    # Multi-stage: builds frontend + serves via Nginx
    ├── nginx.conf          # Nginx config (SPA + API proxy)
    └── php-fpm.conf        # PHP-FPM pool config
```

## Dev Commands
```bash
# Setup (from api/)
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed     # Seeds roles/permissions + demo data

# Run everything (from api/ — single command)
composer dev             # concurrently: artisan serve + queue:listen + pail + npm run dev (vite for backend assets)

# Run separately:
cd api && php artisan serve          # backend at :8000
cd frontend && npm run dev           # frontend at :5173

# Testing
cd api && php artisan test          # PHPUnit, SQLite in-memory

# Linting
cd frontend && npm run lint         # oxlint (no eslint)

# Build
cd frontend && npm run build        # tsc -b && vite build

# Reset DB
cd api && php artisan migrate:fresh --seed

# Docker (production)
docker compose --env-file .env.docker.local up -d --build   # build + start all
docker compose logs -f                                      # tail logs
docker compose exec api php artisan <cmd>                   # run artisan
docker compose restart api                                  # restart API
docker compose up -d --build api                            # rebuild API only
```

## Key Architecture Notes
- Frontend is a **separate Vite app** in `frontend/`, not in Laravel's `resources/`
- Frontend uses **Axios** (`frontend/src/services/api.ts`) with Bearer token auth and 401 redirect; `VITE_API_URL` env var overrides default `http://localhost:8000/api/v1`
- `composer dev` runs from `api/` and starts backend vite (laravel-vite-plugin) — frontend at `:5173` must be started separately
- User model already has `HasApiTokens` + `HasRoles` traits — use these, don't re-add
- Tests use SQLite in-memory (`phpunit.xml` sets `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`)
- oxlint config at `frontend/.oxlintrc.json` — React hooks rules + export warnings enabled
- Frontend uses `@` path alias → `./src` (configured in both `vite.config.ts` and `tsconfig.app.json`)
- Routes in `api.php` use Spatie `permission:` middleware (e.g., `permission:menu:view`, `permission:sales:create`)
- Nav items in Layout.tsx filter by user permissions via `hasPermission()`
- All pages are lazy-loaded via `React.lazy()` with `<Suspense>` fallbacks
- shadcn/ui style is **base-mira** with **phosphor** icon library (not lucide)

## Docs
- **PLAN.md** — full implementation plan (source of truth for schema, roles, API design)
- **SCHEMA.md** — DB quick reference
- **API.md** — API quick reference
- **PHASES.md** — build checklist
- **CONVENTIONS.md** — code style + templates (Laravel + React + shadcn/ui)
- **DEPLOYMENT.md** — production deployment guide (Docker + manual)

## Conventions
- All monetary values in **PKR** (integer); receipts show `Rs.XXX`
- API endpoints under `/api/v1/` with Sanctum auth
- Sanctum auth uses bearer tokens; `Auth::attempt()` validates via the default `web` guard, `auth:sanctum` middleware resolves tokens — no `api` guard exists
- Migrations must be reversible
- Error responses: `{ "message": "...", "errors": {...} }`
- `APP_TIMEZONE=Asia/Karachi` — all timestamps stored and displayed in Pakistan time (no UTC conversion). Backend `->timezone('Asia/Karachi')` calls are no-ops. Frontend `parseLocal()` reinterprets ISO strings as local time.
- Soft deletes on menu items (`is_active = false`, never hard delete)
- Use `lockForUpdate()` in DB transactions for stock validation
- Recipe system: menu items link to inventory items via `recipes` table (quantity per ingredient)
- Stock validation checks all recipe ingredients before allowing a sale
