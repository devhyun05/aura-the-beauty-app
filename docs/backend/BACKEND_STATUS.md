# Backend Status

This page is the quick answer source for "what is implemented?" and
"what do I still need to configure?".

## Implemented Backend Base

- FastAPI app under `services/backend`.
- Common response envelope: `{ data, meta, error }`.
- Common error handlers for app errors, HTTP errors, and validation errors.
- Settings/env structure with `.env.example`.
- Cognito JWT verification path for real auth and local dev auth fallback.
- RDS/PostgreSQL connection layer.
- Schema apply, seed apply, and schema readiness checks.
- S3 presigned upload flow and media metadata APIs.
- Analysis job/report APIs with Bedrock invocation boundary.
- Product recommendations, likes, saved makeup styles, feedback, filter extraction, and AR filter state API skeletons.
- Dockerfile and local PostgreSQL compose file.
- OpenAPI contract export.
- Setup status and API smoke check CLI tools.

## Main Commands

Run from `services/backend`.

```powershell
python -m app.ops.setup_status --profile local
python -m app.db.init_db
python -m app.db.seed_db
python -m app.db.check_schema --require-seed
python -m app.ops.export_openapi --output ../../docs/backend/openapi.json
python -m app.ops.smoke_api --base-url http://localhost:8000 --require-db
```

For AWS deployment readiness:

```powershell
python -m app.ops.setup_status --profile aws
python -m app.ops.smoke_api --base-url https://<cloudfront-domain> --require-db
```

## Values The User Must Configure

Use `docs/backend/SETUP_REQUIRED.md` as the detailed source. The high priority
values are:

- `DATABASE_URL`
- `AUTH_REQUIRED`
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DOMAIN` or `CDN_BASE_URL`
- `BEDROCK_MODEL_ID`
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for local AWS SDK calls, or `AWS_USE_IAM_ROLE=true` for ECS task role usage
- `API_GATEWAY_URL` or `ALB_DNS`
- `EXPO_PUBLIC_API_BASE_URL` in the mobile app after CloudFront/API origin is ready

## Not Done In Code By Design

- Real AWS resources are not created by this repository.
- Real secret values are not committed.
- CloudFront contains no business logic; it should only route `/api/*`, forward headers, manage HTTPS/cache policy, and serve S3/CDN assets.
- Kakao/Naver OAuth are not implemented yet. The provider structure does not block adding them later.
- Production async job infrastructure such as SQS/ECS worker can be added later without changing the mobile-facing analysis job contract.

## How To Answer "What Should I Configure?"

1. Ask whether the target is local, AWS deploy, or mobile switch.
2. Run or reference:

```powershell
python -m app.ops.setup_status --profile local
python -m app.ops.setup_status --profile aws
```

3. Map missing values to `docs/backend/SETUP_REQUIRED.md`.
4. After values are filled, verify:

```powershell
python -m app.db.check_schema --require-seed
python -m app.ops.smoke_api --base-url <url> --require-db
```
