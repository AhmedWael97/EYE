# EYE — Next Phase Plan

This document captures all planned future features: Phase 2 items carried over from the original plan, and the new **SEO Monitor Packages** product expansion.

---

## Phase 2 — Session Replay

Full rrweb-based session recording and playback.

### Backend
- New tables: `session_replays` (metadata) + `replay_events` (event stream, indexed by `session_id, event_index`)
- Unblock stubbed 503 endpoints:
  - `GET /api/replay/{domainId}/sessions` — paginated list with thumbnail, duration, start URL, date, rage-click flag
  - `GET /api/replay/{domainId}/sessions/{sessionId}` — full event stream for playback
  - `DELETE /api/replay/{domainId}/sessions/{sessionId}` — GDPR delete
- Write path: accept `replay` event type in TrackController → batch-insert into `replay_events`

### Tracker
- Ship `eye-replay.min.js` (~50 KB gzipped) — lazy-loaded rrweb wrapper
- Input masking by default: all form inputs, textarea, select auto-masked as `••••••••` before serialization; opt-out via `data-eye-no-mask`
- Never loaded in Phase 1 — `<script>` tag only injected when plan flag `session_replay: true`

### Dashboard
- `/dashboard/replay` — remove "Coming Soon" gate; add:
  - Session list with thumbnail, duration, start URL, visitor country, rage-click badge
  - Filters: URL, visitor ID, date range, has-rage-click
  - Replay player: rrweb player with playback controls, speed selector (0.5x–4x), event timeline sidebar (clicks / navigations / rage-clicks / errors)
  - GDPR delete button per recording

### Plan Gating
- `session_replay` feature flag: Free = off, Pro = on (7-day retention), Business = on (plan `data_retention_days`)

---

## Phase 2 — AI Marketing Assistant Chat

Floating chat panel on `/dashboard/ai`, pre-loaded with domain context.

### Backend
- New tables: `chatbot_sessions` (context snapshot per domain+user) + `chatbot_messages` (role, content, tokens_used)
- Unblock stubbed 503 endpoints:
  - `POST /api/ai/{domainId}/chat` — sends user message, returns AI response with data-grounded advice
  - `DELETE /api/ai/{domainId}/chat/{sessionId}` — clear conversation history
- Context snapshot: last 30-day segments, funnel conversion rates, top pages, top countries, UX score — injected as system prompt prefix
- Use same OpenAI/Anthropic integration as existing `AnalyzeDomainJob`

### Tracker / Frontend Module
- `eye-chat.min.js` — lazy-loaded only when `chatbot_enabled: true` returned from config endpoint
- Dynamically imported via `import()` — zero bundle impact when disabled

### Dashboard
- `/dashboard/ai` — remove "Coming Soon" overlay from chat panel section
- Floating chat panel: full conversation history, markdown rendering for responses, token usage indicator, "Clear conversation" button
- Context pill showing what data the assistant has access to

### Plan Gating
- `ai_chat` feature flag: Free = off, Pro = limited (20 messages/month), Business = unlimited

---

## Phase 2 — Website Visitor Chatbot

Embeddable AI chatbot widget for subscribers' own websites.

### Backend
- New tables: `website_chatbot_configs`, `website_chatbot_conversations`, `website_chatbot_messages`
- New endpoints:
  - `GET /api/chatbot/{domainId}/config` — fetch widget config
  - `PUT /api/chatbot/{domainId}/config` — update config (name, welcome message, color, position, system prompt, knowledge base)
  - `GET /api/chatbot/{domainId}/conversations` — paginated conversation list
  - `GET /api/chatbot/{domainId}/conversations/{id}` — full conversation thread
  - `POST /api/chatbot/widget/{token}/message` — public endpoint called by embedded widget

### Dashboard
- `/dashboard/website-chatbot` — remove "Coming Soon" gate; add:
  - Widget preview (live iframe)
  - Settings form: bot name, welcome message, brand color, position (bottom-right / bottom-left), knowledge base textarea
  - Conversation inbox: list of all visitor chats with domain, date, message preview
  - Embed snippet with copy button

### Plan Gating
- `website_chatbot` feature flag: Free = off, Pro = on (limited conversations/month), Business = on unlimited

---

## Phase 3 — SEO Monitor Packages

Expand EYE into a multi-platform SEO health monitoring product. Packages install on subscriber websites, scan pages for SEO issues, and report back to the EYE dashboard.

### Architecture

```
Subscriber's website (any platform)
  -> package captures rendered HTML
  -> POST /api/v1/track/seo  { X-Eye-Token: script_token }
  -> EYE backend stores audit in seo_audits table
  -> /dashboard/seo shows score + issues + trends
```

The existing `SeoCheckerController` already implements all 17 audit checks (title, meta description, headings, images, canonical, OG tags, Twitter Card, structured data, robots meta, viewport, lang, HTTPS, content length, links, HTTP status). Reuse this logic in the ingest path.

---

### 3.1 — Backend & Dashboard Foundation

*(All packages depend on this)*

**Database**
- New table: `seo_audits` — `id, domain_id, url, score, issues (jsonb), checked_at`

**Endpoints**
- `POST /api/v1/track/seo` — token-authenticated (X-Eye-Token, no Sanctum); accepts `{ url, html?, issues[], score }` payload; rate-limited per token; resolves domain from token
- `GET /api/v1/domains/{domain}/seo/summary` — aggregate score, top issues by severity, % of URLs with issues
- `GET /api/v1/domains/{domain}/seo` — paginated URL-level audit history with score + issue count

**Dashboard**
- `/dashboard/seo` — new page:
  - Score gauge (0–100) with colour coding (red < 50, amber 50–79, green >= 80)
  - Issues breakdown: count by severity (critical / high / warning / info)
  - URL-level table: URL, score, top issue, last checked
  - 30-day score trend line chart
  - Install snippet showing how to add the package

**Plan Gating**
- `seo_monitoring` feature flag: Free = off, Pro = on (30-day retention, 500 URLs/month), Business = on (full retention, unlimited URLs)

---

### 3.2 — PHP Composer Package

**Package:** `eye-analytics/seo-monitor` on Packagist

**Core class `EyeSeoMonitor`**
- Captures rendered HTML via output buffering
- Runs lightweight DOM checks (title, meta, h1, images, canonical, OG, lang, viewport)
- Fires async non-blocking cURL POST to `/api/v1/track/seo` (CURLOPT_TIMEOUT_MS = 500, best-effort — never blocks response)
- Config: `token`, `api_url`, `auto_fix` (bool, default false), `exclude_paths` (array)

**Auto-Fix mode** (`auto_fix: true`): uses output buffering to inject missing `<title>`, `<meta name="description">`, OG tags before response is flushed — invisible to app code, visible to crawlers

**Adapters**

| Adapter | Integration |
|---|---|
| **Laravel** | ServiceProvider auto-registers `EyeSeoMiddleware`; config published via `php artisan vendor:publish --tag=eye-seo` |
| **WordPress** | Plugin file (`eye-seo-monitor.php`) bootstraps Composer autoloader; hooks into `shutdown` action; WP Settings API page under Settings → EYE SEO |
| **CodeIgniter 4** | After-filter class registered in `app/Config/Filters.php` |
| **CodeIgniter 3** | `post_controller_constructor` hook in `application/config/hooks.php` |
| **Native PHP** | Single `include 'EyeSeo.php'` at bottom of page; uses `ob_start()` / `ob_get_clean()` |

**Install example (Laravel):**
```bash
composer require eye-analytics/seo-monitor
php artisan vendor:publish --tag=eye-seo
# Set EYE_SEO_TOKEN=your_script_token in .env
```

---

### 3.3 — JavaScript npm Package

**Package:** `@eye-analytics/seo-monitor` on npm

**Core module**
- DOM-based scanner running on `DOMContentLoaded`
- Checks: `<title>`, `<meta description>`, `<h1>` count, image `alt` attributes, canonical, OG tags, lang attribute, viewport, HTTPS
- Sends audit via `fetch` (or `sendBeacon` on page hide) to EYE ingest endpoint
- Config: `token`, `apiUrl`, `autoFix` (bool), `excludePaths` (array)

**Adapters**

| Adapter | Integration |
|---|---|
| **Vanilla / CDN** | `<script src="eye-seo.min.js" data-token="..."></script>` |
| **React** | `useSeoMonitor(token)` hook + optional `<EyeSeoProvider token="...">` wrapper |
| **Next.js** | `withEyeSeo(nextConfig)` wrapper in `next.config.mjs` + `instrumentation.ts` for server-side SSR scanning via `cheerio` |
| **Vue 3** | `app.use(EyeSeoPlugin, { token })` |
| **Angular** | `EyeSeoModule.forRoot({ token })` in `AppModule` |
| **Node.js / NestJS** | Express/Fastify middleware — parses SSR HTML response with `cheerio` before send |

**Install example (Next.js):**
```bash
npm install @eye-analytics/seo-monitor
```
```ts
// instrumentation.ts
import { EyeSeoInstrumentation } from '@eye-analytics/seo-monitor/next'
export const register = EyeSeoInstrumentation({ token: process.env.EYE_SEO_TOKEN })
```

---

### 3.4 — Platform-Specific Apps

**WordPress Standalone Plugin**
- Distributed via WordPress.org plugin directory + direct download from EYE dashboard
- No Composer required — uses WP HTTP API (`wp_remote_post`) for all HTTP calls
- Adds admin page: Settings → EYE SEO (token input, auto-fix toggle, excluded paths)
- WP Cron job: nightly full-site crawl of all published posts/pages → batch audit
- WordPress.org review timeline: ~2–4 weeks; distribute directly meanwhile

**Shopify App**
- Shopify Partners app with Theme App Extension + Script Tag injection
- OAuth flow: merchant installs app → EYE creates domain record → returns script_token → stored in Shopify metafield
- Listens to `themes/publish` webhook → triggers full store audit
- Surfaces issue count + score in app embed block in Theme Editor
- Requirement: Shopify Partners program enrollment + app review (~2–4 weeks)

**No-Code Website Builders (Webflow, Squarespace, Wix, Framer)**
- Uses the vanilla JS package — no approval needed
- Dashboard shows a one-liner snippet: `<script src="eye-seo.min.js" data-token="..."></script>`
- Users paste it in Custom Code / Header injection panel of their builder
- Instructions page in EYE dashboard per platform

---

### 3.5 — Effort & Dependencies

| Component | Complexity | External Blocker |
|---|---|---|
| Backend + dashboard (3.1) | Medium | None — infra exists |
| PHP Composer package (3.2) | Low–Medium | None |
| npm package (3.3) | Low–Medium | None |
| WordPress standalone plugin (3.4) | Medium | WP.org review (~2–4 weeks) |
| Shopify App (3.4) | High | Partners enrollment + review |
| Webflow / Wix / Squarespace (3.4) | Low | None |

---

## Implementation Order (Recommended)

1. **Phase 2 backend unblocking** — replay tables + endpoints, chatbot config/conversation tables + endpoints, AI chat endpoints
2. **Phase 2 dashboard** — replay player, AI chat panel, website chatbot settings page
3. **SEO backend + dashboard (3.1)** — foundation for all packages
4. **PHP Composer package (3.2)** + **npm package (3.3)** — parallel development
5. **WordPress standalone plugin** — after packages are stable
6. **Shopify App** — start Partners enrollment early; develop in parallel with plugins
7. **Builder snippets** — publish docs/snippets once JS package ships
