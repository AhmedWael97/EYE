#!/usr/bin/env bash
#
# EYE — production deploy (runs ON the VPS, in the repo directory).
# This replaces the GitHub Actions SSH step so deploys work without CI minutes.
#
# Usage (on the server):   cd /path/to/eye && bash scripts/deploy.sh
# Or trigger from your machine with scripts/remote-deploy.sh
#
# It pulls the latest code from GitHub (git itself is free — only Actions was
# billed), updates submodules, then runs the same Docker/Laravel/Next/tracker
# steps the old pipeline did.
set -euo pipefail

# Move to the repo root (parent of this scripts/ dir) regardless of CWD.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export COMPOSE_FILE=docker-compose.prod.yml

log() { echo -e "\n==> $*"; }

log "Pulling latest code..."
if ! git pull --rebase --autostash origin main; then
  log "WARNING: pull failed — backing up and resetting to origin/main..."
  TS=$(date +%Y%m%d-%H%M%S)
  git branch "backup/pre-reset-$TS" || true
  git stash push -u -m "pre-reset-$TS" || true
  git fetch origin main
  git reset --hard origin/main
fi

log "Updating submodules (backend=main, frontend=master)..."
git submodule sync --recursive
(cd backend  && git fetch origin main   && git reset --hard origin/main)
(cd frontend && git fetch origin master && git reset --hard origin/master)

log "[BACKEND] composer install..."
docker compose exec -T php-fpm composer install \
  --no-dev --optimize-autoloader --no-interaction --ignore-platform-reqs

log "[BACKEND] Running migrations..."
docker compose exec -T php-fpm php artisan migrate --force

log "[BACKEND] Restarting php-fpm + workers..."
docker compose restart php-fpm
docker compose exec -T php-fpm php artisan horizon:terminate || true
docker compose restart laravel-horizon laravel-scheduler laravel-reverb

log "[BACKEND] Recaching config & routes..."
docker compose exec -T php-fpm php artisan config:clear
docker compose exec -T php-fpm php artisan config:cache
docker compose exec -T php-fpm php artisan route:clear
docker compose exec -T php-fpm php artisan route:cache
docker compose exec -T php-fpm php artisan view:clear
docker compose exec -T php-fpm php artisan storage:link --force

log "[FRONTEND] Rebuilding Next.js container..."
set -a; [ -f frontend/.env.local ] && source frontend/.env.local; set +a
docker compose up -d --build --force-recreate node

log "[TRACKER] Rebuilding tracker bundle..."
docker compose up -d --no-deps tracker-build

log "Restarting nginx..."
docker compose restart nginx

# Restore HTTPS nginx config if certs exist for the configured domain.
DOMAIN=$(grep '^APP_URL=' backend/.env 2>/dev/null | sed 's|APP_URL=https\?://||' | tr -d '"' | sed 's|/.*||' || true)
if [ -n "${DOMAIN:-}" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  log "[SSL] Restoring HTTPS nginx config for $DOMAIN..."
  sed "s/DOMAIN/$DOMAIN/g" docker/nginx/default.conf.ssl > docker/nginx/default.conf
  docker compose restart nginx
fi

log "Health check..."
sleep 5
curl -sf http://localhost/api/v1/health && echo "Health: OK" || echo "WARNING: health check failed"

docker image prune -f
log "Deployment complete!"
