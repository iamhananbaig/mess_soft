# mess_soft — Canteen Management System

## Status
Early scaffold. Two separate apps with minimal custom code:
- `api/` — Laravel 13 with Sanctum + Spatie, only default User model, no custom controllers/routes yet
- `frontend/` — React 19 + Vite 8 + TypeScript 6 + TailwindCSS 4, fresh Vite template (counter demo)

Key features: recipe-based stock consumption (burger = bun + patty), manual consumption tracking, expired items, sale reports, thermal receipt printing (browser + ESC/POS).

Full implementation plan lives in `PLAN.md` — use it as the source of truth for schema, roles, permissions, and API design.

## Tech Stack (verified from composer.json / package.json)
- **Backend:** Laravel 13, PHP 8.3+, Sanctum 4, Spatie Permission 8
- **Frontend:** React 19, Vite 8, TypeScript 6, TailwindCSS 4, shadcn/ui, Axios, oxlint (NOT eslint)
- **Database:** SQLite (configured in `api/.env`, not MySQL)
- **Auth:** Laravel Sanctum tokens + Spatie roles/permissions (roles: super-admin, admin, manager, cashier, employee)

## Project Layout
```
mess_soft/
├── api/                 # Laravel app (run from here)
│   ├── app/
│   │   ├── Http/Controllers/
│   │   └── Models/      # Only User.php exists
│   ├── database/
│   │   ├── migrations/  # Default + Sanctum + Spatie permission tables
│   │   └── seeders/     # Only DatabaseSeeder (creates one test user)
│   ├── routes/api.php   # Only /api/user (Sanctum stub)
│   └── .env             # DB_CONNECTION=sqlite
├── frontend/            # Standalone Vite app (NOT inside resources/)
│   ├── src/
│   │   ├── App.tsx      # Counter demo page
│   │   └── main.tsx
│   └── vite.config.ts   # react() + tailwindcss() plugins
├── PLAN.md              # Full implementation plan, schema, roles, API design
└── .agents/skills/      # Agent skill files
```

## Dev Commands
```bash
# Setup (from api/)
composer install
cp .env.example .env    # already configured for SQLite
php artisan key:generate
php artisan migrate --seed

# Run everything (from api/ — single command)
composer dev             # runs: artisan serve + queue:listen + pail + npm run dev

# Or run separately:
cd api && php artisan serve          # backend at :8000
cd frontend && npm run dev           # frontend at :5173

# Testing
cd api && php artisan test          # PHPUnit, uses SQLite in-memory

# Linting
cd frontend && npm run lint         # oxlint (no eslint)

# Build
cd frontend && npm run build        # tsc -b && vite build

# Reset DB
cd api && php artisan migrate:fresh --seed
```

## Key Architecture Notes
- Frontend is a **separate Vite app** in `frontend/`, not in Laravel's `resources/`
- Frontend uses **Axios** for HTTP requests
- `composer dev` is the intended dev command (concurrently runs server, queue, logs, vite)
- User model already has `HasApiTokens` + `HasRoles` traits — use these, don't re-add
- Tests use SQLite in-memory (`phpunit.xml` sets `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`)
- oxlint config is at `frontend/.oxlintrc.json` — React hooks rules + export warnings enabled

## Docs
- **PLAN.md** — full implementation plan (source of truth for schema, roles, API design)
- **SCHEMA.md** — DB quick reference (tables, columns, types, constraints)
- **API.md** — API quick reference (endpoints, permissions, request/response)
- **PHASES.md** — step-by-phase build checklist (files, commands, patterns)
- **CONVENTIONS.md** — code style + templates (Laravel + React + shadcn/ui)

## What Exists vs What's Planned
- **Exists:** Laravel scaffold, User model, Sanctum/Spatie installed, default migrations, fresh React template
- **Not built yet:** Custom models (Category, MenuItem, InventoryItem, Recipe, Sale, SaleItem, StockMovement, ManualConsumption), controllers, routes, seeders, frontend pages, API endpoints
- See `PLAN.md` for full schema definitions, role/permission matrix, and API endpoint table

## Conventions (from PLAN.md — follow when building)
- All monetary values in **PKR** (integer)
- Receipts show prices as `Rs.XXX`
- API endpoints under `/api/v1/` with Sanctum auth
- Use `api` guard for Sanctum token auth
- Migrations must be reversible
- Error responses: `{ "message": "...", "errors": {...} }`
- All dates/times stored in **UTC**, displayed in **GMT+5** (Pakistan)
- Soft deletes on menu items (`is_active = false`, never hard delete)
- Use `lockForUpdate()` in DB transactions for stock validation
- Recipe system: menu items link to inventory items via `recipes` table (quantity per ingredient)
- Stock validation checks all recipe ingredients before allowing a sale
