#!/usr/bin/env bash
# =============================================================================
#  EYE Analytics — VPS Install Script
#  Tested on: Ubuntu 22.04 / 24.04 LTS
#  Run as root or a sudo user:
#    curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/eye/main/install.sh | bash
#  Or copy this file to the server and:
#    chmod +x install.sh && sudo bash install.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Collect variables ─────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       EYE Analytics — VPS Installer         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

read -rp "Your domain (e.g. app.yourdomain.com): " DOMAIN
read -rp "Your email (for Let's Encrypt SSL):    " EMAIL
read -rp "Git repo URL (SSH or HTTPS):            " REPO_URL
read -rsp "DB password (leave blank = auto-gen):  " DB_PASS; echo
read -rsp "Redis password (leave blank = auto-gen): " REDIS_PASS; echo
read -rsp "Admin password [default=Password1!]:   " ADMIN_PASS; echo

[[ -z "$DB_PASS" ]]    && DB_PASS=$(openssl rand -hex 16)
[[ -z "$REDIS_PASS" ]] && REDIS_PASS=$(openssl rand -hex 16)
[[ -z "$ADMIN_PASS" ]] && ADMIN_PASS="Password1!"
APP_KEY="base64:$(openssl rand -base64 32)"
INSTALL_DIR="/opt/eye"

echo ""
info "Installing to:  $INSTALL_DIR"
info "Domain:         $DOMAIN"
info "DB password:    ${DB_PASS:0:4}****"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git unzip gnupg ca-certificates \
  lsb-release apt-transport-https software-properties-common \
  ufw fail2ban

success "System packages installed"

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  success "Docker installed: $(docker --version)"
else
  success "Docker already installed: $(docker --version)"
fi

# ── 3. Clone / update repo ────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Pulling latest code..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning repository to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
success "Code is at $INSTALL_DIR"

cd "$INSTALL_DIR"

# ── 4. Write backend/.env ─────────────────────────────────────────────────────
info "Writing backend/.env..."
cat > "$INSTALL_DIR/backend/.env" <<EOF
APP_NAME="EYE Analytics"
APP_ENV=production
APP_KEY=$APP_KEY
APP_DEBUG=false
APP_URL=https://$DOMAIN

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=pgsql
DB_HOST=postgresql
DB_PORT=5432
DB_DATABASE=eye
DB_USERNAME=eye
DB_PASSWORD=$DB_PASS

CLICKHOUSE_HOST=eye_clickhouse
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=eye_analytics
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASS

CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis
SESSION_LIFETIME=120
SESSION_DOMAIN=$DOMAIN
SESSION_SECURE_COOKIE=true

BROADCAST_CONNECTION=reverb
REVERB_APP_ID=eye
REVERB_APP_KEY=eye-key
REVERB_APP_SECRET=$(openssl rand -hex 24)
REVERB_HOST=0.0.0.0
REVERB_PORT=8080
REVERB_SCHEME=https

MAIL_MAILER=log
MAIL_FROM_ADDRESS=noreply@$DOMAIN
MAIL_FROM_NAME="EYE Analytics"

SANCTUM_STATEFUL_DOMAINS=$DOMAIN
FRONTEND_URL=https://$DOMAIN

OPENAI_API_KEY=
SENTRY_LARAVEL_DSN=
EOF
success "backend/.env written"

# ── 5. Write frontend/.env.local ──────────────────────────────────────────────
info "Writing frontend/.env.local..."
cat > "$INSTALL_DIR/frontend/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_APP_URL=https://$DOMAIN
NEXT_PUBLIC_REVERB_HOST=$DOMAIN
NEXT_PUBLIC_REVERB_PORT=443
NEXT_PUBLIC_REVERB_SCHEME=https
NEXT_PUBLIC_TRACKER_URL=https://$DOMAIN/tracker/tracker.js
EOF
success "frontend/.env.local written"

# ── 6. Update Nginx config for production port 80/443 ────────────────────────
info "Patching docker-compose for production (port 80)..."
# Switch Nginx from 8000:80 to 80:80 in the compose file
sed -i 's/"8000:80"/"80:80"/' "$INSTALL_DIR/docker-compose.yml"
# Remove exposed ports for internal services (security hardening)
success "Nginx now listens on port 80"

# ── 7. Build and start containers ─────────────────────────────────────────────
info "Building Docker images (this takes 5-10 min on first run)..."
cd "$INSTALL_DIR"
docker compose build --no-cache

info "Starting all services..."
docker compose up -d

info "Waiting for services to become healthy (60s)..."
sleep 60

# ── 8. Database setup ─────────────────────────────────────────────────────────
info "Running migrations and seeding..."

# Set PostgreSQL password in compose env
DB_PASSWORD="$DB_PASS" docker compose exec -T postgresql \
  psql -U eye -c "ALTER USER eye WITH PASSWORD '$DB_PASS';" || true

docker compose exec -T php-fpm php artisan migrate --force
docker compose exec -T php-fpm php artisan db:seed --class=PlanSeeder --force
docker compose exec -T php-fpm php artisan db:seed --class=ThemeSettingSeeder --force

# Seed super admin with the chosen password (patch seeder temporarily)
docker compose exec -T php-fpm php artisan tinker --execute="
\App\Models\User::updateOrCreate(
  ['email' => 'admin@$DOMAIN'],
  [
    'name'              => 'Super Admin',
    'password'          => \Illuminate\Support\Facades\Hash::make('$ADMIN_PASS'),
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
echo 'Admin created';
"

docker compose exec -T php-fpm php artisan optimize:clear
docker compose exec -T php-fpm php artisan config:cache
docker compose exec -T php-fpm php artisan route:cache
docker compose exec -T php-fpm php artisan view:cache
docker compose exec -T php-fpm php artisan storage:link

success "Database ready"

# ── 9. SSL with Let's Encrypt (Certbot) ───────────────────────────────────────
info "Installing Certbot for SSL..."
apt-get install -y -qq certbot

info "Obtaining SSL certificate for $DOMAIN..."
# Temporarily stop nginx to free port 80 for standalone challenge
docker compose stop nginx || true

certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --cert-path "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" || {
  warn "SSL cert failed. You can retry with: certbot certonly --standalone -d $DOMAIN"
}

# Write HTTPS nginx config if cert succeeded
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
  info "Writing HTTPS Nginx config..."
  cat > "$INSTALL_DIR/docker/nginx/default.conf" <<NGINXEOF
upstream php_fpm   { server php-fpm:9000; keepalive 32; }
upstream next_app  { server node:3000;    keepalive 16; }
upstream reverb_ws { server laravel-reverb:8080; keepalive 8; }

limit_req_zone \$binary_remote_addr zone=track_limit:10m rate=300r/m;
limit_req_zone \$binary_remote_addr zone=auth_limit:10m  rate=10r/m;

map \$http_origin \$cors_origin {
    default "";
    "https://$DOMAIN" "https://$DOMAIN";
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    root /var/www/backend/public;
    index index.php;
    client_max_body_size 10M;

    add_header X-Content-Type-Options  "nosniff"                        always;
    add_header X-Frame-Options         "SAMEORIGIN"                     always;
    add_header X-XSS-Protection        "1; mode=block"                  always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /tracker/ {
        alias /var/www/tracker/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
        try_files \$uri =404;
    }

    location = /api/track {
        limit_req zone=track_limit burst=50 nodelay;
        try_files \$uri /index.php?\$query_string;
    }

    location ~ ^/api/ {
        try_files \$uri /index.php?\$query_string;
    }

    location ~ ^/horizon {
        try_files \$uri /index.php?\$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass   php-fpm:9000;
        fastcgi_index  index.php;
        fastcgi_param  SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        include        fastcgi_params;
        fastcgi_read_timeout 300;
    }

    location /ws {
        proxy_pass http://reverb_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://next_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF

  # Mount certs into Nginx container
  sed -i '/volumes:/,/networks:/{/- .\/docker\/nginx/a\      - /etc/letsencrypt:/etc/letsencrypt:ro
}' "$INSTALL_DIR/docker-compose.yml" 2>/dev/null || true

  # Re-open port 443 in compose
  sed -i 's/"80:80"/"80:80"\n      - "443:443"/' "$INSTALL_DIR/docker-compose.yml" 2>/dev/null || true

  success "SSL configured"
fi

# ── 10. Restart Nginx with new config ─────────────────────────────────────────
docker compose up -d nginx
success "Nginx restarted with SSL"

# ── 11. Firewall ──────────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
success "Firewall configured (SSH + 80 + 443 open)"

# ── 12. Auto-renew SSL cron ───────────────────────────────────────────────────
info "Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f $INSTALL_DIR/docker-compose.yml restart nginx'") | crontab -
success "SSL auto-renewal cron added"

# ── 13. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✓  EYE Analytics is installed!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Site:          ${CYAN}https://$DOMAIN${NC}"
echo -e "  Admin login:   ${CYAN}admin@$DOMAIN${NC}"
echo -e "  Admin pass:    ${CYAN}$ADMIN_PASS${NC}"
echo -e "  Horizon:       ${CYAN}https://$DOMAIN/horizon${NC}"
echo ""
echo -e "  DB password:   ${YELLOW}$DB_PASS${NC}"
echo -e "  Redis password:${YELLOW}$REDIS_PASS${NC}"
echo ""
echo -e "  ${YELLOW}Save the passwords above — they won't be shown again!${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "  ${CYAN}cd $INSTALL_DIR && docker compose ps${NC}       — check status"
echo -e "  ${CYAN}docker compose logs -f php-fpm${NC}             — Laravel logs"
echo -e "  ${CYAN}docker compose exec php-fpm php artisan tinker${NC} — shell"
echo ""
