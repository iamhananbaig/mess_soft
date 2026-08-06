#!/bin/sh
set -e

echo "Running database migrations..."
php artisan migrate --force

echo "Seeding roles and permissions..."
php artisan db:seed --class=RolesAndPermissionSeeder --force 2>/dev/null || true

echo "Caching configuration..."
php artisan config:cache 2>/dev/null || true
php artisan route:cache 2>/dev/null || true
php artisan view:cache 2>/dev/null || true

exec "$@"
