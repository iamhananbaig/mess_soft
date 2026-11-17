# Canteen POS & Inventory

Point-of-sale and stock control for a staff canteen. Cashiers sell from a phone or
PC, ingredients are deducted by recipe, receipts print on an 80 mm thermal printer,
and managers get costs, profit, cash closing, voids and an audit trail.

## Features

| Area | What it does |
|---|---|
| **POS** | Phone-first item grid, cart, cash (quick amounts + change) or card / JazzCash / Easypaisa / bank transfer with reference. Stock checked against recipes before every sale. |
| **Receipts** | ESC/POS over USB or Bluetooth (Chrome/Edge, HTTPS). Customer + Accounts copy, tear-off or auto-cut, reprints marked DUPLICATE, voided sales marked VOID. Layout editable in Settings with an exact preview. |
| **Recipes & stock** | Menu items consume inventory by recipe (burger = bun + fillet). Stock-in with cost, expiry and bill no.; adjustments, expiry write-offs, manual consumption (staff meals, damage). |
| **Costs & profit** | Weighted-average ingredient cost; food cost and margin per menu item; each sale snapshots its cost so profit history doesn't change when prices do. |
| **Alerts** | Per-item reorder level (low stock), expiring within 7 days, out of stock. |
| **Voids** | Cashier requests a void with a reason → manager approves (stock returned, sale excluded from takings) or rejects. |
| **Cash closing** | Per cashier per day: opening float, cash sales, card/wallet takings, counted cash → shortage/excess, printable closing slip with signature lines. |
| **Dashboard** | Today vs yesterday, 30-day sales & profit, sales by hour, payment mix, top items, attention list. |
| **Reports** | Sales, receipts, items & profit, stock summary (with value), stock ledger, waste — filters (date presets, cashier, payment, category) and Excel / PDF export. |
| **Staff & access** | Users with one or more roles; permissions editable per role; admins add users and reset passwords; everyone can change their own password. |
| **Activity log** | Who changed prices, recipes, stock, staff, permissions, settings, voids, closings, and sign-ins — with before → after. |

## Roles (defaults — editable on the Permissions page)

| Role | Can |
|---|---|
| **super-admin** | Everything; only a super-admin can grant super-admin or edit a super-admin |
| **admin** | Everything except managing super-admins: menu, stock, staff, settings, activity log |
| **manager** | POS, approve voids, cash closing, reports & dashboard, stock-in, edit menu |
| **cashier** | POS, request voids |
| **employee** | POS, request voids, record manual consumption |

A user can hold several roles (e.g. cashier + manager); permissions combine.

## Tech stack

| Layer | Stack |
|---|---|
| Backend | Laravel 13 (PHP 8.4, Octane/FrankenPHP in Docker), Sanctum tokens, Spatie Permission |
| Frontend | React 19, Vite 8, TypeScript, Tailwind 4, shadcn/ui (base-mira, Phosphor icons), Recharts |
| Database | MySQL 8 (native on the VM, reached via its socket); SQLite for local dev and tests |
| Printing | ESC/POS generated in the browser, sent over Web Serial (USB) or Web Bluetooth (BLE) |

## Local development

```bash
# Backend — http://localhost:8000
cd api
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed        # roles/permissions + demo data (admin@canteen.com / password)
php artisan serve

# Frontend — http://localhost:5173 (separate terminal)
cd frontend
npm install
npm run dev
```

## Production (Docker)

Two containers — `api` and `nginx` — behind Nginx Proxy Manager; the database is the
VM's native MySQL. Migrations run when the `api` container starts.

```bash
cp .env.docker .env.docker.local      # fill in; never commit it
docker compose --env-file .env.docker.local up -d --build
```

Everything else — first install, moving data from the old bundled MySQL container,
updates, nightly backups, troubleshooting — is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

> **Printing needs HTTPS** (or `localhost`) and Chrome/Edge. Phones can only print over
> Bluetooth **Low Energy**; a printer that only speaks classic Bluetooth can't be reached
> from a browser.

## Tests & checks

```bash
cd api && php artisan test          # 120 feature tests (SQLite in-memory)
cd frontend && npm run lint         # oxlint
cd frontend && npm run build        # type-check + production build
```

## Repository layout

```
api/                 Laravel API (controllers, models, migrations, seeders, tests)
frontend/            React SPA (pages, components, ESC/POS encoder + preview)
docker/              nginx image (serves the SPA, proxies /api)
deploy/backup.sh     nightly backup script for the VM
docker-compose.yml   api + nginx
```

## Documentation

| File | For |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Installing, updating, backing up and troubleshooting production |
| [API.md](API.md) | Every endpoint, its permission and payload |
| [SCHEMA.md](SCHEMA.md) | Tables, columns and foreign-key rules |
| [CONVENTIONS.md](CONVENTIONS.md) | How code is written here (backend, frontend, printing, tests) |
| [AGENTS.md](AGENTS.md) | Context for AI coding assistants |
