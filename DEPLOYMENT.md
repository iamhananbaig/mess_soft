# Deployment

Production runs on a VM with Docker:

```
phones / PCs ──HTTPS──▶ Nginx Proxy Manager ──npm_network──▶ nginx container ──▶ api container ──socket──▶ MySQL (native on the VM)
                                                    (React build, /api proxy)    (Laravel / Octane)
```

- **2 containers:** `nginx` (serves the frontend, proxies `/api`) and `api` (Laravel on
  Octane/FrankenPHP). No database, queue or scheduler containers — the app has no
  queued jobs or scheduled tasks.
- **Database:** the VM's own MySQL. Its socket directory is mounted into `api`, so MySQL
  needs no network or grant changes — a user allowed from `localhost` works.
- **On every start** the `api` container waits for MySQL, runs pending migrations,
  re-applies role/permission defaults for new installs, and caches config/routes.

---

## First install

### 1. Prerequisites

- Docker + Docker Compose (`docker compose version`)
- MySQL 8 on the VM
- Nginx Proxy Manager on the external Docker network `npm_network`
  (`docker network create npm_network` if it doesn't exist)

### 2. Database

```sql
CREATE DATABASE mess_soft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mess_user'@'localhost' IDENTIFIED BY 'A_STRONG_PASSWORD';
GRANT ALL ON mess_soft.* TO 'mess_user'@'localhost';
```

Find the socket path: `mysql -u root -p -e "select @@socket"`.

### 3. Configure

```bash
cd /opt && git clone <repo-url> mess_soft && cd mess_soft
cp .env.docker .env.docker.local      # real secrets — never commit (it's gitignored)
```

Edit `.env.docker.local`:

| Setting | Value |
|---|---|
| `APP_KEY` | `base64:` + output of `openssl rand -base64 32` |
| `APP_URL` | the public HTTPS address |
| `MYSQL_SOCKET_DIR` | directory holding the socket **on the VM**, e.g. `/var/run/mysqld` (Debian/Ubuntu) or `/var/lib/mysql` (RHEL) |
| `DB_SOCKET` | socket path **inside the container**: `/var/run/mysqld/mysqld.sock` (RHEL: `/var/run/mysqld/mysql.sock`) |
| `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | from step 2 |
| `QUEUE_CONNECTION` | `sync` |
| `RUN_MIGRATIONS` | `true` |
| `RECEIPT_CANTEEN_NAME` | optional; can also be set later in **Settings** |

### 4. Start

```bash
docker compose --env-file .env.docker.local up -d --build
docker compose logs api | tail -30     # "MySQL is ready" → migrations → Octane started
```

### 5. First super-admin

```bash
docker compose exec api php artisan tinker --execute="App\Models\User::create(['name'=>'Admin','email'=>'admin@example.com','password'=>'A_STRONG_PASSWORD','is_active'=>true])->assignRole('super-admin');"
```

Create everyone else from the **Employees** page.

### 6. Proxy & HTTPS

In Nginx Proxy Manager add a proxy host → forward to `mess-soft-nginx-1`, port `80`,
and request an SSL certificate. **HTTPS is required** for USB/Bluetooth receipt
printing in the browser.

### 7. After first sign-in

1. **Settings** — canteen name, paper width (80 mm for the Speed-X BT600M), text size; switch on the payment methods you accept.
2. **Inventory** — set each item's cost per unit and reorder level (profit and alerts depend on them).
3. Connect the printer from the print dialog after the first sale; tick **auto-cutter** only if the printer has one.

---

## Updating

```bash
cd /opt/mess_soft
mysqldump --single-transaction -u root -p mess_soft | gzip > ~/mess_soft_before_update_$(date +%F_%H%M).sql.gz
git pull
docker compose --env-file .env.docker.local up -d --build --remove-orphans
docker compose logs api | tail -30
```

Migrations run automatically on start. All migrations are reversible; to roll back
code, check out the previous commit and run the same `up` command (restore the backup
if a migration must be undone).

## One-time: moving from the bundled MySQL container

Older versions of this stack ran their own `db` container (data in the Docker volume
`mess-soft_mysql-data`). Copy the data into native MySQL **once**, outside canteen
hours. Nothing is deleted — the old volume stays as a fallback.

> `.env.docker.local` used to be committed (with real secrets). Pulling the current
> version **deletes it from the VM's checkout** — copy it aside first. Because the old
> values are in git history, use a **new** `DB_PASSWORD` and `APP_KEY` (safe to change:
> sign-ins use API tokens, which don't depend on the key).

```bash
cd /opt/mess_soft

# 1. Keep the env file safe from `git pull`
cp .env.docker.local ~/mess_soft.env.docker.local.bak

# 2. Stop sales, keep the old db container running
docker compose stop nginx api

# 3. Dump from the OLD db container
docker exec mess-soft-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
  > ~/mess_soft_from_container.sql
tail -1 ~/mess_soft_from_container.sql          # must say "-- Dump completed"

# 4. Create the database + user (First install, step 2), then import
mysql -u root -p mess_soft < ~/mess_soft_from_container.sql

# 5. Counts must match exactly
docker exec mess-soft-db-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "select count(*) from sales; select count(*) from users; select max(id) from sales" "$MYSQL_DATABASE"'
mysql -u root -p -N -e "select count(*) from sales; select count(*) from users; select max(id) from sales" mess_soft

# 6. Pull, restore + edit the env file (First install, step 3), deploy
git pull
[ -f .env.docker.local ] || cp ~/mess_soft.env.docker.local.bak .env.docker.local
docker compose --env-file .env.docker.local up -d --build --remove-orphans
docker compose logs api | tail -30
```

Then sign in, check today's sales and a reprint. `--remove-orphans` removes the old
`db`, `queue` and `scheduler` containers but **not** the volume. After a few good days:
`docker volume rm mess-soft_mysql-data`.

---

## Backups

`deploy/backup.sh` dumps the database (refusing incomplete dumps), archives the
`mess-soft_storage` volume, keeps 14 days, and can copy everything to another machine.

```bash
sudo install -m 700 deploy/backup.sh /usr/local/bin/mess_soft-backup
sudo install -m 600 deploy/backup.conf.example /etc/mess_soft-backup.conf   # set REMOTE_TARGET
sudo sh -c 'printf "[client]\nuser=root\npassword=ROOT_PASSWORD\n" > /root/.my.cnf && chmod 600 /root/.my.cnf'
sudo /usr/local/bin/mess_soft-backup         # run once by hand
sudo crontab -e                              # 15 2 * * * /usr/local/bin/mess_soft-backup >> /var/log/mess_soft-backup.log 2>&1
```

A backup on the same disk doesn't survive a dead VM — set `REMOTE_TARGET`. Test a
restore on a spare database once:

```bash
gunzip -c /var/backups/mess_soft/db/mess_soft_<stamp>.sql.gz | mysql -u root -p mess_soft_restore_test
```

## Day-to-day commands

```bash
docker compose logs -f api                         # follow API logs
docker compose ps                                  # status
docker compose restart api                         # restart
docker compose exec api php artisan <command>      # artisan
docker compose up -d --build nginx                 # rebuild frontend only
mysql -u mess_user -p mess_soft                    # database (native)
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `api` keeps logging "MySQL not ready" | Wrong `MYSQL_SOCKET_DIR` / `DB_SOCKET`, or the user isn't allowed from `localhost`. Test on the VM: `mysql -u mess_user -p -S <socket> mess_soft` |
| SELinux (RHEL) blocks the socket mount | Use TCP: `DB_SOCKET=` (empty), `DB_HOST=host.docker.internal`; MySQL `bind-address = 127.0.0.1,172.17.0.1`; user allowed from `'172.%'` |
| 502 from the proxy | `api` or `nginx` down — `docker compose ps`, then `docker compose logs api` |
| Blank page after an update | `docker compose up -d --build nginx` |
| Storage permission errors | `docker compose exec api chown -R www-data:www-data storage bootstrap/cache` |
| No USB / Bluetooth button in the print dialog | Page isn't on HTTPS, or the browser isn't Chrome/Edge |
| Printer not listed in the Bluetooth picker | It only supports classic Bluetooth (not BLE) — use USB from a PC |
| Slips come out cut off / blank in places | Bluetooth too fast for the printer — reconnect; if it persists, use USB |
| TEAR HERE line stays inside the printer | Increase "blank lines after the tear line" in **Settings** |
| Profit looks too high | Items sold before costs were entered have no cost — set cost per unit in **Inventory** |
