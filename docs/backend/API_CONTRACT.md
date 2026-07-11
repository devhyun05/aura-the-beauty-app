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
- `DELETE /api/users/me`
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
- `GET /api/hair-styles`
- `POST /api/hair-analyses`
- `GET /api/hair-analyses/{analysis_id}`
- `POST /api/hair-analyses/{analysis_id}/simulations`
- `GET /api/hair-simulations/{simulation_id}`
- `POST /api/hair-simulations/{simulation_id}/save`
- `GET /api/hair-simulations?saved=true`
- `DELETE /api/hair-simulations/{simulation_id}`
- `POST /api/consulting/partner/applications`
- `POST /api/consulting/partner/me/password`
- `POST /api/consulting/partner/login`
- `GET /api/consulting/admin/partner-applications`
- `POST /api/consulting/admin/partner-applications/{applicationId}/approve`
- `POST /api/consulting/admin/partner-applications/{applicationId}/needs-update`
- `POST /api/consulting/admin/partner-applications/{applicationId}/reject`

### Consultant Signup And Approval

Consultant onboarding uses an approval flow; there is no remote development-account
issuer and no fixed password in source code.

1. Consulting-web submits `POST /api/consulting/partner/applications` with the
   applicant email, name, title, and optional profile/contact fields. The public
   response uses the same submitted shape so existing account emails cannot be enumerated.
2. An authenticated Cognito `admin`, `operator`, or `business_manager` lists pending
   applications. The admin first creates/selects the matching expert profile, then
   approves with `{ "expertId": "..." }` or rejects the application.
3. Approval returns a randomly generated temporary password once to the authorized
   admin. Only its PBKDF2 hash is persisted, and all previous sessions are revoked.
4. The partner signs in with the temporary password and is restricted to
   `POST /api/consulting/partner/me/password` until a new password is set.
5. After the password change, the account becomes active and workspace APIs are enabled.

### Media Upload Sessions

`POST /api/media/presigned-upload` creates a one-time upload session bound to
the authenticated user. The response includes `uploadId` and the server-issued
S3 target. An optional nested `thumbnail` request returns `thumbnailUpload`
under the same session.

After every issued target has been uploaded, the client calls
`POST /api/media/complete-upload` with only the session identifier:

```json
{
  "uploadId": "00000000-0000-0000-0000-000000000000"
}
```

The backend resolves bucket and object keys from the session, verifies S3
metadata, checks the session principal, and consumes the session once. Clients
must not send or persist a replacement bucket, object key, or CDN URL.

During the mobile rollout transition, the legacy bucket/objectKey completion
shape is accepted only as an exact lookup for a still-valid server-issued
session owned by the same authenticated principal. Those client values are
never inserted directly into `media_assets`.

### Hair Analysis And Simulation

Hair analysis and simulation are asynchronous SQS-backed jobs. Create requests
require a stable `clientRequestId`; polling reads `queued`, `processing`,
`completed`, `failed`, or `expired`. Source photos, masks, and unsaved results
are private and expire after 24 hours. See
`docs/backend/HAIR_ANALYSIS_SIMULATION.md` for deployment, quotas, and retention.

### Account Deletion

`DELETE /api/users/me` permanently removes the user's application data and
queues owned S3 objects for deletion. A one-way hash of the Cognito subject is
kept as a tombstone so a still-valid JWT cannot recreate the deleted account.
The response includes `identityDeleted` because deleting the Cognito identity is
best-effort after the database transaction succeeds.

The request body can include an optional neutral exit-reason code. The code is
stored only in the account-deletion audit metadata and is not required to delete
the account.

```json
{
  "reason": "low_usage"
}
```

In ECS, grant the task role `cognito-idp:AdminDeleteUser` only for the configured
user pool. If that permission is missing, application data is still deleted and
the tombstone blocks the old identity, but `identityDeleted` is `false`.

### Recommended Makeup Filters

`GET /api/ar/filters?kind=recommendedMakeupFilter` returns the filter-store
cards used by the mobile home and filter store screens. The source table is
`ar_filters`; card copy such as `headline`, `displayTitle`, `description`,
`keywords`, `categoryTags`, and `matchScore` lives in `ar_filters.filter_payload`.
Card images are not stored or returned by this API. The mobile app keeps using
the existing S3/CloudFront image mapping by filter id.

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
OpenAI synchronously for the current development path.

- Success: row becomes `completed` and stores OpenAI result in `detailPayload`.
- OpenAI configuration missing: row becomes `failed`; API returns `OPENAI_NOT_CONFIGURED`.
- OpenAI invocation error: row becomes `failed`; API returns `OPENAI_INVOCATION_FAILED`.

For production, this can move to an ECS worker/SQS flow without changing the
mobile-facing job status contract.

## Configuration Missing Behavior

- Missing `DATABASE_URL`: DB-backed endpoints return `DATABASE_NOT_CONFIGURED`.
- Missing `S3_BUCKET_NAME`: `/api/media/presigned-upload` returns `S3_NOT_CONFIGURED`.
- Missing `OPENAI_API_KEY`: immediate analysis execution returns `OPENAI_NOT_CONFIGURED`.

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
