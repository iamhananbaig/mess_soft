FROM composer:2 AS build
WORKDIR /app
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts
COPY api/ .

FROM dunglas/frankenphp:1-php8.4
WORKDIR /app
COPY --from=build /app /app
RUN install-php-extensions pcntl pdo_mysql mbstring bcmath gd zip
RUN rm -f bootstrap/cache/packages.php bootstrap/cache/services.php
RUN chown -R www-data:www-data storage bootstrap/cache
COPY api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 80
CMD ["php", "artisan", "octane:frankenphp", "--host=0.0.0.0", "--port=80"]
