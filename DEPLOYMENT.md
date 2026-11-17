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

## Updating (routine)

For normal updates after the one-time upgrade below.

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

## Upgrading the live VM to this version (one-time)

The VM still runs the **old stack** (`api`, `queue`, `scheduler`, `db` containers, data
in the Docker volume `mess-soft_mysql-data`, `.env.docker.local` tracked in git). This
version changes three things that need care — follow the steps in order.

| What changes | Why it matters |
|---|---|
| Data moves to the VM's **native MySQL** (no `db` container) | Must be copied once; the old volume stays as a fallback |
| `.env.docker.local` is **no longer in git** | `git pull` **deletes it** from the VM — save a copy first |
| 9 new migrations (voids, settings, cash closing, FK protection, costs & reorder levels, payment methods, opening float, activity log) | They run automatically on start — back up first |

**Plan ~30 minutes outside canteen hours.** Sales can't be taken between step 3 and step 9.

### Before you start

- [ ] SSH access to the VM and the MySQL **root** password
- [ ] At least one person's login that has the **super-admin** role on prod
      (admins can no longer grant super-admin — check on the Employees page)
- [ ] The site's HTTPS address in Nginx Proxy Manager (printing needs HTTPS)

### Steps

```bash
cd /opt/mess_soft                         # wherever the repo is on the VM
git log --oneline -1                      # note this commit — it's your rollback point

# 1. Save the env file (git pull would delete it)
cp .env.docker.local ~/mess_soft.env.docker.local.bak

# 2. Full backup of the current data, while everything is still running
docker exec mess-soft-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
  > ~/mess_soft_before_upgrade.sql
tail -1 ~/mess_soft_before_upgrade.sql                # must say "-- Dump completed"

# 3. Stop taking sales (the old db container keeps running)
docker compose --env-file .env.docker.local stop nginx api queue scheduler

# 4. Final dump now that nothing is writing
docker exec mess-soft-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
  > ~/mess_soft_final.sql
tail -1 ~/mess_soft_final.sql                         # "-- Dump completed"

# 5. Create the database + user in native MySQL (NEW password — the old one is in git history)
sudo mysql -e "CREATE DATABASE mess_soft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'mess_user'@'localhost' IDENTIFIED BY 'NEW_STRONG_PASSWORD';
  GRANT ALL ON mess_soft.* TO 'mess_user'@'localhost';"
sudo mysql mess_soft < ~/mess_soft_final.sql

# 6. Counts must match exactly (old container vs native)
docker exec mess-soft-db-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "select count(*) from sales; select count(*) from users; select max(id) from sales" "$MYSQL_DATABASE"'
sudo mysql -N -e "select count(*) from sales; select count(*) from users; select max(id) from sales" mess_soft
sudo mysql -N -e "select @@socket"                    # note the socket path for step 8

# 7. Get the new code; put the env file back
git pull
[ -f .env.docker.local ] || cp ~/mess_soft.env.docker.local.bak .env.docker.local
chmod 600 .env.docker.local
```

**8. Edit `.env.docker.local`** — compare with the template `.env.docker`:

| Setting | New value |
|---|---|
| `APP_KEY` | new: `base64:$(openssl rand -base64 32)` (the old one is in git history; safe to change — sign-ins use API tokens) |
| `MYSQL_SOCKET_DIR` | directory of the socket from step 6, e.g. `/var/run/mysqld` |
| `DB_SOCKET` | `/var/run/mysqld/mysqld.sock` (RHEL: `/var/run/mysqld/mysql.sock`) |
| `DB_HOST` | `localhost` (was `db`) |
| `DB_PASSWORD` | the new password from step 5 |
| `QUEUE_CONNECTION` | `sync` (was `database`) |
| `RUN_MIGRATIONS` | `true` |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | delete (only the old `db` container used them) |

```bash
# 9. Start the new stack; --remove-orphans removes the old db/queue/scheduler containers (NOT the data volume)
docker compose --env-file .env.docker.local up -d --build --remove-orphans
docker compose logs api | tail -40
#    expect: "MySQL is ready." → 9 migrations DONE → "Seeding roles and permissions" → Octane started
docker compose ps                                     # api healthy, nginx up
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR_SITE/up    # 200
```

### Check it works

- [ ] Sign in as super-admin → **Dashboard** opens; yesterday's figures look right
- [ ] **Reports → Receipts** for a recent day matches what you expect; reprint one
- [ ] **Permissions** → edit *manager*: the **Voids** and **Cash closing** groups are there
- [ ] Make one test sale on a phone, print it, then request + approve a void for it

### Every phone and PC: refresh once

Old versions told browsers they could keep the app cached, so devices may still show
the **old app** after this upgrade. Once, on every device: open the site and
**hard-refresh** (PC: `Ctrl+Shift+R`; phone: close the tab and reopen, or clear the
site's data in browser settings). Future updates appear without this.

### Set up the new features

1. **Settings** — canteen name and header lines; paper **80 mm**, text **Large**; switch on the payment methods you accept (Card, JazzCash, Easypaisa…).
2. **Inventory** — for each item: **Edit** → cost per unit and reorder level. Until then profit shows as 100% and low-stock alerts are off.
3. **Employees** — check roles; give managers the *manager* role so they can approve voids and close cash. A user can have several roles.
4. **Printer** — from a sale's print dialog: connect USB or Bluetooth; tick **auto-cutter** only if the printer cuts.
5. **Backups** — install `deploy/backup.sh` (see [Backups](#backups)). Do this today — there was no backup before.

### If something goes wrong (rollback)

The old data volume is untouched, so you can go back to exactly where you were:

```bash
docker compose --env-file .env.docker.local down
git checkout <commit noted at the start>
cp ~/mess_soft.env.docker.local.bak .env.docker.local
docker compose --env-file .env.docker.local up -d --build
```

Sales made **after** step 9 exist only in native MySQL — note them before rolling back.

### After a few good days

```bash
docker volume rm mess-soft_mysql-data          # the old copy
rm ~/mess_soft.env.docker.local.bak            # holds old secrets
# keep ~/mess_soft_before_upgrade.sql somewhere safe (off the VM), then delete it here
```

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
