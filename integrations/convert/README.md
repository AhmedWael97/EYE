# Convert.com + EYE (A/B Studio)

EYE's **A/B Studio** can run experiments through **Convert.com (Convert Experiences)** —
a visual A/B testing engine with a stats engine — while EYE overlays your
**revenue per variant** from the data it already collects.

Division of labour (same model as our GrowthBook integration):
- **Convert.com**: variant assignment (visual editor / SDK) + A/B stats.
- **EYE**: revenue/ROAS overlay per variant, in the Studio.

---

## 1. Get your Convert.com API credentials
In Convert.com → **Settings → REST API**: create/copy your **Account ID**,
**Application ID**, and **API key/secret**.

## 2. Configure EYE (backend `.env`)
```
CONVERT_ACCOUNT_ID=xxxxxxxx
CONVERT_APPLICATION_ID=xxxxxxxx
CONVERT_API_KEY=xxxxxxxx
# optional, defaults to https://api.convert.com/api/v2
CONVERT_API_HOST=https://api.convert.com/api/v2
```
The A/B Studio's **Convert.com** panel will then list your experiences
(otherwise it shows a connect prompt).

## 3. Mirror exposures into EYE (for the revenue overlay)
So EYE can attribute revenue to each Convert variant, fire an EYE exposure when
Convert assigns a variant — from Convert's project JS / tracking hook:
```js
// when Convert activates an experience + variation:
if (window.EYE && EYE.experiment) {
  EYE.experiment(experienceKey, variationKey);
}
```
Use EYE's `EYE.purchase(value, currency, orderId)` on the order page so revenue
flows into `conversions` and lines up with the exposures. EYE matches a Convert
experience to exposures by its **key** (or name).

---

## How EYE uses it
- `GET /api/v1/analytics/{domainId}/experiments/convert` — lists Convert experiences.
- `GET /api/v1/analytics/{domainId}/experiments/convert/{id}/results` — Convert report
  + EYE's revenue-per-variant overlay.
- Backend client: `app/Services/ConvertService.php`. Config: `config/services.php → convert`.
- Degrades gracefully when Convert isn't configured.

> Convert's REST response shapes vary by account/plan; `ConvertService` reads
> defensively and normalises to `{ id, name, key, status, variations[] }`. If your
> account returns different field names, adjust the mapping in that service.
