# Local Backend Verification

Use this checklist after Docker Desktop is running.

## 1. Start PostgreSQL

```powershell
cd C:\junhee\finalproject\302-group5-final-project\services\backend
docker compose up -d postgres
```

## 2. Create `.env`

```powershell
Copy-Item .env.example .env
```

Set:

```env
DATABASE_URL=postgresql://aura:aura@localhost:5432/aura_backend
AUTH_REQUIRED=false
```

## 3. Install dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 4. Check setup status

```powershell
python -m app.ops.setup_status --profile local
```

Expected after `DATABASE_URL` is set:

```text
Setup status: ok
```

## 5. Apply schema

```powershell
python -m app.db.init_db
```

Expected first run:

```text
Applied schema.sql:v<current-version>.
```

Expected repeated run:

```text
Skipped schema.sql:v<current-version>; already applied.
```

## 6. Apply development seed data

```powershell
python -m app.db.seed_db
```

Expected first run:

```text
Applied seed.sql:v1.
```

Expected repeated run:

```text
Skipped seed.sql:v1; already applied.
```

## 7. Verify schema readiness

```powershell
python -m app.db.check_schema --require-seed
```

Expected:

```text
Schema check: ok
All expected tables and migration markers are present.
```

## 8. Run tests

```powershell
python -m pytest -q
```

## 9. Run API server

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Check:

```powershell
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
Invoke-WebRequest http://localhost:8000/api/health/db -UseBasicParsing
```

Run the smoke checker:

```powershell
python -m app.ops.smoke_api --base-url http://localhost:8000 --require-db
```

## 10. Verify the product recommendation page with the local DB

The privacy-safe defaults keep engagement personalization and cohort ranking
disabled. For an isolated local demo, add these values to `.env` before
starting Uvicorn:

```env
AUTH_REQUIRED=false
ENGAGEMENT_PERSONALIZATION_V1=true
COHORT_RECOMMENDATIONS_V1=true
PRODUCT_PERSONALIZATION_EXPERIMENT_PERCENT=100
PRODUCT_COHORT_EXPERIMENT_PERCENT=100
PRODUCT_EVENT_SIGNING_SECRET=local-only-product-events-change-me
```

Check the APIs used by the recommendation hub:

```powershell
Invoke-RestMethod http://localhost:8000/api/products/features
Invoke-RestMethod "http://localhost:8000/api/products/recommendations/seasonal?limit=18"
Invoke-RestMethod "http://localhost:8000/api/products/recommendations/seasonal?limit=60&category=lip"
Invoke-RestMethod "http://localhost:8000/api/products/recommendations/personalized?limit=18"
Invoke-RestMethod "http://localhost:8000/api/products/recommendations/cohort?limit=18"
Invoke-RestMethod "http://localhost:8000/api/products/recommendations/ar?limit=18"
Invoke-RestMethod "http://localhost:8000/api/products/liked?limit=18"
```

Expected behavior for a fresh local user:

- `features` reports the bundled Auradin catalog as ready with at least 500
  displayable products and non-empty base, shadow, brow, cheek, lip, and liner
  categories.
- seasonal, personalized, and cohort endpoints return non-empty, unique,
  catalog-backed products. Personalized/cohort may explain that popular
  fallback products are being shown until the user has enough consented data.
- AR reports `noArStyle` until the user saves an AR look, but still supplies
  catalog-backed popular products in its region groups. The mobile client
  renders those products and keeps the AR look creation action available;
  exact color/texture matching starts after a look is saved.
- liked products are empty for a new user, then appear after the same local
  user likes a product.

For a physical phone, set `apps/mobile/.env` to the development machine's LAN
address; `localhost` points to the phone itself:

```env
EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:8000/api
```

Keep Uvicorn bound to `0.0.0.0`, and keep the phone and development machine on
the same WiFi network.

## 11. First AWS-dependent checks

Do these only after setting the required values in `docs/backend/SETUP_REQUIRED.md`.

- `AUTH_REQUIRED=true` with Cognito values.
- `/api/media/presigned-upload` with `S3_BUCKET_NAME`.
- `/api/analysis/jobs` with `OPENAI_API_KEY` and S3 access through AWS credentials or IAM role.
