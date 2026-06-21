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
| CI/CD | `scripts/deploy.sh` on the VPS (Actions-free); trigger via `scripts/remote-deploy.sh` or `git push` hook (`scripts/post-receive`). See `DEPLOY.md`. GitHub Actions optional via self-hosted runner. |
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
│   ├── src/eye.js               – source tracker (< 5 KB gzipped budget; CI-enforced)
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

### Environments + super-admin keys (Jun 2026)
- **Only two gateways**: Paymob + Bank Transfer (`AdminPaymentMethodController` validation restricts
  `type` to `paymob,bank_transfer`; admin Payment Methods page shows only these; billing returns active only).
- **Test/Production modes**: keys are managed in the super-admin Payment Methods page. `payment_methods.config`
  shape: `{ mode: 'test'|'production', test: {api_key, secret_key, public_key, integration_id, iframe_id, hmac_secret, base_url?}, production: {…} }`.
- `PaymobController::resolvePaymobConfig()` picks the active-mode keys → flat/legacy DB config → `PAYMOB_*` env.
  Base URL is per-mode overridable (default `https://accept.paymob.com/api`); iframe URL is derived from it.
- **Super-admin sidebar fix**: desktop visibility bug was `[dir=ltr] .ltr:-translate-x-full` out-specifying
  `lg:translate-x-0`; fixed with `lg:!translate-x-0` in `(admin)/layout.tsx`.

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
| Jun 2026 | UTM params never stored (tracker sent `us/um/uc`, job read `utm_source`) — campaigns merged | `ProcessTrackingEvent` now reads the short keys |
| Jun 2026 | No sales/revenue per campaign | `EYE.purchase()` + `conversions` table + last-touch ASOF attribution in `CampaignsController` |
| Jun 2026 | No ROI on campaigns | `ad_spend` table + `AdSpendController` (manual/CSV) → ROAS/CPA columns |
| Jun 2026 | Session replay never recorded (eye.js never loaded eye-replay.js) | `data-replay="true"` loader added to `eye.js` |
| Jun 2026 | Alert rules never evaluated (CheckAlertRulesJob was never scheduled) | Added `eye:check-alerts` command + 15-min schedule; alerts UI now creates type-based rules the job understands |
| Jun 2026 | Disabled bank transfer still shown to users | `BillingController::show()`/`subscribe()` called `getOrCreateBankTransferMethod()` which re-created an active row whenever none was active — disabling spawned a fresh active duplicate on next load. Removed the auto-create; both now look up an **active** method only (none → not offered). |
| Jun 2026 | Paymob "not fully configured" 503 with valid super-admin keys | `resolvePaymobConfig()` now falls back to whichever environment (test/production) actually has complete keys when the selected mode is incomplete — fixes keys entered under the wrong environment toggle. Admin "Test connection" still reports the precise missing field/mode. |
| Jun 2026 | Every registered user had unlimited access forever (free sub had NULL `current_period_end`) | **30-day free trial** + gating: registration sets `current_period_end = now()+30d`; new `subscribed` middleware (alias in `bootstrap/app.php`) returns **402 `subscription_required`** once the trial lapses with no paid sub (admins bypass), applied to product-feature route groups (domains, analytics\*, ux, ai, replay, chatbot, portfolio, leads, exports) — **not** billing/profile/account so users can still subscribe. Frontend `client.ts` redirects 402→`settings/billing?trial=expired` (banner shown). Migration `..._set_trial_period_on_open_subscriptions` backfills existing open subs with a fresh 30 days. |
| Jun 2026 | Email verification blocked dashboard access (forced redirect to verify-email) | Verification is now **non-blocking**: `(app)/layout.tsx` no longer redirects unverified users; instead `components/VerifyEmailBanner.tsx` shows a dismissable top bar with a one-click resend (`authApi.resendVerification`). Whether the email is actually sent still depends on `app.email_verification_enabled`. |
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
- AI credits buying flow (beyond Paymob subscription)  
- Ad-spend API connectors (Google Ads / Meta) — manual + CSV import already shipped  

## 15. Revenue, Campaigns & Integrations (Jun 2026)
- **Sales tracking**: `EYE.purchase(value, currency, orderId)` (also `order_completed` /
  `checkout_complete` custom events) → `conversions` ClickHouse table (ReplacingMergeTree,
  dedup by `order_id`). Attributed last-touch / cross-session via ASOF JOIN.
- **Ad spend / ROAS**: PostgreSQL `ad_spend` table; CRUD + CSV import at
  `/analytics/{domainId}/ad-spend`. Campaigns dashboard shows Revenue, Orders, Spend, ROAS, CPA.
- **E-commerce integrations** (in `integrations/`): WooCommerce plugin (auto-fires
  `EYE.purchase` on `woocommerce_thankyou`) and Shopify snippets (theme + order-status, with a
  Web Pixel fallback).
- **Session replay**: ENABLED. Add `data-replay="true"` to the tracker snippet — `eye.js`
  lazy-loads `eye-replay.js` (rrweb). Pipeline: `ReplayIngestController` → `replay_events` +
  `session_replays`; player at dashboard `replay/`. Respects `eye-block` / `eye-mask` classes.
  - **Timeline markers**: player overlays notable `ux_events` (rage/dead click, JS error, …)
    via `GET /replay/{domainId}/sessions/{sessionId}/markers` (approx. positioning — server vs client clock).
  - **Funnel → replay**: funnels page links each step to `GET /replay/{domainId}/funnel-drops`
    (`?pipeline_id=&step_order=`) to watch sessions that dropped after that step.
- **Attribution models**: Campaigns endpoint accepts `?attribution=last_touch|first_touch|linear|time_decay`
  (default last_touch). Computed in PHP (`CampaignsController::credit()`); orders/revenue split fractionally for multi-touch.
- **Alerts & anomaly detection**: `eye:check-alerts` (scheduled every 15 min) dispatches
  `CheckAlertRulesJob` per domain. Rule types: `traffic_drop`, `traffic_anomaly` (z-score vs 14-day
  same-hour baseline), `error_spike`, `conversion_drop`, `quota_warning`. Per-rule 6h cooldown
  (Redis `eye:alert:cooldown:{id}`). Managed at settings `alerts/`.
  - **Slack / Discord delivery**: rule `channel` can be `slack`|`discord` with a `webhook_url`
    (migration `..._add_webhook_url_to_alert_rules`); the job POSTs directly to the webhook.
- **Cohort retention**: `RetentionController` → `GET /analytics/{domainId}/retention?period=week|month`.
  Cohort grid (visitors by first-visit period × return offset). Dashboard `retention/`.
- **A/B experiments (visual engine, rebuilt Jun 2026)**: real no-code visual testing — users do NOT write
  `EYE.ab()` calls.
  - **Two types**: `ab` (same page; each variation injects **CSS** and/or **JS**) and `split_url` (each
    variation **redirects** to a different page URL). First variation = **control** (page as-is, no code).
    Each variation has a **weight** (%); traffic split deterministically.
  - **Schema**: `experiments` gains `type`, `target_url`, `goal_type` (`purchase`|`event`|`url`),
    `goal_value`, `status` (`draft`|`running`|`paused`); new `experiment_variations` table
    (`vkey`, `name`, `weight`, `is_control`, `js_code`, `css_code`, `redirect_url`, `sort`).
    Migration `..._extend_experiments_for_visual_ab`. Models `Experiment` (hasMany `variations`) +
    `ExperimentVariation`.
  - **Tracker**: `eye.js` unconditionally lazy-loads **`eye-ab.js`** (~2.7 KB). It fetches
    `GET /api/v1/experiments/active?t={TOKEN}` (PUBLIC, CORS `*`); for each running experiment whose
    `target_url` path matches, it buckets the visitor by id-hash into a weighted variation (sticky via
    `localStorage _eye_ab_{key}`), injects `<style data-eye-ab>` + `new Function(js)()` (ab) or
    `location.replace(redirect_url)` (split_url), and records exposure as the existing `experiment`
    custom event (`props.exp`, `props.variant`). No ingestion change.
  - **Results** (`ExperimentController::results`): per-variation **visitors seen** (distinct exposed) +
    **converters** by goal (`purchase`→`conversions`, `event`→`custom_events`, `url`→pageview url LIKE),
    **conversion_rate**, **uplift** vs control, two-proportion z-test (95% = |z|≥1.96), revenue.
    Dashboard `experiments/` (`ExperimentBuilder.tsx` with **CodeMirror** JS/CSS editors via
    `@uiw/react-codemirror`; `CodeEditor.tsx` dynamic `ssr:false`) — build, set weights, Start/Pause/Edit/Delete,
    per-variation results table. Legacy `EYE.experiment()`/`EYE.ab()` still record exposures (back-compat).
  - **GrowthBook integration** (rigorous engine): `GrowthBookService` + `ExperimentController::growthbook*`
    pull experiments/results from the GrowthBook REST API (`config/services.php → growthbook`,
    env `GROWTHBOOK_API_HOST`/`GROWTHBOOK_API_KEY`) and overlay EYE revenue-per-variant (matched on
    `trackingKey` to our exposure events). Degrades gracefully when unconfigured. Setup:
    `integrations/growthbook/README.md`. GrowthBook does assignment + stats; EYE adds revenue.

## 16. Multi-site Manager Tools (Jun 2026)
For users running many domains — aggregation, prioritization, action.
- **Portfolio**: `PortfolioController` — `GET /portfolio/overview` (per-domain KPI table + deltas vs prior
  period; user-scoped, spans all the user's domains) and `GET /portfolio/triage` (ranked cross-site
  issues: low ROAS, revenue/traffic drops, error spikes, missing spend data — sorted by money at stake).
  Dashboard `portfolio/` (lead item in the Analytics hub). Clicking a row/issue sets `selectedDomainId`
  and deep-links to that site's relevant page.
- **Budget recommendations**: client-side, derived from the campaigns endpoint's per-row spend/revenue/ROAS
  (pause ROAS<1, scale ROAS≥3, flag missing spend). Card on the campaigns page. Deterministic + explainable.
- **Bulk alert defaults**: `POST /alert-rules/apply-defaults` creates traffic_anomaly + conversion_drop +
  error_spike rules for every domain that lacks them. Button on settings `alerts/`.
- **Branded portfolio report**: `portfolio/report/` — print-optimized (window.print → PDF) report with totals,
  priorities, and a per-site table. App chrome hides on print (`print:hidden` in the app layout).

## 17. Help Center (Jun 2026)
Public, bilingual (EN/AR, RTL-aware) end-user guide — distinct from the flat `/docs` overview.
- **Content**: `frontend/src/content/help.ts` — pure data: 9 categories × step-by-step articles, each with
  `{en,ar}` title/summary/where/steps/tips. Add articles here; the page auto-renders them.
- **Page**: `(marketing)/help/` — `page.tsx` (server, metadata) + `HelpClient.tsx` (client: search filter,
  sidebar topic nav, per-article numbered steps). Reached via marketing Navbar "Guide" (`landing.nav.guide`)
  and a cross-link on `/docs`.

## 18. Self-tracking (dogfooding, Jun 2026)
EYE tracks its own frontend. A head loader in `[locale]/layout.tsx` sets `window.EYE_TOKEN`/`EYE_API`
and injects `eye.js` + `eye-replay.js` from `EYE_HOST` (env-overridable: `NEXT_PUBLIC_EYE_HOST/TOKEN/API`,
default `https://eye-analsyis.live`, api `/api/collect`). Skips localhost so dev doesn't pollute prod.
Loaded once each (no `data-replay` attr → no double-record). Logged-in users are identified via
`components/EyeIdentify.tsx` (rendered in `Providers`) → `EYE.identify(email, {user_id,name,email,role})`,
so they appear under Known Visitors / Identities.

## 19. SEO (Jun 2026)
Marketing site (Next.js App Router) optimized for organic search.
- **Single source of truth**: `src/lib/seo.ts` exports `SITE_URL` (env `NEXT_PUBLIC_APP_URL`, default
  `https://eye-analsyis.live`), `SITE_NAME`, `TWITTER_HANDLE`, `DEFAULT_KEYWORDS`, and JSON-LD builders.
  Fixed the old `eye.ai` fallback that leaked into canonical/sitemap/robots.
- **Structured data (JSON-LD)**: `components/JsonLd.tsx` renders blocks; landing injects Organization +
  WebSite + SoftwareApplication. Builders also exist for FAQPage / BreadcrumbList.
- **Metadata**: `[locale]/layout.tsx` `generateMetadata` sets metadataBase, locale-aware OG/Twitter defaults,
  keywords, robots (`max-image-preview:large`, `max-snippet:-1`). Landing + pricing have per-page
  title/description + `alternates` (canonical + en/ar hreflang). Pricing metadata lives in
  `[locale]/pricing/layout.tsx` (the page is a client component).
- **OG images**: dynamic `app/[locale]/opengraph-image.tsx` (next/og ImageResponse) + `twitter-image.tsx`
  re-export — branded card for every marketing page, no static asset.
- **robots** (`app/robots.ts`): allows public, disallows `/{en,ar}/{dashboard,admin,settings,auth}` + `/api/`,
  points to sitemap, sets host. **sitemap** (`app/sitemap.ts`): `/`, `/pricing`, `/docs`, `/help` × en/ar with hreflang.

## 20. Replay quality, A/B Studio, Channel Mix, Paymob test (Jun 2026)
- **Criteria-based replay**: `eye-replay.js` records into a buffer but only UPLOADS once the session
  *qualifies* — a friction/intent signal (`eye.js` calls `window.__eyeReplayQualify(reason)` for
  rage/dead click, js_error, form_abandon, quick_back, broken_link, purchase) OR engagement (≥10s + ≥3
  interactions). Buffer is kept from the latest FullSnapshot so the first upload is playable.
  `ReplayIngestController` sets `session_replays.has_snapshot` + `reason` + `status='complete'`;
  `ReplayController::sessions` lists only `has_snapshot=true` (never broken; also hides legacy ones).
  Player shows a reason badge. Migration `..._add_quality_to_session_replays`.
- **A/B Studio**: separate `(studio)` route group (own chrome, shared token + `selectedDomainId`,
  back-to-dashboard); the sidebar "Experiments" link now points to `/studio/experiments`, which re-exports
  the experiments page. **Convert.com** integrated like GrowthBook: `ConvertService` +
  `ExperimentController::convert*` + routes + a `ConvertPanel` (+ EYE revenue overlay) +
  `integrations/convert/README.md`. Config `services.convert.*` (`CONVERT_ACCOUNT_ID/APPLICATION_ID/API_KEY`).
- **Channel Mix (v2 4a)**: `dashboard/channels/` aggregates the campaigns endpoint by medium → per-channel
  sessions/revenue/spend/ROAS + cross-channel budget suggestions. Frontend-only (reuses campaigns data).
- **Paymob hardening**: `resolvePaymobConfig()` trims + reports `missing[]` (blank `integration_id` no longer
  becomes 0); admin **Test connection** endpoint `POST /admin/payment-methods/paymob/test` verifies the saved
  active-mode keys against Paymob's auth API; admin card auto-enables on save + shows the result.

## 21. v2 analysis + Growth engine (Jun 2026)
- **Channel Mix (4a)**: `dashboard/channels/` — campaigns data aggregated by medium → per-channel spend/revenue/ROAS + budget suggestions (frontend-only).
- **LTV by source (4b)**: `LtvController` → `GET /analytics/{id}/ltv` — first-touch source per visitor × total conversion revenue → avg LTV/visitor. Reuses the shared `Concerns\ClassifiesTraffic` trait (same source/medium SQL as CampaignsController). Page `dashboard/ltv/`.
- **Portfolio benchmarks (4c)**: portfolio page flags sites well below the portfolio **median** on conversion/ROAS/bounce (frontend-only on the overview data).
- **SEO rank tracking (4d)**: `seo_keywords` + `seo_rankings` tables, `SeoRankController` (track keyword, CSV import `date,keyword,position,url`, trend), page `tools/seo-rank/`. Manual/CSV now; automated SERP API can POST into `import` later.
- **Growth engine (compliant)**: `leads` + `email_suppressions` + `outreach_emails` tables.
  `LeadController` (CRUD, CSV import, **warm leads** = companies that visited the user's domains via ClickHouse
  `events.ip_hash` ⋈ `company_enrichments`). `OutreachController`: `draft` (AnthropicService writes an email for
  review), `send` (suppression check + per-user **daily cap** + auto **unsubscribe** link, via Mailgun/Mail),
  public `outreach/unsubscribe/{token}` + `outreach/mailgun-webhook` (bounce/complaint → suppression). Dashboard
  `leads/`. No auto-send — drafts are reviewed; opt-outs/bounces suppressed globally.
