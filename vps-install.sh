#!/usr/bin/env bash
# ==============================================================================
#  EYE Analytics — Complete VPS Installation Script
#  Ubuntu 22.04 / 24.04 LTS
#
#  USAGE:
#    1. SSH into your VPS as root
#    2. wget https://raw.githubusercontent.com/AhmedWael97/EYE/main/vps-install.sh
#    3. chmod +x vps-install.sh && bash vps-install.sh
#
#  WHAT THIS SCRIPT DOES:
#    - Installs Docker, Docker Compose, Git, Certbot, UFW
#    - Clones the repo from GitHub
#    - Writes backend/.env and frontend/.env.local
#    - Builds all Docker images
#    - Starts all 10 containers
#    - Runs DB migrations + seeders (plans, theme, superadmin)
#    - Initialises ClickHouse schema
#    - Obtains a free Let's Encrypt SSL certificate
#    - Configures Nginx for HTTPS
#    - Hardens the firewall (SSH + 80 + 443 only)
#    - Sets up SSL auto-renewal cron
# ==============================================================================

set -euo pipefail
SECONDS=0

# ── Colours ───────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; B='\033[1m'; N='\033[0m'
info()    { echo -e "${C}[➜]${N} $*"; }
success() { echo -e "${G}[✓]${N} $*"; }
warn()    { echo -e "${Y}[!]${N} $*"; }
die()     { echo -e "${R}[✗] $*${N}" >&2; exit 1; }
section() { echo -e "\n${B}${C}━━━  $*  ━━━${N}\n"; }

# ── Must be root ──────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run this script as root: sudo bash vps-install.sh"

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${C}"
cat << 'BANNER'
  ███████╗██╗   ██╗███████╗
  ██╔════╝╚██╗ ██╔╝██╔════╝
  █████╗   ╚████╔╝ █████╗
  ██╔══╝    ╚██╔╝  ██╔══╝
  ███████╗   ██║   ███████╗
  ╚══════╝   ╚═╝   ╚══════╝
  Analytics Platform — VPS Installer
BANNER
echo -e "${N}"

# ==============================================================================
# SECTION 0: Collect configuration
# ==============================================================================
section "Configuration"

read -rp "  Your domain (e.g. eye.yourdomain.com)         : " DOMAIN
[[ -z "$DOMAIN" ]] && die "Domain is required"

read -rp "  Admin email (for SSL cert + login)            : " ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && die "Email is required"

read -rsp "  Admin password [default: EyeAdmin@2026!]      : " ADMIN_PASS; echo
[[ -z "$ADMIN_PASS" ]] && ADMIN_PASS="EyeAdmin@2026!"

read -rsp "  OpenAI API key (optional, press Enter to skip): " OPENAI_KEY; echo
read -rsp "  Mailgun API key (optional, press Enter to skip): " MAILGUN_KEY; echo
read -rsp "  Mailgun domain (optional, e.g. mg.domain.com) : " MAILGUN_DOMAIN; echo

# Auto-generate secrets
DB_PASS=$(openssl rand -hex 20)
REDIS_PASS=$(openssl rand -hex 20)
APP_KEY="base64:$(openssl rand -base64 32)"
REVERB_SECRET=$(openssl rand -hex 24)

INSTALL_DIR="/opt/eye"
REPO_URL="https://github.com/AhmedWael97/EYE.git"

echo ""
info "Installing to   : $INSTALL_DIR"
info "Domain          : $DOMAIN"
info "Admin email     : $ADMIN_EMAIL"
info "DB password     : ${DB_PASS:0:6}... (auto-generated)"
info "Redis password  : ${REDIS_PASS:0:6}... (auto-generated)"
echo ""
read -rp "  Continue? [y/N] " CONFIRM
[[ "${CONFIRM,,}" != "y" ]] && die "Aborted."

# ==============================================================================
# SECTION 1: System packages
# ==============================================================================
section "System Packages"

info "Updating apt..."
apt-get update -qq
apt-get upgrade -y -qq

info "Installing required packages..."
apt-get install -y -qq \
  curl wget git unzip gnupg ca-certificates \
  lsb-release apt-transport-https software-properties-common \
  ufw fail2ban certbot

success "System packages ready"

# ==============================================================================
# SECTION 2: Docker + Docker Compose
# ==============================================================================
section "Docker"

if command -v docker &>/dev/null; then
  success "Docker already installed: $(docker --version)"
else
  info "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  success "Docker installed: $(docker --version)"
fi

# Verify compose plugin
docker compose version &>/dev/null || die "docker compose plugin not found"
success "Docker Compose: $(docker compose version)"

# ==============================================================================
# SECTION 3: Clone repository
# ==============================================================================
section "Clone Repository"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Repository exists — pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning $REPO_URL → $INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
success "Repository ready at $INSTALL_DIR"

# Create required directories
mkdir -p \
  "$INSTALL_DIR/backend/storage/app/exports" \
  "$INSTALL_DIR/backend/storage/logs" \
  "$INSTALL_DIR/backend/storage/framework/cache" \
  "$INSTALL_DIR/backend/storage/framework/sessions" \
  "$INSTALL_DIR/backend/storage/framework/views" \
  "$INSTALL_DIR/backend/storage/geoip"

chmod -R 775 "$INSTALL_DIR/backend/storage"

# ==============================================================================
# SECTION 4: Write environment files
# ==============================================================================
section "Environment Files"

# ── backend/.env ──────────────────────────────────────────────────────────────
info "Writing backend/.env ..."
cat > "$INSTALL_DIR/backend/.env" << EOF
APP_NAME="EYE Analytics"
APP_ENV=production
APP_KEY=${APP_KEY}
APP_DEBUG=false
APP_URL=https://${DOMAIN}

LOG_CHANNEL=stack
LOG_LEVEL=error
LOG_STACK=single

# ─── PostgreSQL ───────────────────────────────────────────────────────────────
DB_CONNECTION=pgsql
DB_HOST=postgresql
DB_PORT=5432
DB_DATABASE=eye
DB_USERNAME=eye
DB_PASSWORD=${DB_PASS}

# ─── ClickHouse ───────────────────────────────────────────────────────────────
CLICKHOUSE_HOST=clickhouse
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=eye_analytics
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASS}
REDIS_CLIENT=phpredis

# ─── Cache / Session / Queue ──────────────────────────────────────────────────
CACHE_DRIVER=redis
CACHE_PREFIX=eye_
SESSION_DRIVER=redis
SESSION_LIFETIME=120
SESSION_DOMAIN=${DOMAIN}
SESSION_SECURE_COOKIE=true
QUEUE_CONNECTION=redis

# ─── Broadcasting (Reverb WebSockets) ────────────────────────────────────────
BROADCAST_DRIVER=reverb
REVERB_APP_ID=eye-app
REVERB_APP_KEY=eye-key
REVERB_APP_SECRET=${REVERB_SECRET}
REVERB_HOST=laravel-reverb
REVERB_PORT=8080
REVERB_SCHEME=https

# ─── Mail ─────────────────────────────────────────────────────────────────────
MAIL_MAILER=${MAILGUN_KEY:+mailgun}${MAILGUN_KEY:-log}
MAIL_FROM_ADDRESS=noreply@${DOMAIN}
MAIL_FROM_NAME="EYE Analytics"
MAILGUN_DOMAIN=${MAILGUN_DOMAIN:-}
MAILGUN_SECRET=${MAILGUN_KEY:-}
MAILGUN_ENDPOINT=api.mailgun.net

# ─── AI ───────────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=
OPENAI_API_KEY=${OPENAI_KEY:-}

# ─── B2B / GeoIP ──────────────────────────────────────────────────────────────
IPINFO_TOKEN=
MAXMIND_LICENSE_KEY=
MAXMIND_DB_PATH=/var/www/backend/storage/geoip/GeoLite2-City.mmdb

# ─── Auth ─────────────────────────────────────────────────────────────────────
SANCTUM_STATEFUL_DOMAINS=${DOMAIN}
FRONTEND_URL=https://${DOMAIN}
EMAIL_VERIFICATION_ENABLED=false

# ─── Horizon ──────────────────────────────────────────────────────────────────
HORIZON_PATH=horizon

# ─── Error monitoring ─────────────────────────────────────────────────────────
SENTRY_LARAVEL_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1

# ─── Filesystem ───────────────────────────────────────────────────────────────
FILESYSTEM_DISK=local

# ─── 2FA ──────────────────────────────────────────────────────────────────────
TOTP_ISSUER="EYE Analytics"
EOF
success "backend/.env written"

# ── frontend/.env.local ───────────────────────────────────────────────────────
info "Writing frontend/.env.local ..."
cat > "$INSTALL_DIR/frontend/.env.local" << EOF
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
NEXT_PUBLIC_APP_URL=https://${DOMAIN}
NEXT_PUBLIC_REVERB_HOST=${DOMAIN}
NEXT_PUBLIC_REVERB_PORT=443
NEXT_PUBLIC_REVERB_SCHEME=https
NEXT_PUBLIC_TRACKER_URL=https://${DOMAIN}/tracker/tracker.js
EOF
success "frontend/.env.local written"

# ==============================================================================
# SECTION 5: Patch docker-compose.yml for production
# ==============================================================================
section "Docker Compose — Production Patch"

# Switch Nginx port from 8000:80 → 80:80
sed -i 's/"8000:80"/"80:80"/' "$INSTALL_DIR/docker-compose.yml"

# Update PostgreSQL container to use our DB password
export DB_PASSWORD="$DB_PASS"
export REDIS_PASSWORD="$REDIS_PASS"

success "docker-compose.yml patched (port 80)"

# ==============================================================================
# SECTION 6: Build Docker images
# ==============================================================================
section "Build Docker Images"

info "Building all images — this takes 5-10 minutes on first run..."
cd "$INSTALL_DIR"
docker compose build --no-cache
success "All images built"

# ==============================================================================
# SECTION 7: Start containers
# ==============================================================================
section "Start Containers"

info "Starting databases first (PostgreSQL + Redis + ClickHouse)..."
docker compose up -d postgresql redis clickhouse
info "Waiting 30s for databases to become healthy..."
sleep 30

info "Starting remaining services..."
docker compose up -d
info "Waiting 30s for all services to stabilise..."
sleep 30

# Show status
docker compose ps
success "All containers started"

# ==============================================================================
# SECTION 8: Database — Migrations & Seeds
# ==============================================================================
section "Database Setup"

info "Running PostgreSQL migrations..."
docker compose exec -T php-fpm php artisan migrate --force

info "Seeding plans..."
docker compose exec -T php-fpm php artisan db:seed --class=PlanSeeder --force

info "Seeding theme settings..."
docker compose exec -T php-fpm php artisan db:seed --class=ThemeSettingSeeder --force

info "Creating superadmin account: ${ADMIN_EMAIL} ..."
docker compose exec -T php-fpm php artisan tinker --execute="
\$admin = \App\Models\User::updateOrCreate(
    ['email' => '${ADMIN_EMAIL}'],
    [
        'name'              => 'Super Admin',
        'password'          => \Illuminate\Support\Facades\Hash::make('${ADMIN_PASS}'),
        'email_verified_at' => now(),
        'role'              => 'superadmin',
        'status'            => 'active',
        'api_key'           => \Illuminate\Support\Str::random(64),
        'locale'            => 'en',
        'timezone'          => 'UTC',
        'appearance'        => 'system',
        'totp_enabled'      => false,
    ]
);
echo 'Superadmin ready: ' . \$admin->email;
"

info "Linking storage..."
docker compose exec -T php-fpm php artisan storage:link || true

info "Caching config/routes/views..."
docker compose exec -T php-fpm php artisan config:cache
docker compose exec -T php-fpm php artisan route:cache
docker compose exec -T php-fpm php artisan view:cache

success "Database ready"

# ==============================================================================
# SECTION 9: ClickHouse schema
# ==============================================================================
section "ClickHouse Schema"

info "Initialising ClickHouse eye_analytics database..."
docker compose exec -T clickhouse clickhouse-client --query \
  "CREATE DATABASE IF NOT EXISTS eye_analytics"

# Apply schema if file exists
if [[ -f "$INSTALL_DIR/docker/clickhouse/schema.sql" ]]; then
  docker compose exec -T clickhouse clickhouse-client \
    --database eye_analytics \
    --multiquery < "$INSTALL_DIR/docker/clickhouse/schema.sql"
  success "ClickHouse schema applied"
else
  warn "docker/clickhouse/schema.sql not found — skipping (tables may auto-create on first event)"
fi

# Ensure company_name column exists
docker compose exec -T clickhouse clickhouse-client \
  --database eye_analytics \
  --query "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS company_name Nullable(String)" \
  2>/dev/null || true

# ==============================================================================
# SECTION 10: SSL Certificate (Let's Encrypt)
# ==============================================================================
section "SSL Certificate"

info "Stopping Nginx temporarily to free port 80..."
docker compose stop nginx 2>/dev/null || true
sleep 3

info "Requesting certificate for $DOMAIN ..."
if certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "$ADMIN_EMAIL" \
  -d "$DOMAIN"; then
  success "SSL certificate obtained: /etc/letsencrypt/live/$DOMAIN/"
  SSL_OK=true
else
  warn "SSL certificate failed — will run on HTTP only. Fix DNS and re-run:"
  warn "  certbot certonly --standalone -d $DOMAIN"
  warn "  Then re-run step 11 (Nginx config) manually"
  SSL_OK=false
fi

# ==============================================================================
# SECTION 11: Nginx HTTPS config
# ==============================================================================
section "Nginx Configuration"

if [[ "$SSL_OK" == "true" ]]; then
  info "Writing HTTPS Nginx config..."
  cat > "$INSTALL_DIR/docker/nginx/default.conf" << NGINXEOF
upstream php_fpm   { server php-fpm:9000;        keepalive 32; }
upstream next_app  { server node:3000;            keepalive 16; }
upstream reverb_ws { server laravel-reverb:8080;  keepalive 8;  }

limit_req_zone \$binary_remote_addr zone=track_limit:10m rate=300r/m;
limit_req_zone \$binary_remote_addr zone=auth_limit:10m  rate=10r/m;

map \$http_origin \$cors_origin {
    default "";
    "https://${DOMAIN}" "https://${DOMAIN}";
}

# ── HTTP → HTTPS redirect ─────────────────────────────────────────────────────
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# ── HTTPS ─────────────────────────────────────────────────────────────────────
server {
    listen 443 ssl;
    http2  on;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    root /var/www/backend/public;
    index index.php;
    client_max_body_size 20M;

    add_header X-Content-Type-Options  "nosniff"                         always;
    add_header X-Frame-Options         "SAMEORIGIN"                      always;
    add_header X-XSS-Protection        "1; mode=block"                   always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ── Tracker static files ──────────────────────────────────────────────────
    location /tracker/ {
        alias /var/www/tracker/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        try_files \$uri =404;
    }

    # ── Tracking ingestion (rate limited) ────────────────────────────────────
    location = /api/track {
        limit_req zone=track_limit burst=50 nodelay;
        add_header Access-Control-Allow-Origin \$cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        try_files \$uri /index.php?\$query_string;
    }

    # ── Auth endpoints (rate limited) ────────────────────────────────────────
    location ~ ^/api/auth/(login|register|forgot-password|reset-password|two-factor) {
        limit_req zone=auth_limit burst=5 nodelay;
        try_files \$uri /index.php?\$query_string;
    }

    # ── All other API routes ──────────────────────────────────────────────────
    location ~ ^/api/ {
        add_header Access-Control-Allow-Origin \$cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With" always;
        if (\$request_method = OPTIONS) { return 204; }
        try_files \$uri /index.php?\$query_string;
    }

    # ── Laravel Horizon dashboard ─────────────────────────────────────────────
    location ~ ^/horizon {
        try_files \$uri /index.php?\$query_string;
    }

    # ── PHP-FPM ───────────────────────────────────────────────────────────────
    location ~ \.php$ {
        fastcgi_pass            php-fpm:9000;
        fastcgi_index           index.php;
        fastcgi_param           SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        fastcgi_read_timeout    300;
        include                 fastcgi_params;
    }

    # ── WebSocket (Reverb) ────────────────────────────────────────────────────
    location /ws {
        proxy_pass              http://reverb_ws;
        proxy_http_version      1.1;
        proxy_set_header        Upgrade \$http_upgrade;
        proxy_set_header        Connection "Upgrade";
        proxy_set_header        Host \$host;
        proxy_read_timeout      86400;
    }

    # ── Next.js frontend (everything else) ───────────────────────────────────
    location / {
        proxy_pass              http://next_app;
        proxy_http_version      1.1;
        proxy_set_header        Upgrade \$http_upgrade;
        proxy_set_header        Connection "upgrade";
        proxy_set_header        Host \$host;
        proxy_set_header        X-Real-IP \$remote_addr;
        proxy_set_header        X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto \$scheme;
        proxy_cache_bypass      \$http_upgrade;
    }
}
NGINXEOF

  # Mount Let's Encrypt certs into Nginx container by adding to volumes
  # (only add if not already there)
  if ! grep -q "letsencrypt" "$INSTALL_DIR/docker-compose.yml"; then
    sed -i '/- .\/docker\/nginx\/default.conf/a\      - /etc/letsencrypt:/etc/letsencrypt:ro' \
      "$INSTALL_DIR/docker-compose.yml"
  fi

  # Add port 443 to Nginx if not already there
  if ! grep -q '"443:443"' "$INSTALL_DIR/docker-compose.yml"; then
    sed -i 's/"80:80"/"80:80"\n      - "443:443"/' "$INSTALL_DIR/docker-compose.yml"
  fi

  success "HTTPS Nginx config written"
else
  warn "SSL skipped — Nginx stays on HTTP port 80"
fi

# Restart Nginx with new config
docker compose up -d nginx
sleep 5
success "Nginx started"

# ==============================================================================
# SECTION 12: Firewall (UFW)
# ==============================================================================
section "Firewall"

info "Configuring UFW..."
ufw --force reset      >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

success "Firewall active — ports open: 22 (SSH), 80 (HTTP), 443 (HTTPS)"

# ==============================================================================
# SECTION 13: SSL auto-renewal cron
# ==============================================================================
section "SSL Auto-Renewal"

RENEW_CMD="certbot renew --quiet --deploy-hook 'docker compose -f ${INSTALL_DIR}/docker-compose.yml restart nginx'"
# Add only if not already in crontab
(crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "0 3 * * * $RENEW_CMD") | crontab -

success "SSL auto-renewal cron: runs daily at 03:00"

# ==============================================================================
# SECTION 14: Final health check
# ==============================================================================
section "Health Check"

info "Waiting 15s then checking container health..."
sleep 15
docker compose ps

# Test HTTP response
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${DOMAIN}" 2>/dev/null || \
            curl -sk -o /dev/null -w "%{http_code}" "http://localhost" 2>/dev/null || echo "000")
info "HTTP status from site: $HTTP_CODE"

# Save credentials to a file
CRED_FILE="$INSTALL_DIR/.credentials"
cat > "$CRED_FILE" << CREDS
EYE Analytics — Server Credentials
====================================
Site:             https://${DOMAIN}
Admin Email:      ${ADMIN_EMAIL}
Admin Password:   ${ADMIN_PASS}
Horizon:          https://${DOMAIN}/horizon

PostgreSQL:
  Host:           postgresql (internal)
  Database:       eye
  User:           eye
  Password:       ${DB_PASS}

Redis:
  Password:       ${REDIS_PASS}

ClickHouse:
  Database:       eye_analytics
  (no password — internal network only)

Install Dir:      ${INSTALL_DIR}
Installed:        $(date)
CREDS
chmod 600 "$CRED_FILE"

# ==============================================================================
# Done
# ==============================================================================
ELAPSED=$SECONDS
MINUTES=$((ELAPSED / 60))
SECS=$((ELAPSED % 60))

echo ""
echo -e "${G}"
echo "  ╔════════════════════════════════════════════════════════╗"
echo "  ║      ✓  EYE Analytics installed successfully!         ║"
echo "  ╚════════════════════════════════════════════════════════╝"
echo -e "${N}"
echo -e "  ${B}Site URL${N}        : ${C}https://${DOMAIN}${N}"
echo -e "  ${B}Admin login${N}     : ${C}${ADMIN_EMAIL}${N}"
echo -e "  ${B}Admin password${N}  : ${C}${ADMIN_PASS}${N}"
echo -e "  ${B}Horizon${N}         : ${C}https://${DOMAIN}/horizon${N}"
echo -e "  ${B}Time taken${N}      : ${MINUTES}m ${SECS}s"
echo ""
echo -e "  ${Y}Credentials saved to: ${INSTALL_DIR}/.credentials${N}"
echo ""
echo -e "  ${B}Useful commands:${N}"
echo -e "  ${C}cd ${INSTALL_DIR}${N}"
echo -e "  ${C}docker compose ps${N}                         — container status"
echo -e "  ${C}docker compose logs -f php-fpm${N}            — Laravel logs"
echo -e "  ${C}docker compose logs -f node${N}               — Next.js logs"
echo -e "  ${C}docker compose exec php-fpm php artisan tinker${N} — Laravel REPL"
echo -e "  ${C}bash deploy.sh${N}                            — deploy code updates"
echo ""
