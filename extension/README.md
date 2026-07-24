# EYE Social Manager (Chrome extension) — v0.1

Unified inbox for Facebook/X/Instagram comments and DMs. Runs entirely against
the user's own logged-in session in their own browser — the extension never
sees or stores a platform password/cookie/session token. It only reads what's
already rendered on a page the user has open, and only *fills* a reply box
with an AI-drafted reply — the user still clicks Send/Reply themselves on the
platform's own button.

## What's real vs. what needs testing

- **X (Twitter)** (`content/x.js`): built against X's public `data-testid`
  attributes, which are relatively stable. Should work for scraping
  mentions/replies and filling the reply compose box, but hasn't been tested
  against a live account from this environment (no browser available here) —
  verify before relying on it.
- **Facebook / Instagram** (`content/facebook.js`, `content/instagram.js`):
  explicitly marked **best-effort / unverified** in the file comments. Both
  platforms use obfuscated, frequently-rotating class names with no stable
  public equivalent to `data-testid` — the selectors used here (aria-labels,
  generic role attributes) are a starting point, not a finished scraper.
  Load the extension, open a real logged-in tab, and check the console / the
  popup's inbox list to see what is/isn't being picked up, then adjust the
  `TODO(verify)` lines in those two files.

## Load it (unpacked, for development)

1. `chrome://extensions` → enable **Developer mode** (top-right toggle).
2. **Load unpacked** → select this `extension/` folder.
3. Click the EYE icon in the toolbar → log in with your EYE account
   (same email/password as the dashboard).
4. Open a Facebook/X/Instagram tab you're logged into, browse comments/DMs —
   the content script scrapes visible items every ~1.5s after DOM changes and
   syncs them to `/api/v1/social/inbox/sync`.
5. Open the popup → see the unified inbox, click **AI Draft**, edit if
   needed, **Insert into page** (fills the compose box on the matching open
   tab), then send it yourself on the platform.

Options page (right-click the icon → Options) lets you point at a
local/staging API instead of production, for testing.

## Scheduled posts (compose on the dashboard, extension fills it in)

Compose/schedule posts from the **EYE dashboard → Social Manager → Compose &
Schedule** tab (AI-drafts the text via Claude, optionally an image via your
own OpenAI key, in the language you pick). The extension polls
`GET /scheduled-posts/due` every 2 minutes in the background; once a post's
time arrives you get a Chrome notification with an **"Open & fill"** button —
clicking it opens the platform (X opens straight into the compose box;
Facebook/Instagram open the home feed, since neither has a stable direct
"new post" URL) and fills in the drafted text using the same
`EYE_FILL_REPLY_ON_PAGE` mechanism the inbox reply uses. **You still click
Post yourself** — same no-auto-submit rule as everywhere else in this
extension. Reliable auto-fill is only expected on X for the reasons in the
section above; Facebook/Instagram may need you to open the composer manually
and use the dashboard's copied text.

## Backend

- Migration: `2026_07_14_000001_create_social_inbox_items_table.php`
- Model: `App\Models\SocialInboxItem`
- Controller/routes: `App\Http\Controllers\Social\SocialInboxController`
  → `GET /social/inbox`, `POST /social/inbox/sync`,
  `POST /social/inbox/{id}/draft`, `POST /social/inbox/{id}/status`
  (all under the `subscribed` gate, same as `leads/`).
- CORS: `config/cors.php` now allows any `chrome-extension://` origin
  (auth is via Bearer token, not cookies, so this only affects preflight).

## Not built (by design — see conversation)

No server-side "always on" scheduling and no auto-submit. Both would require
going through each platform's official API (Graph API / X API v2) instead of
DOM automation — flagged as a separate, later piece of work if still wanted.
