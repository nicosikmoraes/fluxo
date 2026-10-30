#!/bin/sh
set -eu

cd "$(dirname "$0")"

composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
npm --prefix ../ui ci --no-audit --no-fund
npm --prefix ../ui run build
php artisan optimize --no-interaction
