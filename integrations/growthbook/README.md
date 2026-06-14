# GrowthBook + EYE (rigorous A/B experiments)

EYE's built-in A/B feature is measurement-only. For real experimentation —
sequential/Bayesian significance, sample-size & duration, SRM checks, and a
visual/SDK assignment layer — run experiments through **GrowthBook** (open-source,
self-hostable) and let EYE **pull the experiments via the GrowthBook REST API and
overlay your revenue per variant**.

Division of labour:
- **GrowthBook**: variant assignment (SDK), the rigorous stats engine.
- **EYE**: revenue/ROAS context — revenue attributed to each variant from the
  exposure events EYE already captures.

---

## 1. Run GrowthBook
Self-host (recommended) with Docker, or use GrowthBook Cloud:
```bash
docker run -d -p 3100:3000 -p 3300:3100 growthbook/growthbook
```
(See https://docs.growthbook.io/self-host for a production compose file.)

## 2. Point GrowthBook at EYE's ClickHouse (its data source)
In GrowthBook → **Metrics and Data → Data Sources → Add → ClickHouse**, use the
same ClickHouse EYE writes to. Then define:
- **Experiment assignment query** from EYE's exposures:
  ```sql
  SELECT
    visitor_id AS user_id,
    ts AS timestamp,
    JSONExtractString(props, 'exp')     AS experiment_id,
    JSONExtractString(props, 'variant') AS variation_id
  FROM custom_events
  WHERE name = 'experiment'
  ```
- A **revenue metric** from `conversions` (sum of `value` per `visitor_id`) and/or
  a **conversion metric** from `conversions` (count of `order_id`).

## 3. Create a REST API key
GrowthBook → **Settings → API Keys → Create** (a *secret* key with read access).

## 4. Configure EYE
Set on the backend (`backend/.env`):
```
GROWTHBOOK_API_HOST=https://growthbook.your-domain.com
GROWTHBOOK_API_KEY=secret_xxx
```
EYE's **Experiments** page will now show a "GrowthBook experiments" panel
(otherwise it shows a connect prompt).

## 5. Instrument the client site
Install the GrowthBook SDK and make its tracking callback also tell EYE, so EYE
can attribute revenue to the variant:

```html
<script async src="https://cdn.jsdelivr.net/npm/@growthbook/growthbook/dist/bundles/auto.min.js"
        data-api-host="https://growthbook.your-domain.com"
        data-client-key="sdk-xxx"></script>
<script>
  window.growthbook_config = {
    trackingCallback: function (experiment, result) {
      // Mirror the exposure into EYE for revenue overlay.
      if (window.EYE && EYE.experiment) {
        EYE.experiment(experiment.key, result.variationId ?? result.key);
      }
    }
  };
</script>
```
Use EYE's existing `EYE.purchase(value, currency, orderId)` on the order page so
revenue flows into `conversions` and lines up with the exposures.

---

## How EYE uses it
- `GET /api/v1/analytics/{domainId}/experiments/growthbook` — lists GrowthBook experiments.
- `GET /api/v1/analytics/{domainId}/experiments/growthbook/{id}/results` — GrowthBook
  results + EYE's revenue-per-variant overlay (matched on the experiment `trackingKey`).
- Backend client: `app/Services/GrowthBookService.php`. Config: `config/services.php → growthbook`.
- Everything degrades gracefully when GrowthBook isn't configured.
