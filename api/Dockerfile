FROM composer:2 AS build
WORKDIR /app
COPY composer.* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts
COPY . .

FROM dunglas/frankenphp:1-php8.4
WORKDIR /app
COPY --from=build /app /app
RUN install-php-extensions pcntl pdo_mysql mbstring bcmath gd zip
RUN chown -R www-data:www-data storage bootstrap/cache
EXPOSE 80
CMD ["php", "artisan", "octane:frankenphp", "--host=0.0.0.0", "--port=80"]
