# EYE Analytics — WordPress Plugin

Install EYE on any WordPress site in one click — no theme editing, no code.

## Install
1. Download **`eye-analytics.zip`**.
2. WordPress admin → **Plugins → Add New → Upload Plugin** → choose the zip → **Install Now → Activate**.
3. **Settings → EYE Analytics** → paste your **site token** (from your EYE dashboard → Settings → Domains) → **Save**.

Done. The tracker loads on every front-end page automatically. Your EYE dashboard lights up the moment the first visitor arrives.

## What it does
- Injects the `eye.js` snippet in `<head>` on every public page (skips wp-admin).
- Token stored as a WordPress option; no data leaves your site except the standard EYE tracking calls.
- Cookieless, < 2 KB, async — no performance hit, no cookie banner needed.

## Build the zip (maintainers)
```
cd integrations/wordpress
zip -r eye-analytics.zip eye-analytics
```
Publish `eye-analytics.zip` to the frontend `public/downloads/` folder so the dashboard's
"Download WordPress plugin" button serves it.
