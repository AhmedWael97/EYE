/*
 * EYE Analytics — Shopify Custom Web Pixel (alternative method)
 *
 * WHERE: Settings → Customer events → Add custom pixel → paste this code.
 *
 * Use this ONLY if your store is on Checkout Extensibility and the Order status
 * page "Additional scripts" box is unavailable. Prefer order-status.liquid when
 * you can — see the attribution note below.
 *
 * Replace the two placeholders:
 *   __EYE_API_URL__  → your EYE backend/API URL (no trailing slash)
 *   __EYE_TOKEN__    → the data-token from your EYE domain settings
 *
 * ── Attribution note ───────────────────────────────────────────────────────
 * Web pixels run in a sandbox and CANNOT read the EYE visitor cookie that the
 * storefront tracker sets. We pass Shopify's clientId as the visitor id, which
 * does not match the storefront visitor id — so a purchase tracked this way is
 * generally attributed to "(direct)" rather than the original campaign. For
 * full last-touch, cross-session attribution, use order-status.liquid.
 */
analytics.subscribe("checkout_completed", (event) => {
  try {
    const checkout = event.data.checkout || {};
    const total = checkout.totalPrice ? Number(checkout.totalPrice.amount) : 0;
    const currency = checkout.currencyCode || "";
    const orderId = String((checkout.order && checkout.order.id) || checkout.token || "");
    const clientId = event.clientId || "";
    const href =
      (event.context &&
        event.context.document &&
        event.context.document.location &&
        event.context.document.location.href) ||
      "";

    fetch("__EYE_API_URL__/api/track", {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // simple request — no CORS preflight
      keepalive: true,
      body: JSON.stringify({
        t: "__EYE_TOKEN__",
        e: "purchase",
        u: href,
        vid: clientId,
        sid: clientId,
        p: { value: total, currency: currency, order_id: orderId },
      }),
    });
  } catch (e) {
    /* swallow — never break the merchant's checkout */
  }
});
