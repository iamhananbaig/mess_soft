#!/bin/sh
set -e

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
until php -r "
    try {
        \$pdo = new PDO(
            'mysql:host=' . getenv('DB_HOST') . ';port=' . getenv('DB_PORT'),
            getenv('DB_USERNAME'),
            getenv('DB_PASSWORD'),
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        echo \"MySQL is ready.\n\";
        exit(0);
    } catch (PDOException \$e) {
        echo \"MySQL not ready: {\$e->getMessage()}\n\";
        exit(1);
    }
" 2>/dev/null; do
    echo "MySQL not ready, retrying in 3 seconds..."
    sleep 3
done

# Only one container may migrate. The queue and scheduler containers share this
# image and set RUN_MIGRATIONS=false; running migrations concurrently races
# (MySQL DDL is not transactional) and can apply a migration twice.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "Running database migrations..."
    php artisan migrate --force

    echo "Seeding roles and permissions..."
    php artisan db:seed --class=RolesAndPermissionSeeder --force || echo "WARNING: role/permission seeding failed"
else
    echo "Skipping migrations (RUN_MIGRATIONS=false)"
fi

echo "Caching configuration..."
php artisan config:cache 2>/dev/null || true
php artisan route:cache 2>/dev/null || true
php artisan view:cache 2>/dev/null || true

exec "$@"
