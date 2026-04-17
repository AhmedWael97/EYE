#!/usr/bin/env bash
# =============================================================================
#  EYE Analytics — Deploy / Update Script
#  Run on the VPS after pushing new code to git:
#    cd /opt/eye && bash deploy.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[DEPLOY]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}     $*"; }

cd /opt/eye

info "Pulling latest code..."
git pull --ff-only

info "Rebuilding images..."
docker compose build --no-cache php-fpm node

info "Migrating database..."
docker compose exec -T php-fpm php artisan migrate --force

info "Clearing caches..."
docker compose exec -T php-fpm php artisan optimize:clear
docker compose exec -T php-fpm php artisan config:cache
docker compose exec -T php-fpm php artisan route:cache
docker compose exec -T php-fpm php artisan view:cache

info "Restarting services..."
docker compose up -d --remove-orphans

info "Restarting queue worker..."
docker compose restart laravel-queue laravel-horizon

success "Deployment complete — $(date)"
