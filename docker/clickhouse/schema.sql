-- ============================================================
-- EYE Analytics — ClickHouse schema
-- Run once against the analytics database (default: eye_analytics)
-- ============================================================

-- ── Main events table ────────────────────────────────────────────────────────
--  One row per tracker event. Partitioned by month for cheap TTL drops.

CREATE TABLE IF NOT EXISTS events
(
    domain_id    UInt64,
    session_id   UUID,
    visitor_id   UUID,
    type         LowCardinality(String),   -- pageview | custom | pageleave | …
    url          String,
    referrer     String,
    title        String,
    props        Map(String, String),       -- custom event properties
    screen_w     UInt16,
    screen_h     UInt16,
    duration     UInt32,                   -- seconds on page (pageleave only)
    country      LowCardinality(String),
    region       LowCardinality(String),
    city         String,
    os           LowCardinality(String),
    browser      LowCardinality(String),
    device_type  LowCardinality(String),   -- desktop | mobile | tablet | bot
    ip_hash      FixedString(64),          -- SHA-256 of IP (never store raw IP)
    ts           DateTime('UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (domain_id, ts, session_id)
TTL ts + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;


-- ── Sessions table ───────────────────────────────────────────────────────────
--  Aggregated per session — materialised from events at write time.

CREATE TABLE IF NOT EXISTS sessions
(
    domain_id    UInt64,
    session_id   UUID,
    visitor_id   UUID,
    entry_url    String,
    exit_url     String,
    country      LowCardinality(String),
    os           LowCardinality(String),
    browser      LowCardinality(String),
    device_type  LowCardinality(String),
    referrer     String,
    utm_source   LowCardinality(String),
    utm_medium   LowCardinality(String),
    utm_campaign String,
    pageviews    UInt16,
    duration     UInt32,
    bounced      UInt8,                    -- 1 = single pageview
    company_name Nullable(String),         -- enriched from IP/domain via EnrichCompanyJob
    started_at   DateTime('UTC'),
    ended_at     DateTime('UTC')
)
ENGINE = ReplacingMergeTree(ended_at)
PARTITION BY toYYYYMM(started_at)
ORDER BY (domain_id, session_id)
TTL started_at + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;


-- ── UX events table ──────────────────────────────────────────────────────────
--  Rage clicks, dead clicks, JS errors, scroll depth.

CREATE TABLE IF NOT EXISTS ux_events
(
    domain_id        UInt32,
    session_id       String,
    visitor_id       String,
    type             LowCardinality(String),  -- rage_click | dead_click | js_error | click | page_load | slow_resources | …
    url              String,
    element_selector String,
    details          String,                  -- JSON payload (coords for clicks, timings for page_load, resources for slow_resources)
    created_at       DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (domain_id, created_at)
TTL created_at + toIntervalDay(365)
SETTINGS index_granularity = 8192;


-- ── Custom events table ──────────────────────────────────────────────────────
--  High-cardinality custom event names kept separate for easy querying.

CREATE TABLE IF NOT EXISTS custom_events
(
    domain_id  UInt64,
    session_id UUID,
    visitor_id UUID,
    name       String,
    props      Map(String, String),
    url        String,
    ts         DateTime('UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (domain_id, ts, name)
TTL ts + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;


-- ── Pipeline events table ────────────────────────────────────────────────────
--  Which step in which pipeline was reached per session.

CREATE TABLE IF NOT EXISTS pipeline_events
(
    domain_id   UInt64,
    pipeline_id UInt64,
    step_id     UInt64,
    step_order  UInt16,
    session_id  UUID,
    visitor_id  UUID,
    url         String,
    ts          DateTime('UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (domain_id, pipeline_id, ts)
TTL ts + INTERVAL 365 DAY DELETE
SETTINGS index_granularity = 8192;


-- ── Session replay events ────────────────────────────────────────────────────
--  Raw rrweb-style events stored as compressed JSON strings.

CREATE TABLE IF NOT EXISTS replay_events
(
    domain_id  UInt64,
    session_id UUID,
    type       UInt8,
    data       String,  -- JSON blob (compressed at application layer)
    ts         DateTime('UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (domain_id, session_id, ts)
TTL ts + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;
