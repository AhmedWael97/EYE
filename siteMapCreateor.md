Plan: AI-Powered Analytics Sitemap Creator
What & why: Build a sitemap generator that cross-references three data sources — BFS crawler, EYE analytics (ClickHouse), and Claude AI — to produce insights no existing tool can: unreachable pages (crawlable but zero real visitors), hidden SPA routes (in analytics but not crawlable), and evidence-based priority/changefreq values.

Confirmed Decisions
Untracked domains: Crawl-only + AI analysis. Show a CTA banner: "Connect this domain to unlock traffic labels, click depth, and unreachable page detection."
Page limits: Free = 50 pages, Paid = 200 pages — enforced in controller before dispatching job
History: Kept forever
Scheduling: Phase 2 — paid users can configure weekly auto-regeneration. Separate sitemap_schedules table + Laravel Scheduler
Phase 1 — Backend
Step 1 — Migration (sitemap_jobs table)

Fields: id, user_id, domain_id (FK nullable), start_url, status enum (pending|crawling|enriching|analyzing|completed|failed), config JSON ({ max_pages, include_zero_traffic, include_analytics_only, date_range_days }), crawl_result JSON, analytics_result JSON, sitemap_result JSON, ai_analysis JSON, sitemap_xml text, pages_crawled int, error_message, completed_at

Step 2 — GenerateSitemapJob (queued, timeout 300s, tries 1)

Phase A — Crawl: BFS up to max_pages. Collect url, status_code, depth, <title>, Last-Modified header, canonical. Also parse sitemap.xml at root + robots.txt Sitemap directives to seed the queue. Reuse extractInternalLinks() and normaliseUrl() from SeoCheckerController.
Phase B — Analytics (only if domain_id set):
ClickHouse: pageviews + unique visitors per URL (last N days)
ClickHouse: entry_url counts from sessions table
ClickHouse: avg click depth using ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts) on events
Classify each URL: high_traffic (top 20%) / medium_traffic (mid 60%) / low_traffic (bottom, >0) / zero_traffic (crawled, 0 visits) / analytics_only (in analytics, not in crawl)
Phase C — Claude AI: Send URL patterns + title samples + traffic distribution summary → receive { site_type, site_type_confidence, strategy, priority_rules, changefreq_rules, recommendations[] }. Use AnthropicService::complete().
Phase D — Build: Merge all URLs, compute per-URL priority (traffic weight × AI category modifier), changefreq, lastmod, full metadata. Generate XML string. Store in sitemap_xml column.
Step 3 — SitemapController

POST /tools/sitemap/generate — validate URL, check plan limit (50/200), create job, dispatch, return { job_id }. Rate: 3/hour.
GET /tools/sitemap/{job} — return status + pages_crawled for progress polling
GET /tools/sitemap/{job}/download?format=xml|json|csv — file response. Rate: 20/min.
GET /tools/sitemap/history — list user's past jobs
Step 4 — Routes — add to api.php under auth:sanctum

Phase 2 — Frontend
Step 5 — API layer: Add SITEMAP_GENERATE, SITEMAP_STATUS, SITEMAP_DOWNLOAD, SITEMAP_HISTORY to routes.ts. Create frontend/src/api/sitemap.ts. Export sitemapApi from api.ts.

Step 6 — Page at frontend/src/app/[locale]/(app)/tools/sitemap-creator/page.tsx:

Form — URL input + options (max pages select, date range, toggle zero-traffic/analytics-only inclusion)
Progress — animated step indicator: Crawling… → Enriching analytics → AI analysis → Building sitemap. Polls GET /tools/sitemap/{job} every 2 seconds. Shows pages_crawled count live.
CTA banner — if the domain is not connected to EYE, show a card explaining the upgrade in insight
Results — 4 tabs:
Overview: stat cards (Total URLs / High Traffic / Unreachable / Hidden SPA) + AI site type badge + strategy text + recommendations
URL Table: sortable by pageviews / priority / click depth / depth. Filter by traffic label. Expandable rows with full metadata
Insights: AI recommendations rendered as severity cards (warning/info)
Download: XML / JSON / CSV buttons + copy-to-clipboard
Step 7 — i18n: Add sitemap.* namespace to en.json and ar.json

Step 8 — Navigation: Add Sitemap Creator card to frontend/src/app/[locale]/(app)/dashboard/reports/page.tsx and to the reportsHub group in AppSidebar.tsx

Phase 3 — Scheduling (Paid, after Phase 1–2)
New migration: sitemap_schedules table (user_id, domain_id, start_url, config, schedule_day enum, enabled, last_run_at)
SitemapScheduleController — create/update/delete schedule
Laravel Scheduler (console.php): weekly → query enabled schedules → dispatch GenerateSitemapJob
Frontend: Schedule toggle + day picker on the results page
Template files to reference
SeoCheckerController.php — BFS crawler, extractInternalLinks(), normaliseUrl()
AnalyzeDomainJob.php — queued job with ClickHouse + Claude pattern
AnthropicService.php — complete() interface
frontend/src/app/[locale]/(app)/tools/seo-checker/page.tsx — tools page UI pattern
Verification
php artisan migrate — migration applies cleanly
php artisan test --filter Sitemap — unit + feature tests pass
npm run build — frontend compiles, sitemap-creator route appears
Manual: generate for a tracked domain → confirm traffic labels present; generate for untracked → confirm CTA banner shown + crawl-only result
Manual: download XML → validate it against sitemaps.org schema
Ready to hand off to implementation. Approve and I'll switch to agent mode.