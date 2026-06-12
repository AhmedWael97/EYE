=== EYE Analytics for WooCommerce ===
Contributors: eyeanalytics
Tags: analytics, woocommerce, tracking, conversions, attribution
Requires at least: 5.6
Tested up to: 6.5
Requires PHP: 7.4
WC requires at least: 5.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add the EYE privacy-first analytics tracker to your store and automatically
report every WooCommerce order to EYE for campaign revenue attribution.

== Description ==

EYE Analytics for WooCommerce does two things:

1. **Installs the tracker** — adds the EYE tracking script to every page of your
   store (optional; turn off if you install it another way).
2. **Reports sales** — when a customer reaches the order-received ("thank you")
   page, the plugin fires `EYE.purchase(total, currency, order_number)` so the
   sale is attributed to the campaign / source that brought the visitor in
   (last-touch, cross-session).

No personal data is sent — only the order total, currency, and order number.

== Installation ==

1. Upload the `eye-analytics` folder to `/wp-content/plugins/`, or install the
   zip via Plugins → Add New → Upload Plugin.
2. Activate the plugin.
3. Go to **Settings → EYE Analytics** and enter:
   * **EYE Base URL** — your EYE installation, e.g. `https://app.your-eye-domain.com`
   * **Tracking Token** — the `data-token` from your EYE domain settings
4. Save. Sales will start appearing in the EYE **Campaigns** dashboard with
   revenue attributed per campaign.

== Frequently Asked Questions ==

= Will a page refresh double-count a sale? =
No. The plugin guards against re-sending within the browser session, and EYE
de-duplicates server-side by order number.

= I already install the tracker via my theme / tag manager. =
Turn off "Inject tracker" in the settings and only purchase reporting will run.

= Does it support High-Performance Order Storage (HPOS)? =
Yes.

== Changelog ==

= 1.0.0 =
* Initial release: tracker injection + WooCommerce purchase reporting.
