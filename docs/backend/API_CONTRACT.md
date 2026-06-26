# Backend API Contract

Base path for deployed API routes should be `/api/*` behind CloudFront.
Root `/health` is also available for container and ALB health checks.

## Response Envelope

Success:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

Error:

```json
{
  "data": null,
  "meta": {
    "requestId": "optional"
  },
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

API responses are camelCase. Database column names remain snake_case.

## Auth

Protected endpoints expect:

```text
Authorization: Bearer <Cognito JWT>
```

The mobile app should send the Cognito `idToken` first because it carries stable
user profile claims such as `email` and `name`. The backend can also accept a
Cognito access token by validating its `client_id` claim.

Local development can set `AUTH_REQUIRED=false`, which injects a development
Google-like user. Production must set `AUTH_REQUIRED=true`.

## Endpoint Groups

- `GET /health`
- `GET /api/health`
- `GET /api/health/db`
- `GET /api/health/config`
- `GET /api/users/me`
- `PATCH /api/users/me/profile`
- `GET /api/home`
- `POST /api/media/presigned-upload`
- `POST /api/media/complete-upload`
- `POST /api/photo-captures`
- `POST /api/analysis/jobs`
- `GET /api/analysis/jobs/{jobId}`
- `GET /api/analysis/reports`
- `GET /api/analysis/reports/{reportId}`
- `GET /api/products/recommendations`
- `GET /api/products/liked`
- `POST /api/products/{productId}/like`
- `DELETE /api/products/{productId}/like`
- `GET /api/makeup-styles`
- `POST /api/makeup-styles`
- `POST /api/feedback/jobs`
- `GET /api/feedback/reports`
- `POST /api/filter-extractions/jobs`
- `GET /api/filter-extractions/{reportId}`
- `GET /api/ar/filters`
- `GET /api/ar/filter-states`
- `PUT /api/ar/filter-states/{filterId}`


## OpenAPI Export

From `services/backend`, export the machine-readable API contract for mobile/API review:

```powershell
python -m app.ops.export_openapi --output docs/backend/openapi.json
```

The generated file should not contain secret values. It is a contract artifact for route, schema, and method review.
## CloudFront Policy

CloudFront must not contain API business logic. See docs/backend/AWS_DEPLOYMENT_CHECKLIST.md for deployment wiring.

- `/api/*`: forward to API Gateway or ALB.
- `/api/*`: disable dynamic API caching by default.
- `/api/*`: forward `Authorization`, `Origin`, `Content-Type`, and required CORS headers.
- S3 media: use CloudFront caching for images and generated assets.
- CORS should be owned by API Gateway or FastAPI, not duplicated across every layer.

## Analysis Job Behavior

`POST /api/analysis/jobs` creates an `analysis_reports` row with `pending` status.
If `runImmediately=true`, the API switches the row to `processing` and calls
Bedrock synchronously for the current development path.

- Success: row becomes `completed` and stores Bedrock result in `detailPayload`.
- Bedrock configuration missing: row becomes `failed`; API returns `BEDROCK_NOT_CONFIGURED`.
- Bedrock invocation error: row becomes `failed`; API returns `BEDROCK_INVOCATION_FAILED`.

For production, this can move to an ECS worker/SQS flow without changing the
mobile-facing job status contract.

## Configuration Missing Behavior

- Missing `DATABASE_URL`: DB-backed endpoints return `DATABASE_NOT_CONFIGURED`.
- Missing `S3_BUCKET_NAME`: `/api/media/presigned-upload` returns `S3_NOT_CONFIGURED`.
- Missing `BEDROCK_MODEL_ID`: immediate analysis execution returns `BEDROCK_NOT_CONFIGURED`.

## Validation Policy

- Path IDs and request IDs that map to PostgreSQL `uuid` columns are validated as UUID values.
- Upload `mediaKind` is limited to letters, numbers, `_`, and `-` so it can safely become part of an S3 object key prefix.
- Invalid request body or path values return `VALIDATION_ERROR` with HTTP 422 when the request reaches validation.
- If the database is not configured, DB-backed endpoints can return `DATABASE_NOT_CONFIGURED` before resource validation.

## Config Status Endpoint

`GET /api/health/config` returns safe setup readiness flags only. It does not
return actual secret values such as `DATABASE_URL`, AWS keys, Cognito IDs, or
bucket names. `awsCredentialsOrRole.source` can be `missing`, `access_key`, or
`iam_role` so ECS task role usage is visible without exposing credentials. Use
it to see which setup categories are still missing while keeping real values in
`.env`, ECS task secrets, or Secrets Manager.