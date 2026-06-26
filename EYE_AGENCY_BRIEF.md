# EYE Analytics — Full Product Description & Agency Plan

> **Purpose of this document:** A complete, detailed description of the EYE Analytics platform and its Agency offering. Use this as the source material to generate a polished, persuasive PDF aimed at marketing agencies. Every feature listed below is real and shipping. Tone for the final PDF: confident, professional, agency-focused, benefit-led.

---

## 1. One-Line Pitch

**EYE is a privacy-first, AI-powered visitor-analytics platform that lets agencies run analytics, conversion optimization, session replay, SEO, and revenue attribution for all of their clients from a single dashboard — white-labeled, multi-seat, and built for teams.**

Think Mixpanel + Hotjar + an SEO suite + an A/B testing studio + revenue attribution — unified, affordable, and bilingual (English + Arabic / RTL).

---

## 2. Who It's For

- **Marketing & growth agencies** managing many client websites.
- **Web design / dev studios** who want to offer analytics as a retained service.
- **Performance / paid-media teams** that need ROAS, CPA, and attribution per client.
- **SEO agencies** needing crawls, rank tracking, and technical audits.
- **In-house growth teams** running multiple brands or properties.

The core promise to agencies: **manage every client, every site, and every team member in one place — and put your own brand on it.**

---

## 3. The Problem EYE Solves

Agencies today stitch together 5–8 tools per client: one for analytics, one for heatmaps, one for session replay, one for SEO, one for A/B testing, one for attribution, one for reporting. This means:

- Multiple logins, multiple bills, multiple data silos per client.
- No single cross-client view — no way to see which client is bleeding money this week.
- Manual, time-consuming client reporting.
- No white-label — clients see other vendors' brands, not the agency's.

**EYE consolidates all of it into one platform, with a cross-client "portfolio" command center, white-labeling, and team seats.**

---

## 4. Core Capabilities (Full Feature Inventory)

### 4.1 Real-Time Analytics
- Live visitor dashboard (powered by WebSockets / Laravel Reverb).
- Pageviews, sessions, traffic sources, geography, devices.
- Built on ClickHouse for fast queries over large event volumes.
- Privacy-first: no cookie banners required for core tracking; respects opt-outs and Do-Not-Track. Includes visitor opt-out and data-deletion request handling (GDPR-friendly).

### 4.2 Behavior & UX Analytics
- **Click heatmaps** — full-page screenshots with click density overlaid, accurate at any scroll depth (coordinates stored as % of page).
- **Scroll-depth tracking** — 25 / 50 / 75 / 100% milestones, plus "excessive scroll" frustration detection.
- **Rage clicks** (≥3 rapid clicks in a small area) and **dead clicks** (clicks with no effect).
- **Quick-back** detection (visitor bounced in under 5 seconds).
- **Form abandonment** tracking.
- **Broken-link** detection (404s clicked by real users).
- **JavaScript error** capture (uncaught errors + unhandled rejections).
- **UX scores** — automatic scoring of page experience.

### 4.3 Session Replay (Smart, Criteria-Based)
- Records real user sessions (via rrweb) and replays them like a video.
- **Smart upload:** only sessions that *qualify* are uploaded — those showing friction/intent (rage click, dead click, JS error, form abandon, quick-back, broken link, purchase) or strong engagement (≥10s + ≥3 interactions). No wasted storage on empty sessions.
- **Timeline markers** overlay notable events (rage clicks, errors) on the replay scrubber.
- **Funnel → replay:** click any funnel drop-off step and watch the sessions that abandoned there.
- Privacy controls: mask/block sensitive elements via `eye-mask` / `eye-block` classes.

### 4.4 Performance Monitoring
- **Web Vitals** — LCP, CLS, INP captured from real users.
- **Page load timing** — TTFB, DOM interactive, DOM complete, load event, transfer/decoded sizes.
- **Slow resources** — flags any asset (image, script, CSS, font, fetch) taking over 1 second to load.

### 4.5 Conversion & Revenue Attribution
- **Sales tracking** — `EYE.purchase(value, currency, orderId)` plus auto-fired events from e-commerce integrations. Deduplicated by order ID.
- **Attribution models** — last-touch, first-touch, linear, and time-decay. Multi-touch revenue is split fractionally.
- **Campaigns dashboard** — Revenue, Orders, Spend, ROAS, and CPA per campaign.
- **Ad spend / ROAS** — manual entry or CSV import of ad spend → automatic ROAS and CPA columns.
- **Channel Mix** — revenue, sessions, spend, and ROAS aggregated by marketing channel, with cross-channel budget suggestions.
- **LTV by source** — average lifetime value per visitor, broken down by first-touch acquisition source.
- **Cohort retention** — weekly/monthly cohort grids showing how visitors return over time.

### 4.6 Funnels & Pipelines
- Define multi-step conversion pipelines (URL-pattern based).
- See where users drop off at each step.
- Jump straight from a drop-off into session replays of users who abandoned there.

### 4.7 A/B Testing & Experiments (Visual, No-Code)
- **A/B Studio** — a dedicated workspace for experimentation.
- **No-code visual editor** — agencies build tests without writing code. Two test types:
  - **A/B (same page):** each variation injects custom CSS and/or JS.
  - **Split URL:** each variation redirects to a different page.
- Deterministic, weighted traffic splitting; sticky per visitor.
- **Statistical results** — visitors seen, converters, conversion rate, uplift vs control, and a two-proportion z-test for significance (95%), plus revenue per variation.
- Built-in CodeMirror editors for variation JS/CSS.
- **Enterprise integrations:** GrowthBook and Convert.com integrate natively — EYE overlays its own revenue-per-variant data on top of their statistical engines.

### 4.8 AI-Powered Insights
- **AI reports** — automated, plain-language analysis of what's happening on a site (powered by Claude).
- **AI suggestions** — actionable recommendations.
- **Audience segments** and **company enrichment** (B2B): identify which companies are visiting (via IP enrichment), surfacing warm leads.

### 4.9 SEO Suite
- **Single-page SEO check** — scores a page on title, meta description, H1/H2, image alt text, canonical, Open Graph, Twitter cards, Schema.org, robots meta, viewport, lang attribute, HTTPS, content length, link counts, and HTTP status.
- **Full-site crawl** — BFS-crawls internal links (up to 20 pages) and returns a site-wide SEO score with per-page issues.
- **SEO rank tracking** — track keyword positions over time; CSV import of rankings; trend charts.

### 4.10 Growth & Outreach Engine (Compliant)
- **Warm leads** — identifies companies that visited the client's site (IP enrichment ⋈ company data).
- **Lead management** — CRUD + CSV import.
- **AI-drafted outreach** — Claude drafts review-ready outreach emails (never auto-sent).
- Built-in suppression lists, per-user daily send caps, automatic unsubscribe links, and bounce/complaint handling. Fully opt-out compliant.

### 4.11 Alerts & Anomaly Detection
- Rule types: traffic drop, traffic anomaly (z-score vs 14-day same-hour baseline), error spike, conversion drop, quota warning.
- Delivered via **Slack or Discord** webhooks (and in-app notifications).
- **Bulk apply defaults** — one click creates sensible alert rules across every domain.
- Runs automatically every 15 minutes.

### 4.12 Integrations
- **WooCommerce** plugin (auto-fires purchase tracking on thank-you page).
- **Shopify** snippets (+ Web Pixel fallback).
- **GrowthBook** and **Convert.com** for experimentation.
- **Webhooks** for custom integrations.
- **API access** for programmatic data retrieval.

---

## 5. The Multi-Site / Agency Command Center

This is the heart of EYE's value to agencies.

### 5.1 Portfolio Overview
A single dashboard spanning **all of the agency's client domains**:
- Per-domain KPI table with deltas vs the prior period.
- See traffic, revenue, conversions, and ROAS for every client at a glance.
- **Portfolio benchmarks** — automatically flags sites performing well below the portfolio median on conversion rate, ROAS, or bounce.

### 5.2 Cross-Site Triage (Money-at-Stake Ranking)
- An automatically ranked list of cross-client issues: low ROAS, revenue drops, traffic drops, error spikes, missing ad-spend data.
- **Sorted by money at stake** — so the agency always knows which client to act on first.
- Click any issue to deep-link straight into that client's relevant page.

### 5.3 Budget Recommendations
- Per-campaign guidance: pause campaigns with ROAS < 1, scale those with ROAS ≥ 3, flag missing spend data.
- Deterministic and explainable — no black box.

### 5.4 Branded Portfolio Reports
- Print-optimized, white-labeled report (totals, priorities, per-site table).
- One-click "print to PDF" — client-ready deliverables in seconds.
- App chrome hides automatically on print.

---

## 6. The Agency Plan (Detailed)

> This is the plan to sell. EYE offers four tiers; the **Agency** plan is purpose-built for agencies and is currently offered **free** as a strategic acquisition play.

### 6.1 Plan Comparison

| Capability | Free | Pro ($29/mo) | Business ($99/mo) | **Agency** |
|---|---|---|---|---|
| Real-time dashboard | ✅ | ✅ | ✅ | ✅ |
| Email reports | — | ✅ | ✅ | ✅ |
| AI insights | — | ✅ | ✅ | ✅ |
| Session replay | — | ✅ | ✅ | ✅ |
| Company enrichment (B2B) | — | — | ✅ | ✅ |
| Custom pipelines / funnels | — | ✅ | ✅ | ✅ |
| API access | — | ✅ | ✅ | ✅ |
| **White-label** | — | — | ✅ | ✅ |
| **Team accounts (multi-seat)** | — | — | — | ✅ |
| Client domains | 1 | 5 | Unlimited | **5** |
| Events per day | 10K | 100K | 1M | **200K** |
| Data retention | 30 days | 90 days | 365 days | **90 days** |
| Team members (seats) | 1 | 5 | Unlimited | **10** |
| Webhooks | 0 | 5 | Unlimited | **10** |
| Export jobs | 0 | 50 | Unlimited | **100** |
| AI reports / month | 0 | 20 | Unlimited | **50** |

### 6.2 What Makes the Agency Plan Unique

The Agency plan is the **only** plan with true **team accounts (multi-seat organizations)**, and it bundles every premium capability:

- **Up to 5 client domains** managed under one organization.
- **Up to 10 employee seats** — each a real user account.
- **Role-based access:**
  - **Owner** — billing + full control of everything.
  - **Admin** — manage the team and all client domains.
  - **Member** — access only the specific client domains they're assigned to.
- **Per-member domain grants** — assign each team member exactly the clients they should see. A junior on Client A's account never sees Client B's data.
- **Email invitations** — invite teammates by email; invitations expire and are token-secured.
- **White-label** — put the agency's brand on dashboards and reports, not EYE's.
- **Full premium stack included** — AI insights, session replay, company enrichment, custom funnels, API access, 50 AI reports/month, 200K events/day, 90-day retention.

### 6.3 Why It's Free (Positioning)

The Agency plan is offered **at no monthly cost** as a deliberate growth strategy: get agencies in, let them run all their clients, and grow with them. For the PDF, frame this as:

> *"We built EYE to grow with agencies. That's why the Agency plan — multi-seat, white-labeled, full premium stack — is free. Onboard your whole client roster with zero risk."*

(If needed, paid expansion paths — more domains, more seats, higher event volumes — can be offered as add-ons or a custom Enterprise tier.)

---

## 7. Bilingual & RTL-First

- Fully translated **English (LTR)** and **Arabic (RTL)** interfaces.
- Every user-facing string is localized; layouts adapt to RTL.
- A major differentiator for agencies serving MENA / Arabic-speaking markets — most Western analytics tools have no real Arabic support.

---

## 8. Privacy & Compliance

- Privacy-first by design — minimal data collection, no invasive fingerprinting required.
- Visitor opt-out support and Do-Not-Track respect.
- Data-deletion request handling.
- Session replay masking of sensitive fields.
- Outreach engine is fully consent/opt-out compliant (suppression lists, unsubscribe, bounce handling).
- Two-factor authentication (2FA) with backup codes.
- Audit logs and impersonation logs for accountability.

---

## 9. Billing & Payments

- **Paymob** (primary gateway) + **manual bank transfer**.
- **Geo-aware currency** — Egyptian visitors see and are charged in EGP; others see USD.
- 30-day free trial on signup; clean subscription gating.
- Monthly and yearly billing (yearly ≈ 2 months free on paid tiers).

---

## 10. Reliability & Scale (Trust Signals for the PDF)

- **ClickHouse** analytics store — handles large event volumes with fast queries.
- **PostgreSQL** (via PgBouncer) for relational data.
- **Redis** caching + queues, **Laravel Horizon** queue monitoring.
- **Sentry** error monitoring (backend + frontend).
- **Laravel Reverb** for real-time WebSocket updates.
- Lightweight tracker script (**under 5 KB gzipped**, CI-enforced) — won't slow client sites.
- Dockerized deployment.

---

## 11. Onboarding (How an Agency Gets Started)

1. Sign up and select the **Agency** plan.
2. Create the agency organization.
3. Add client domains (up to 5) and drop the lightweight tracking snippet on each client site (one line; optional `data-replay` for session replay).
4. Invite team members by email and assign them to specific client domains.
5. Apply default alerts across all domains in one click.
6. Open the Portfolio dashboard — every client, one screen.
7. Generate branded PDF reports for clients on demand.

---

## 12. Key Selling Points to Headline in the PDF

1. **All-in-one** — analytics, heatmaps, replay, SEO, A/B testing, attribution, and AI in one tool.
2. **Built for managing many clients** — Portfolio overview + money-at-stake triage.
3. **White-label** — your brand, not ours.
4. **Team seats with granular access** — 10 employees, per-client permissions.
5. **AI that does the analysis for you** — reports, suggestions, anomaly detection.
6. **Revenue attribution & ROAS** — prove your value to clients in dollars.
7. **Bilingual EN/AR + RTL** — a real edge in Arabic-speaking markets.
8. **Privacy-first & compliant** — GDPR-friendly, no creepy tracking.
9. **Free Agency plan** — onboard your whole roster at zero risk.
10. **Lightweight & fast** — sub-5KB tracker that won't hurt client performance or SEO.

---

## 13. Suggested PDF Structure (for Gemini)

1. **Cover** — logo, tagline: *"One platform to run analytics for every client."*
2. **The agency problem** (Section 3) — the tool sprawl pain.
3. **Meet EYE** — the all-in-one solution (Section 1 + 12).
4. **The Agency Command Center** — Portfolio, triage, branded reports (Section 5). Hero feature.
5. **Full capability tour** — visually grouped (Section 4), with icons per category.
6. **The Agency Plan** — the comparison table + what's unique + "it's free" (Section 6).
7. **Why agencies choose EYE** — the 10 selling points (Section 12).
8. **Bilingual + Privacy** — differentiators (Sections 7 & 8).
9. **Getting started** — the 7-step onboarding (Section 11).
10. **Call to action** — "Start free today" + contact / signup link.

**Design direction for Gemini:** modern SaaS aesthetic, generous whitespace, an "eye"/vision visual motif, a calm professional palette (deep blue / teal accents), dashboard screenshots or mockups, comparison table styled as a clean pricing grid, benefit-led headlines (not feature jargon), and a strong final CTA.
