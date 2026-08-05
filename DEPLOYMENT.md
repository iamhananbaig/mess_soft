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

# MySQL — use 'db' as host (Docker service name)
DB_CONNECTION=mysql
DB_HOST=db
DB_PORT=3306
DB_DATABASE=mess_soft
DB_USERNAME=mess_user
DB_PASSWORD=CHANGE_THIS_TO_A_STRONG_PASSWORD

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=false

CACHE_STORE=database
QUEUE_CONNECTION=database

MAIL_MAILER=log

# MySQL root password
MYSQL_ROOT_PASSWORD=CHANGE_THIS_ROOT_PASSWORD
```

## 3. Build & Start

```bash
# Build all images and start services
docker compose --env-file .env.docker.local up -d --build

# Check status
docker compose ps
```

This starts 4 containers:

| Container | Purpose | Port |
|-----------|---------|------|
| `mess-soft-db-1` | MySQL 8.0 | 3307 (host) → 3306 (container) |
| `mess-soft-api-1` | Laravel PHP-FPM | internal (9000) |
| `mess-soft-queue-1` | Queue worker | — |
| `mess-soft-nginx-1` | Nginx (frontend + API proxy) | **9090** |

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

# Access MySQL
docker compose exec db mysql -u mess_user -p mess_soft
```

## 8. Updating the App

```bash
cd /opt/mess_soft

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Run migrations
docker compose exec api php artisan migrate --force

# Re-cache
docker compose exec api php artisan config:cache
docker compose exec api php artisan route:cache

# Restart queue worker
docker compose restart queue
```

## 9. Backups

### Database Backup

```bash
# Manual backup
docker compose exec db mysqldump -u mess_user -p'PASSWORD' mess_soft > backup_$(date +%Y%m%d).sql

# Automated daily backup (add to host crontab)
0 2 * * * docker compose -f /opt/mess_soft/docker-compose.yml exec -T db mysqldump -u mess_user -p'PASSWORD' mess_soft | gzip > /var/backups/mess-soft-$(date +\%Y\%m\%d).sql.gz
```

### Restore Backup

```bash
docker compose exec -T db mysql -u mess_user -p'PASSWORD' mess_soft < backup.sql
```

## 10. Docker Troubleshooting

| Problem | Solution |
|---------|----------|
| Container won't start | `docker compose logs <service>` to see the error |
| `SQLSTATE[HY000]` connection refused | DB container not ready. Wait for healthcheck or `docker compose restart api` |
| Port 9090 already in use | Change `APP_PORT` in `.env.docker.local` (e.g., `APP_PORT=9090`) |
| Permission errors on storage | `docker compose exec api chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache` |
| Frontend shows blank page | Rebuild: `docker compose up -d --build nginx` (rebakes frontend) |
| Queue jobs not processing | `docker compose restart queue` or check `docker compose logs queue` |
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
