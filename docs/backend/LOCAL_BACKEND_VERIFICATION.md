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
Applied schema.sql:v1.
```

Expected repeated run:

```text
Skipped schema.sql:v1; already applied.
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

## 10. First AWS-dependent checks

Do these only after setting the required values in `docs/backend/SETUP_REQUIRED.md`.

- `AUTH_REQUIRED=true` with Cognito values.
- `/api/media/presigned-upload` with `S3_BUCKET_NAME`.
- `/api/analysis/jobs` with `OPENAI_API_KEY` and S3 access through AWS credentials or IAM role.
