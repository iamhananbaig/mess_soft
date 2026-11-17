#!/bin/sh
set -e

# Wait for MySQL (native on the host, reached via its unix socket or TCP), up to ~90s
echo "Waiting for MySQL..."
i=0
until php -r '
    $dsn = getenv("DB_SOCKET")
        ? "mysql:unix_socket=" . getenv("DB_SOCKET")
        : "mysql:host=" . getenv("DB_HOST") . ";port=" . (getenv("DB_PORT") ?: 3306);
    try { new PDO($dsn . ";dbname=" . getenv("DB_DATABASE"), getenv("DB_USERNAME"), getenv("DB_PASSWORD")); }
    catch (Throwable $e) { fwrite(STDERR, "MySQL not ready: " . $e->getMessage() . "\n"); exit(1); }'; do
    i=$((i+1))
    if [ "$i" -ge 30 ]; then
        echo "MySQL not reachable (socket: ${DB_SOCKET:-none}, host: ${DB_HOST:-none}). Check MYSQL_SOCKET_DIR/DB_SOCKET and the DB user." >&2
        exit 1
    fi
    sleep 3
done
echo "MySQL is ready."

# Set RUN_MIGRATIONS=false to start without migrating (back up the database before deploys that migrate).
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
