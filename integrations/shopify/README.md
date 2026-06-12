# EYE Analytics for Shopify

Track your storefront and attribute every Shopify sale to the campaign that
produced it (last-touch, cross-session) — the same revenue attribution EYE does
for any other site, with no app install.

Shopify has no PHP plugin model, so this integration is a small set of snippets
you paste into your store. There are **two methods** — use the first one if you
can; it gives the best attribution.

You'll need two values from your EYE dashboard (**Domain → Install Script**):

| Placeholder | Value |
|---|---|
| `__EYE_API_URL__` | Your EYE backend/API URL, no trailing slash — e.g. `https://api.your-eye-domain.com` |
| `__EYE_TOKEN__` | The `data-token` for this domain |

Find-and-replace both placeholders in the snippets before pasting.

---

## Method 1 — Theme + Order status scripts (recommended)

Best attribution: the EYE visitor cookie persists on the order status page, so
sales are correctly credited to the visitor's original campaign across sessions.

### Step 1 — Install the site-wide tracker
1. **Online Store → Themes → … → Edit code**
2. Open `layout/theme.liquid`
3. Paste the contents of [`tracker-head.liquid`](tracker-head.liquid) just before `</head>`
4. Save

### Step 2 — Track purchases
1. **Settings → Checkout**
2. Scroll to **Order status page → Additional scripts**
3. Paste the contents of [`order-status.liquid`](order-status.liquid)
4. Save

Place a test order — it should appear in the EYE **Campaigns** dashboard with
revenue attributed to its source/campaign within a minute or two.

---

## Method 2 — Custom Web Pixel (Checkout Extensibility fallback)

Use this only if the **Order status page → Additional scripts** box is not
available on your plan (some Checkout Extensibility stores).

1. **Settings → Customer events → Add custom pixel**
2. Name it "EYE Analytics", paste the contents of [`web-pixel.js`](web-pixel.js)
3. **Save** and **Connect**
4. Still add Step 1 (theme tracker) so your storefront traffic is tracked.

> ⚠️ **Attribution limitation:** web pixels run sandboxed and cannot read the
> EYE visitor cookie. Purchases tracked this way are usually credited to
> `(direct)` rather than the original campaign. Prefer Method 1 when possible.

---

## Optional: session replay

To record sessions for replay, add `data-replay="true"` to the tracker tag in
`tracker-head.liquid` (and in `order-status.liquid` if you want the order page
recorded too):

```html
<script async src="__EYE_API_URL__/tracker/eye.js"
        data-token="__EYE_TOKEN__"
        data-api="__EYE_API_URL__/api/track"
        data-replay="true"></script>
```

`eye.js` then lazy-loads the replay module. Use the `eye-block` / `eye-mask` CSS
classes on sensitive elements to exclude them from recordings.

---

## Notes

- **No double counting.** Method 1 uses Shopify's `first_time_accessed` guard;
  EYE additionally de-dupes by order number server-side, so both methods are
  safe against refreshes/retries.
- **Currency.** `checkout.total_price` is the order total in the currency's
  subunit (e.g. cents); the snippet divides by 100. If you sell in a
  zero-decimal currency (e.g. JPY) and see inflated totals, remove the `/ 100`.
- **What's sent.** Only the order total, currency, and order number — no
  personal/customer data.
