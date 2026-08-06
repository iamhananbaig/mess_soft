# Canteen Management System

POS + inventory management system for canteens and small food operations. Recipe-based stock consumption, role-based access, thermal receipt printing.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Laravel 13, PHP 8.4, Sanctum 4, Spatie Permission 8 |
| Frontend | React 19, Vite 8, TypeScript, TailwindCSS 4, shadcn/ui (base-mira, phosphor icons) |
| Database | SQLite (local dev), MySQL 8.4 (Docker/production) |
| Auth | Laravel Sanctum tokens + Spatie roles/permissions |

## Quick Start — Local Dev

```bash
# Backend
cd api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed     # seeds roles/permissions + demo data
composer dev                   # starts artisan serve + queue + vite

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                    # Vite dev server at :5173
```

Backend runs at `http://localhost:8000`, frontend at `http://localhost:5173`.

## Quick Start — Docker

```bash
cp .env.docker .env.docker.local
# Edit .env.docker.local with your values (APP_KEY, DB credentials, etc.)

docker compose --env-file .env.docker.local up -d --build
```

This starts 5 containers: `api`, `queue`, `scheduler`, `db` (MySQL), `nginx` (port 9090).

Migrations and role seeding run automatically via the entrypoint. The app is available at `http://localhost:9090`.

### Create Super Admin

```bash
docker compose exec api php artisan tinker
```

```php
App\Models\User::create([
    'name' => 'Admin',
    'email' => 'admin@example.com',
    'password' => bcrypt('password'),
    'is_active' => true,
])->assignRole('super-admin');
exit;
```

## Production Deploy

```bash
docker compose --env-file .env.docker.local up -d --build
docker compose exec api php artisan migrate --force
docker compose exec api php artisan config:cache
docker compose exec api php artisan route:cache
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full Docker and manual deployment instructions, backups, and troubleshooting.

## Project Structure

```
mess_soft/
├── api/                     # Laravel backend
│   ├── app/
│   │   ├── Http/Controllers/Api/   # 10 controllers
│   │   ├── Models/                 # 9 models
│   │   └── Services/
│   ├── database/
│   │   ├── migrations/     # 18 migrations
│   │   └── seeders/        # RolesAndPermissionSeeder + DemoDataSeeder
│   ├── routes/api.php      # /api/v1 routes with permission middleware
│   └── tests/              # 60 tests (SQLite in-memory)
├── frontend/                # Standalone Vite app
│   ├── src/
│   │   ├── pages/          # 9 pages (Login, POS, Menu, Inventory, Reports, etc.)
│   │   ├── components/     # 14 shared components + 60+ shadcn/ui
│   │   ├── contexts/       # AuthContext, ThemeContext
│   │   ├── services/       # api.ts (Axios + interceptors)
│   │   └── lib/            # utils, format, toast
│   └── dist/               # Production build output
├── docker/                  # Docker configs (nginx, php-fpm)
├── docker-compose.yml
└── docs/                    # PLAN.md, SCHEMA.md, API.md, etc.
```

## Key Features

- **POS** — Add items to cart, validate stock via recipes, process sales, print thermal receipts
- **Recipe System** — Menu items linked to inventory items (e.g., burger = bun + patty); stock auto-deducted on sale
- **Inventory Management** — Track stock levels, record purchases, manual consumption, expired items
- **Role-Based Access** — 5 roles (super-admin, admin, manager, cashier, employee) with granular permissions
- **Category Management** — Create/edit/delete menu categories
- **Reports** — Daily/weekly/monthly sales, low stock alerts, top selling items
- **Receipt Printing** — Browser print + ESC/POS thermal printer support

## API Overview

All endpoints under `/api/v1` with Sanctum bearer token auth.

| Resource | Endpoints | Permissions |
|----------|-----------|-------------|
| Auth | `POST /login`, `POST /logout`, `GET /me` | public, auth, auth |
| Categories | CRUD `/categories` | `categories:*` |
| Menu Items | CRUD `/menu` | `menu:*` |
| Inventory | CRUD `/inventory` | `inventory:*` |
| Sales | `POST /sales`, `GET /sales` | `sales:create`, `sales:view` |
| Consumption | CRUD `/consumption` | `consumption:*` |
| Reports | `/reports/dashboard`, `/reports/sales` | `reports:view` |
| Employees | CRUD `/employees` | `employees:*` |
| Permissions | `/permissions`, `/roles` | `permissions:manage` |

See [API.md](API.md) for full request/response examples.

## Testing & Linting

```bash
# Backend tests (60 tests, SQLite in-memory)
cd api && php artisan test

# Frontend lint (oxlint)
cd frontend && npm run lint

# Frontend build
cd frontend && npm run build   # tsc -b && vite build
```

## Common Commands

```bash
# Docker
docker compose logs -f                         # tail all logs
docker compose exec api php artisan <cmd>      # run artisan
docker compose restart api                     # restart API
docker compose up -d --build api               # rebuild API only
docker compose down -v                         # stop + remove volumes

# Database reset
cd api && php artisan migrate:fresh --seed
```

## Documentation

| File | Description |
|------|-------------|
| [PLAN.md](PLAN.md) | Full implementation plan (schema, roles, API design) |
| [SCHEMA.md](SCHEMA.md) | Database quick reference |
| [API.md](API.md) | API quick reference |
| [PHASES.md](PHASES.md) | Build checklist |
| [CONVENTIONS.md](CONVENTIONS.md) | Code style + templates |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide |
| [AGENTS.md](AGENTS.md) | AI agent context file |
