.PHONY: help build up down restart logs shell-php shell-node \
        migrate migrate-fresh seed test test-backend test-frontend test-e2e \
        deploy-staging deploy-prod horizon tinker

# ─── Variables ───────────────────────────────────────────────────────────────
COMPOSE      = docker compose
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml
PHP          = $(COMPOSE) exec php-fpm php
ARTISAN      = $(PHP) artisan
NPM          = $(COMPOSE) exec node npm

# ─── Help ─────────────────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── Docker lifecycle ─────────────────────────────────────────────────────────
build: ## Build all Docker images
	$(COMPOSE) build --no-cache

up: ## Start all services
	$(COMPOSE) up -d

down: ## Stop all services
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

logs-php: ## Tail PHP-FPM logs
	$(COMPOSE) logs -f php-fpm

logs-queue: ## Tail queue worker logs
	$(COMPOSE) logs -f laravel-queue

# ─── Shell access ────────────────────────────────────────────────────────────
shell-php: ## Open a shell in the PHP-FPM container
	$(COMPOSE) exec php-fpm sh

shell-node: ## Open a shell in the Next.js container
	$(COMPOSE) exec node sh

# ─── Laravel ──────────────────────────────────────────────────────────────────
migrate: ## Run database migrations
	$(ARTISAN) migrate --force

migrate-fresh: ## Drop all tables and re-run migrations (⚠ destructive in production)
	$(ARTISAN) migrate:fresh --seed

seed: ## Run database seeders
	$(ARTISAN) db:seed

tinker: ## Open Laravel Tinker REPL
	$(ARTISAN) tinker

horizon: ## Open Laravel Horizon dashboard URL
	@echo "Horizon: http://localhost/horizon"

cache-clear: ## Clear all Laravel caches
	$(ARTISAN) cache:clear
	$(ARTISAN) config:clear
	$(ARTISAN) route:clear
	$(ARTISAN) view:clear

# ─── Testing ─────────────────────────────────────────────────────────────────
test: test-backend test-frontend ## Run all tests

test-backend: ## Run Laravel Pest/PHPUnit tests
	$(COMPOSE) exec php-fpm php artisan test --parallel

test-frontend: ## Run Jest tracker unit tests
	$(COMPOSE) exec node npm run test --prefix /app

test-e2e: ## Run Playwright E2E tests against running stack
	$(COMPOSE) exec node npx playwright test

# ─── Build tracker ────────────────────────────────────────────────────────────
build-tracker: ## Build and minify the tracker script
	cd tracker && npm ci && npm run build

# ─── Deployment ──────────────────────────────────────────────────────────────
deploy-staging: ## Deploy to staging VPS (requires SSH config)
	@echo "Deploying to staging..."
	ssh staging-vps "cd /opt/eye && git pull && docker compose build && docker compose up -d && docker compose exec -T php-fpm php artisan migrate --force"
	@echo "Running health check..."
	curl -sf http://staging.yourdomain.com/api/health | python3 -m json.tool

deploy-prod: ## Deploy to production VPS — requires a v* tag (⚠ destructive)
	@read -p "Deploy tag [e.g. v1.0.0]: " TAG; \
	git tag $$TAG && git push origin $$TAG
	@echo "GitHub Actions will handle the production deployment on tag push."

# ─── Utilities ────────────────────────────────────────────────────────────────
ps: ## Show running containers
	$(COMPOSE) ps

health: ## Check API health endpoint
	curl -s http://localhost/api/health | python3 -m json.tool

setup: ## First-time setup: copy .env files and build images
	@[ -f .env ] || cp .env.example .env
	@[ -f backend/.env ] || cp backend/.env.example backend/.env
	@[ -f frontend/.env.local ] || cp frontend/.env.example frontend/.env.local
	@echo "✓ .env files copied. Edit backend/.env and frontend/.env.local before running 'make up'."
