#!/usr/bin/env bash
# ==============================================================================
#  EYE Analytics — Production Deploy Script
#  Run on the VPS whenever you push new code to GitHub:
#    cd /opt/eye && bash deploy.sh
# ==============================================================================
set -euo pipefail

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; N='\033[0m'
info()    { echo -e "${C}[➜]${N} $*"; }
success() { echo -e "${G}[✓]${N} $*"; }
warn()    { echo -e "${Y}[!]${N} $*"; }

# Always use the production compose file — never the dev one.
# The dev compose mounts ./frontend:/app which overwrites the built standalone
# output and causes "Cannot find module /app/server.js" crashes.
COMPOSE="docker compose -f docker-compose.prod.yml"

cd /opt/eye

info "Pulling latest code from GitHub..."
git pull --ff-only
git submodule update --init --recursive

info "Rebuilding PHP and Node images..."
$COMPOSE build --no-cache php-fpm node

info "Running database migrations..."
$COMPOSE exec -T php-fpm php artisan migrate --force

info "Clearing Laravel caches..."
$COMPOSE exec -T php-fpm php artisan optimize:clear

info "Rebuilding caches..."
$COMPOSE exec -T php-fpm php artisan config:cache
$COMPOSE exec -T php-fpm php artisan route:cache
$COMPOSE exec -T php-fpm php artisan view:cache

info "Starting all containers..."
$COMPOSE up -d --remove-orphans

info "Restarting queue workers..."
$COMPOSE restart laravel-horizon

info "Restarting nginx to pick up new container IPs..."
$COMPOSE restart nginx

success "Deploy complete — $(date)"
$COMPOSE ps
