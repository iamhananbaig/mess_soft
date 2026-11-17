# Production Deployment Guide

Two deployment options:
- **[Docker (Recommended)](#option-a-docker-deployment)** — isolated containers, easy to manage alongside other services
- **[Manual](#option-b-manual-deployment)** — direct installation on the server

---

# Option A: Docker Deployment

## 1. Prerequisites

```bash
# Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect

# Verify
docker --version
docker compose version
```

## 2. Clone & Configure

```bash
cd /opt  # or wherever you keep services
git clone <your-repo-url> mess_soft
cd mess_soft
```

Create the Docker environment file:

```bash
cp .env.docker .env.docker.local
```

Edit `.env.docker.local` with your values:

```env
APP_NAME="Canteen Management"
APP_ENV=production
APP_DEBUG=false
APP_URL=http://YOUR_SERVER_IP:9090

APP_TIMEZONE=Asia/Karachi

LOG_CHANNEL=daily
LOG_LEVEL=warning

# Native MySQL on the VM, reached through its unix socket (mounted into the api container).
# Find the socket:  mysql -u root -p -e "select @@socket"
DB_CONNECTION=mysql
MYSQL_SOCKET_DIR=/var/run/mysqld              # directory holding mysqld.sock ON THE VM
DB_SOCKET=/var/run/mysqld/mysqld.sock         # path INSIDE the container
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=mess_soft
DB_USERNAME=mess_user                         # must be allowed from 'localhost'
DB_PASSWORD=CHANGE_THIS_TO_A_STRONG_PASSWORD
RUN_MIGRATIONS=true                           # migrate on container start (back up first!)

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=false

CACHE_STORE=database
QUEUE_CONNECTION=sync          # no queue worker runs

MAIL_MAILER=log
```

Create the database and user in the VM's MySQL (once):

```sql
CREATE DATABASE mess_soft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mess_user'@'localhost' IDENTIFIED BY 'CHANGE_THIS_TO_A_STRONG_PASSWORD';
GRANT ALL ON mess_soft.* TO 'mess_user'@'localhost';
```

## Moving prod from the bundled MySQL container to native MySQL (one-time)

Older versions of this stack ran their own `db` (MySQL) container, with the data in the
Docker volume `mess-soft_mysql-data`. The stack now uses the VM's native MySQL, so the data
must be copied across **once**. Do this outside canteen hours. Nothing is deleted: the old
container and volume stay until you remove them yourself.

```bash
cd /opt/mess_soft                      # wherever the repo lives on the VM

# 0. Stop new sales while copying (keeps the old db container running)
docker compose stop nginx api

# 1. Dump from the OLD db container (still running from the previous compose file)
docker exec mess-soft-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
  > ~/mess_soft_from_container_$(date +%F_%H%M).sql
tail -1 ~/mess_soft_from_container_*.sql        # must say "-- Dump completed"

# 2. Create the database + user in native MySQL (see the SQL above), then import
mysql -u root -p mess_soft < ~/mess_soft_from_container_<timestamp>.sql

# 3. Spot-check counts match (run both; numbers must be identical)
docker exec mess-soft-db-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "select count(*) from sales; select count(*) from users; select max(id) from sales" "$MYSQL_DATABASE"'
mysql -u root -p -N -e "select count(*) from sales; select count(*) from users; select max(id) from sales" mess_soft

# 4. Update .env.docker.local: MYSQL_SOCKET_DIR, DB_SOCKET, DB_HOST=localhost, DB_PASSWORD,
#    QUEUE_CONNECTION=sync, RUN_MIGRATIONS=true (see section 2). Then deploy the new stack:
git pull
docker compose --env-file .env.docker.local up -d --build --remove-orphans
docker compose logs api | tail -30     # "MySQL is ready", migrations, then Octane started

# 5. Log in, check today's sales and a reprint. Once happy (keep it a few days first):
#    docker rm mess-soft-db-1   # the volume mess-soft_mysql-data still holds the old copy
```

`--remove-orphans` stops and removes the old `db`, `queue` and `scheduler` containers — but
**not** the `mess-soft_mysql-data` volume, so the old data stays as a fallback.
To roll back: check out the previous commit and `docker compose up -d --build`.

## 3. Build & Start

```bash
# Build all images and start services
docker compose --env-file .env.docker.local up -d --build

# Check status
docker compose ps
```

This starts 2 containers (the database is the VM's native MySQL):

| Container | Purpose | Port |
|-----------|---------|------|
| `mess-soft-api-1` | Laravel on Octane/FrankenPHP; runs migrations on start | internal (80) |
| `mess-soft-nginx-1` | Nginx (frontend + API proxy), reached by Nginx Proxy Manager over `npm_network` | internal (80) |

There is no queue worker or scheduler: the app has no queued jobs or scheduled tasks.

## 4. Initialize Database

```bash
# Run migrations
docker compose exec api php artisan migrate --force

# Seed roles + permissions + demo data
docker compose exec api php artisan db:seed --force

# Generate app key (if not set in .env.docker)
docker compose exec api php artisan key:generate

# Cache config
docker compose exec api php artisan config:cache
docker compose exec api php artisan route:cache
```

## 5. Create Super Admin

```bash
docker compose exec api php artisan tinker
```

```php
App\Models\User::create([
    'name' => 'Admin',
    'email' => 'admin@yoursite.com',
    'password' => bcrypt('YOUR_STRONG_PASSWORD'),
    'is_active' => true,
])->assignRole('super-admin');
exit;
```

## 6. Verify

```bash
# Health check
curl http://YOUR_SERVER_IP:9090/up
# → {"status":"ok"}

# API test
curl http://YOUR_SERVER_IP:9090/api/v1/login
# → {"message":"Validation failed",...}

# Frontend
curl -s http://YOUR_SERVER_IP:9090/ | head -5
# → HTML with <div id="root">
```

Open `http://YOUR_SERVER_IP:9090` in a browser.

## 7. Common Docker Commands

```bash
# View logs (all services)
docker compose logs -f

# View logs (single service)
docker compose logs -f api
docker compose logs -f nginx

# Restart a service
docker compose restart api

# Rebuild after code changes
docker compose up -d --build api

# Rebuild everything
docker compose up -d --build

# Stop all services
docker compose down

# Stop + remove volumes (fresh start)
docker compose down -v

# Run artisan commands
docker compose exec api php artisan <command>

# Access the API container shell
docker compose exec api bash

# Access MySQL (native on the VM)
mysql -u mess_user -p mess_soft
```

## 8. Updating the App

```bash
cd /opt/mess_soft

# Pull latest code
git pull origin main

# Back up first — the api container runs pending migrations when it starts
mysqldump --single-transaction -u root -p mess_soft | gzip > ~/mess_soft_before_update_$(date +%F_%H%M).sql.gz

# Rebuild and restart (migrations + config/route cache run automatically)
docker compose --env-file .env.docker.local up -d --build --remove-orphans
docker compose logs api | tail -30
```

## 9. Backups

### Database Backup

```bash
# Manual backup (native MySQL on the VM)
mysqldump --single-transaction -u root -p mess_soft | gzip > backup_$(date +%Y%m%d).sql.gz

# Automated daily backup (host crontab; put credentials in ~/.my.cnf, not on the command line)
0 2 * * * mysqldump --single-transaction mess_soft | gzip > /var/backups/mess-soft-$(date +\%Y\%m\%d).sql.gz
```

### Restore Backup

```bash
gunzip -c backup.sql.gz | mysql -u root -p mess_soft
```

## 10. Docker Troubleshooting

| Problem | Solution |
|---------|----------|
| Container won't start | `docker compose logs <service>` to see the error |
| api keeps logging "MySQL not ready" | Wrong `MYSQL_SOCKET_DIR`/`DB_SOCKET`, or the user isn't allowed from `localhost`. Test on the VM: `mysql -u mess_user -p -S <socket> mess_soft` |
| SELinux (RHEL family) blocks the socket mount | Use TCP: `DB_SOCKET=` (empty), `DB_HOST=host.docker.internal`, MySQL `bind-address = 127.0.0.1,172.17.0.1`, user allowed from `'172.%'` |
| Port 9090 already in use | Change `APP_PORT` in `.env.docker.local` (e.g., `APP_PORT=9090`) |
| Permission errors on storage | `docker compose exec api chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache` |
| Frontend shows blank page | Rebuild: `docker compose up -d --build nginx` (rebakes frontend) |
| Nginx 502 Bad Gateway | API container down: `docker compose up -d api` |

---

# Option B: Manual Deployment

## 1. Server Prerequisites

```bash
sudo apt update
sudo apt install -y php8.3 php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml \
  php8.3-curl php8.3-bcmath php8.3-tokenizer php8.3-fileinfo php8.3-zip

sudo apt install -y mysql-server

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

sudo apt install -y supervisor
```

## 2. Database Setup

```bash
sudo mysql -u root
```

```sql
CREATE DATABASE mess_soft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mess_user'@'127.0.0.1' IDENTIFIED BY 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON mess_soft.* TO 'mess_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Backend

```bash
cd /var/www
git clone <your-repo-url> mess_soft
cd mess_soft/api

composer install --no-dev --optimize-autoloader
cp .env.example .env
```

Edit `.env`:

```env
APP_NAME="Canteen Management"
APP_ENV=production
APP_DEBUG=false
APP_URL=http://YOUR_SERVER_IP

APP_TIMEZONE=Asia/Karachi

LOG_CHANNEL=daily
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=mess_soft
DB_USERNAME=mess_user
DB_PASSWORD=YOUR_SECURE_PASSWORD

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=false

CACHE_STORE=database
QUEUE_CONNECTION=database
```

```bash
php artisan key:generate
php artisan migrate --force
php artisan db:seed --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan storage:link

sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache
```

## 4. Nginx

```bash
sudo nano /etc/nginx/sites-available/mess-soft
```

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    root /var/www/mess_soft/frontend/dist;
    index index.html;

    location /api {
        alias /var/www/mess_soft/api/public;
        try_files $uri $uri/ /api/index.php?$query_string;

        location ~ \.php$ {
            fastcgi_pass unix:/run/php/php8.3-fpm.sock;
            fastcgi_param SCRIPT_FILENAME $request_filename;
            include fastcgi_params;
        }
    }

    location = /up {
        alias /var/www/mess_soft/api/public;
        try_files $uri /up/index.php?$query_string;

        location ~ \.php$ {
            fastcgi_pass unix:/run/php/php8.3-fpm.sock;
            fastcgi_param SCRIPT_FILENAME /var/www/mess_soft/api/public/index.php;
            include fastcgi_params;
        }
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~ /\. {
        deny all;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mess-soft /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Frontend Build

```bash
cd /var/www/mess_soft/frontend
npm ci
VITE_API_URL=http://YOUR_SERVER_IP/api/v1 npm run build
```

## 6. Supervisor — Queue Worker

```bash
sudo nano /etc/supervisor/conf.d/mess-soft-worker.conf
```

```ini
[program:mess-soft-queue]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/mess_soft/api/artisan queue:work --tries=3 --timeout=60
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=1
redirect_stderr=true
stdout_logfile=/var/www/mess_soft/api/storage/logs/queue-worker.log
stopwaitsecs=3600
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start "mess-soft-queue:*"
```

## 7. Create Super Admin

```bash
cd /var/www/mess_soft/api
php artisan tinker
```

```php
App\Models\User::create([
    'name' => 'Admin',
    'email' => 'admin@yoursite.com',
    'password' => bcrypt('YOUR_STRONG_PASSWORD'),
    'is_active' => true,
])->assignRole('super-admin');
exit;
```

## 8. Verify

```bash
curl http://YOUR_SERVER_IP/up
curl -s http://YOUR_SERVER_IP/ | head -5
```

## 9. Updating

```bash
cd /var/www/mess_soft/api
git pull origin main
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan queue:restart

cd ../frontend
git pull origin main
npm ci
VITE_API_URL=http://YOUR_SERVER_IP/api/v1 npm run build

sudo chown -R www-data:www-data /var/www/mess_soft/api/storage /var/www/mess_soft/api/bootstrap/cache
```

---

## General Troubleshooting

| Problem | Solution |
|---------|----------|
| `500 Internal Server Error` | Check `api/storage/logs/laravel.log` |
| `419 Page Expired` | Session table missing — run `php artisan migrate` |
| `SQLSTATE[HY000]` connection refused | MySQL not running or wrong credentials in `.env` |
| CORS errors | Update `api/config/cors.php` → `allowed_origins` must include your URL |
| Queue jobs not processing | `sudo supervisorctl restart mess-soft-queue:*` (manual) or `docker compose restart queue` (Docker) |
| Frontend blank page | Ensure `VITE_API_URL` was set during build |
| PHP-FPM socket not found | `sudo systemctl status php8.3-fpm` (manual) |
