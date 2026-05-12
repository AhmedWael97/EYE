# EYE Analytics — Claude Project Reference (claude.md)

Read this file at the start of every session. It contains the full project architecture,
every known fix, all coding conventions, and the current state of each subsystem.

---

## 1. Project Summary

**EYE** is a privacy-first, AI-powered visitor-analytics SaaS (similar to Mixpanel/Hotjar).
Paid plans are processed through Paymob (primary) and manual bank transfer.

### Tech Stack
| Layer | Technology |
|---|---|
| Backend API | Laravel 12 · PHP 8.3 |
| Frontend | Next.js 14 · App Router · React 18 |
| UI | Tailwind CSS v3 · shadcn/ui · `darkMode: 'class'` · RTL (`rtl:` / `ltr:`) |
| i18n | `next-intl` — `ar` (RTL) and `en` (LTR) stored in `frontend/messages/` |
| Tracking Script | Vanilla JS (source `tracker/src/eye.js`; built to `backend/public/tracker/eye.js`) |
| Relational DB | PostgreSQL 16 (via PgBouncer in prod) |
| Analytics Store | ClickHouse 24.3 |
| Cache / Queues | Redis 7.2 |
| AI | Anthropic Claude API (`ANTHROPIC_API_KEY`) |
| Realtime | Laravel Reverb (WebSockets) |
| Queue Monitor | Laravel Horizon |
| Error Monitor | Sentry (backend + frontend) |
| Email | Laravel Mail — driver configurable via `MAIL_MAILER` (Mailgun recommended) |
| Tests | PHPUnit/Pest · Jest · Playwright (E2E) |
| CI/CD | GitHub Actions → SSH deploy to VPS |
| Deployment | Docker Compose (`docker-compose.yml` dev, `docker-compose.prod.yml` prod) |

---

## 2. Repository Layout

```
eye/
├── backend/          # Laravel 12 API
│   ├── app/
│   │   ├── Http/Controllers/
│   │   │   ├── Analytics/        – analytics endpoints
│   │   │   ├── Auth/             – register, login, 2FA, password
│   │   │   ├── Domain/           – domain CRUD + pipeline management
│   │   │   ├── Payment/          – PaymobController (NEW)
│   │   │   ├── Replay/           – session replay ingestion + retrieval
│   │   │   ├── Tracker/          – TrackController (ingestion)
│   │   │   ├── Tools/            – SeoCheckerController (single + crawl)
│   │   │   ├── Ux/               – heatmap, scroll-depth, web-vitals, UX scores
│   │   │   ├── Admin/            – super-admin panel
│   │   │   ├── Ai/               – AI reports + chatbot
│   │   │   └── BillingController.php
│   │   ├── Jobs/                 – ProcessTrackingEvent, EnrichCompanyJob, …
│   │   ├── Models/               – Eloquent models
│   │   └── Services/             – ClickHouseService, etc.
│   ├── database/migrations/      – all schema migrations
│   ├── routes/api.php            – all API routes
│   └── config/services.php       – third-party service keys
│
├── frontend/         # Next.js 14
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/ux/screenshot/route.ts   – Playwright screenshot endpoint
│   │   │   └── [locale]/
│   │   │       ├── (app)/dashboard/
│   │   │       │   ├── heatmaps/page.tsx    – click heatmap display
│   │   │       │   └── …
│   │   │       ├── (app)/tools/
│   │   │       │   └── seo-checker/page.tsx – SEO tool (single + crawl)
│   │   │       └── (app)/settings/
│   │   │           └── billing/page.tsx     – billing + Paymob UI
│   │   ├── lib/api.ts            – re-exports from src/api/
│   │   └── store/auth.ts         – Zustand auth store (token, selectedDomainId)
│
├── tracker/
│   ├── src/eye.js               – source tracker (< 4 KB gzipped target)
│   └── src/eye-replay.js        – rrweb session-replay loader
│
└── docker/
    ├── nginx/default.conf
    ├── php/Dockerfile
    └── clickhouse/{config,users}.xml
```

---

## 3. Environment Variables Reference

### Backend (`backend/.env`)
```
APP_KEY / APP_ENV / APP_DEBUG / APP_URL
DB_HOST / DB_DATABASE / DB_USERNAME / DB_PASSWORD
REDIS_HOST / REDIS_PASSWORD
CLICKHOUSE_HOST / CLICKHOUSE_DB / CLICKHOUSE_USER / CLICKHOUSE_PASSWORD
MAIL_MAILER / MAILGUN_DOMAIN / MAILGUN_SECRET
ANTHROPIC_API_KEY / ANTHROPIC_MODEL
REVERB_HOST / REVERB_PORT
SENTRY_LARAVEL_DSN
IPINFO_TOKEN                        # B2B company enrichment
HEATMAP_SCREENSHOT_UPSTREAM         # default: http://node:3000/api/ux/screenshot
HEATMAP_SCREENSHOT_TTL_SECONDS      # default: 86400
# Paymob
PAYMOB_API_KEY
PAYMOB_INTEGRATION_ID
PAYMOB_IFRAME_ID
PAYMOB_HMAC_SECRET
# Bank transfer details (seeded in payment_methods.config)
BANK_TRANSFER_BANK_NAME / BANK_TRANSFER_ACCOUNT_NAME / BANK_TRANSFER_IBAN / …
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_API_VERSION=v1
NEXT_PUBLIC_APP_PUBLIC_KEY / NEXT_PUBLIC_APP_SECRET_KEY
SENTRY_DSN
```

---

## 4. API Routes Cheat Sheet

All routes are prefixed `/api/v1/` and guarded by `api.key` middleware (public/secret key pair).

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Registration |
| POST | `/auth/login` | — | Login (rate 10/min) |
| GET  | `/auth/me` | Sanctum | Current user |
| POST | `/tools/seo-check` | Sanctum | Single-page SEO check |
| POST | `/tools/seo-crawl` | Sanctum | Full-site SEO crawl (≤20 pages) |
| POST | `/billing/paymob/initiate` | Sanctum | Start Paymob payment → returns iframe URL |
| POST | `/billing/paymob/webhook` | **Public** (HMAC) | Paymob server callback |
| GET  | `/ux/{domainId}/heatmap` | Sanctum | Click heatmap data |
| GET  | `/ux/{domainId}/heatmap/screenshot` | Sanctum | Full-page screenshot (cached) |
| POST | `/track` | — | Tracker event ingestion (rate 300/min) |

---

## 5. Tracker (`tracker/src/eye.js`)

### Coordinate System (IMPORTANT — fixed May 2026)
Click coordinates `x` and `y` are stored as **percentages (0–100)** of the full
document dimensions using `ev.pageX / document.scrollWidth * 100`.  
- Before this fix, raw viewport pixels were stored, which caused heatmap dots to
  cluster at 99% regardless of where users clicked.
- The screenshot is now `fullPage: true` — the entire scrollable page is captured
  so dots align correctly at any scroll depth.

### Events Emitted
| Event | Description |
|---|---|
| `pageview` | Every page load (including SPA route change) |
| `click` | Every click — `x`/`y` as % of page |
| `rage_click` | ≥3 clicks within 30 px / 600 ms |
| `dead_click` | Click with no DOM change within 500 ms |
| `scroll_depth` | Milestone: 25 / 50 / 75 / 100 % |
| `excessive_scroll` | ≥3 direction reversals in 2 s |
| `time_on_page` | Heartbeat every 30 s + on visibility-hidden |
| `quick_back` | Back navigation < 5 s after arrival |
| `js_error` | Uncaught JS errors + unhandled rejections |
| `form_abandon` | Form focused but not submitted on unload |
| `broken_link` | Clicked link returned 404 (HEAD probe) |
| `web_vitals` | LCP / CLS / INP via PerformanceObserver |
| `page_load` | TTFB, domInteractive, domComplete, loadEvent, sizes (NEW) |
| `slow_resources` | Resources taking > 1 000 ms: name, type, duration, size (NEW) |
| `pipeline_step` | URL matched a pipeline pattern |
| `identify` | `EYE.identify(id, traits)` call |
| `custom` | `EYE.track(name, props)` call |

### Allowed Event Types (TrackController whitelist)
If a new event is added to the tracker, it **must** be added to the `$allowed` array
in `backend/app/Http/Controllers/Tracker/TrackController.php` → `sanitizeEventType()`.

---

## 6. Heatmaps

### Data Flow
1. Browser sends `click` / `rage_click` / `dead_click` events → `/api/v1/track`  
2. `ProcessTrackingEvent` job writes to ClickHouse `ux_events` table  
3. Frontend fetches `/api/v1/ux/{domainId}/heatmap` → returns rows with `x`, `y` as %  
4. `UxHeatmapController` queries ClickHouse `JSONExtractFloat(details, 'x')` / `'y'`  

### Screenshot
- Endpoint: `GET /api/v1/ux/{domainId}/heatmap/screenshot?url={pageUrl}`  
- Laravel (`UxHeatmapScreenshotController`) proxies to Next.js `GET /api/ux/screenshot?url=…`  
- Next.js uses **Playwright Chromium** to take a **full-page PNG** (fixed May 2026 — was viewport only)  
- Screenshots cached in `/tmp/eye-heatmap-screenshots/` (TTL: 6 h in Next.js, env-configurable in Laravel)  
- Internal requests pass `X-Internal-Request: true` / `X-Eye-Internal: true` headers to bypass auth  

---

## 7. SEO Checker

Two modes (both at `backend/app/Http/Controllers/Tools/SeoCheckerController.php`):

### Single-page check
`POST /api/v1/tools/seo-check` — `{ url: "https://…" }`  
Returns: `{ url, score, passed, total, issues[], passing[] }`

### Full-site crawl (NEW — added May 2026)
`POST /api/v1/tools/seo-crawl` — `{ url: "https://…", max_pages: 20 }`  
1. BFS-crawls internal links up to `max_pages` (default 20, max 20)  
2. Only follows same-host links  
3. Returns: `{ start_url, pages_crawled, site_score, results[] }`  

**Rate limits**: single check 20/min, crawl 5/min  
**Frontend**: `frontend/src/app/[locale]/(app)/tools/seo-checker/page.tsx`
- Toggle between "Single Page" and "Full Site Crawl" modes  
- Shows per-page accordion with issues  

**SEO Checks Run Per Page**: title, meta description, H1/H2, image alt, canonical,
Open Graph, Twitter card, Schema.org, robots meta, viewport, lang attr, HTTPS,
content length (~words), internal/external link count, HTTP status code.

---

## 8. Performance Monitoring (Tracker — NEW May 2026)

Two new events sent from `tracker/src/eye.js`:

### `page_load`
Fired once after `window.load` using `PerformanceNavigationTiming` (or legacy
`performance.timing`). Fields: `ttfb`, `dom_interactive`, `dom_complete`,
`load_event` (all ms), `transfer_size`, `decoded_size`, `redirect_count`.

### `slow_resources`
Fired via `PerformanceObserver` on `resource` entries.  
Reports any asset (image, script, CSS, fetch, XHR, font, etc.) with `duration ≥ 1 000 ms`.  
Fields per resource: `name` (URL, max 200 chars), `type` (initiatorType), `duration` (ms),
`size` (transferSize bytes), `cached` (bool — size=0 but decodedBodySize>0).  
Multiple slow resources are batched with a 2 s debounce.

---

## 9. Paymob Payment Gateway (NEW — May 2026)

### Flow
1. User selects a plan and clicks "Pay Now with Paymob"  
2. Frontend calls `POST /api/v1/billing/paymob/initiate` with `{ plan_id }`  
3. Backend (`PaymobController::initiate`):  
   a. Auth → Paymob token  
   b. Create order → `order_id`  
   c. Create payment key → `payment_key`  
   d. Creates pending `Payment` record in PostgreSQL  
   e. Returns `{ iframe_url, order_id, payment_id, amount, currency }`  
4. Frontend opens `iframe_url` in a new tab  
5. User completes payment on Paymob's hosted page  
6. Paymob calls `POST /api/v1/billing/paymob/webhook` (HMAC-verified)  
7. Backend verifies HMAC, activates subscription, marks payment `paid`  

### Required .env
```
PAYMOB_API_KEY
PAYMOB_INTEGRATION_ID    # card integration ID from Paymob dashboard
PAYMOB_IFRAME_ID         # iframe ID from Paymob dashboard
PAYMOB_HMAC_SECRET       # HMAC secret for webhook verification
```

### Files
- Controller: `backend/app/Http/Controllers/Payment/PaymobController.php`  
- Config:     `backend/config/services.php` → `services.paymob.*`  
- Migration:  `backend/database/migrations/2026_05_12_000001_add_paymob_to_payment_methods_type.php`  
- Frontend:   `frontend/src/app/[locale]/(app)/settings/billing/page.tsx`  

### Webhook Security
The webhook URL is public (`/api/v1/billing/paymob/webhook`) and guarded exclusively
by HMAC-SHA512 signature verification over Paymob's documented field set.
Do NOT add Sanctum auth to this route.

---

## 10. Database Quick Reference

### PostgreSQL (via PgBouncer in prod)
Main tables: `users`, `plans`, `payment_methods`, `subscriptions`, `payments`,
`domains`, `domain_exclusions`, `pipelines`, `pipeline_steps`,
`ai_reports`, `ai_suggestions`, `audience_segments`,
`ux_issues`, `ux_scores`, `visitor_identities`, `company_enrichments`,
`session_replays`, `webhooks`, `webhook_deliveries`,
`shared_reports`, `saved_views`, `alert_rules`, `notifications`,
`notification_preferences`, `audit_logs`, `theme_settings`,
`visitor_optouts`, `data_deletion_requests`, `totp_backup_codes`,
`impersonation_logs`, `export_jobs`.

### ClickHouse
Tables: `events`, `sessions`, `pipeline_events`, `ux_events`,
`custom_events`, `replay_events` (Phase 2 — not written yet).

### Redis Key Patterns
- `quota:{token}:events:{YYYY-MM-DD}` — daily event counter  
- `quota:{domainId}:analysis:{YYYY-MM}` — monthly AI run counter  
- `analytics:{domainId}:{md5(params)}` — cached query results (TTL 5 min)  
- `enrich:{ip_hash}` — IPinfo company enrichment cache (TTL 24 h)  
- `exclusions:{domainId}` — domain exclusion rules cache (TTL 60 s)  
- `theme_settings` — theme config (TTL 1 h)  

---

## 11. Key Coding Conventions

- **Laravel responses**: always use `$this->success(data)` / `$this->error(msg, status)`
  (defined in `app/Http/Controllers/Controller.php`)  
- **ClickHouse queries**: use `ClickHouseService::select()` / `insert()` — never raw PDO  
- **Enum in migrations**: `$table->enum()` in PostgreSQL = `VARCHAR + CHECK` constraint.
  To add values, drop and re-create the CHECK constraint (see May 2026 Paymob migration).  
- **Tracker events**: adding a new event type requires whitelisting it in
  `TrackController::sanitizeEventType()`.  
- **Frontend API calls**: import from `@/lib/api` (re-exports `@/api/*`).
  Auth token stored in `localStorage` as `eye_token`; also available via `useAuthStore().token`.  
- **i18n**: all user-facing strings must use `useTranslations()` from `next-intl`.
  Message files: `frontend/messages/en.json` and `frontend/messages/ar.json`.  
- **Screenshots**: always use `fullPage: true` in Playwright so heatmap dots align.  

---

## 12. Known Issues & Fixes Applied

| Date | Issue | Fix |
|---|---|---|
| May 2026 | Heatmap dots mis-positioned (raw pixels stored, not %) | Tracker now stores `ev.pageX / scrollWidth * 100` |
| May 2026 | Heatmap screenshot showed only viewport top | `fullPage: true` in `screenshot/route.ts` |
| May 2026 | SEO Checker only checked one page | Added `seo-crawl` endpoint + BFS crawler |
| May 2026 | No asset load-time tracking | Added `page_load` + `slow_resources` events |
| May 2026 | No Paymob payment option | Added `PaymobController`, migration, billing UI |
| Pre-May 2026 | Session replay blackscreen | See `FIXES_INSTRUCTIONS.md` → Fix 1 |

---

## 13. Running the Project

```bash
# Start everything (dev)
docker compose up -d

# Access app
http://localhost:8000

# Run backend tests
docker exec eye_php_fpm php artisan test

# Run tracker tests
cd tracker && npm test

# Run E2E tests
cd frontend && npx playwright test

# Apply DB migrations
docker exec eye_php_fpm php artisan migrate

# Build tracker script
cd tracker && node build.js
```

---

## 14. Phase 2 (Not Yet Implemented)
- Website visitor chatbot (AI-powered live chat on client sites)  
- AI assistant chatbot in dashboard  
- Replay events written to ClickHouse (table exists, ingestion disabled)  
- AI credits buying flow (beyond Paymob subscription)  
