#!/usr/bin/env bash
# ==============================================================================
#  EYE Analytics — Code Update / Re-deploy Script
#  Run this on the VPS whenever you push new code to GitHub:
#    cd /opt/eye && bash deploy.sh
# ==============================================================================
set -euo pipefail

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; N='\033[0m'
info()    { echo -e "${C}[➜]${N} $*"; }
success() { echo -e "${G}[✓]${N} $*"; }
warn()    { echo -e "${Y}[!]${N} $*"; }

cd /opt/eye

info "Pulling latest code from GitHub..."
git pull --ff-only

info "Rebuilding PHP and Node images..."
docker compose build --no-cache php-fpm node

info "Running database migrations..."
docker compose exec -T php-fpm php artisan migrate --force

info "Clearing Laravel caches..."
docker compose exec -T php-fpm php artisan optimize:clear

info "Rebuilding caches..."
docker compose exec -T php-fpm php artisan config:cache
docker compose exec -T php-fpm php artisan route:cache
docker compose exec -T php-fpm php artisan view:cache

info "Restarting all containers..."
docker compose up -d --remove-orphans

info "Restarting queue workers..."
docker compose restart laravel-queue laravel-horizon

success "Deploy complete — $(date)"
docker compose ps
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
