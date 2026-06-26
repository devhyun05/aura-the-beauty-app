# AWS Deployment Checklist

This checklist is for wiring the FastAPI backend into the project architecture:
For the current implementation summary, see `docs/backend/BACKEND_STATUS.md`.

```text
Mobile App -> CloudFront -> API Gateway or ALB -> ECS/FastAPI -> RDS/S3/Bedrock
```

CloudFront must not contain API business logic. Business logic belongs in
FastAPI. CloudFront is only for HTTPS entry, `/api/*` routing, header forwarding,
cache policy, and S3/CDN delivery.

## 1. RDS/PostgreSQL

- Create or confirm the PostgreSQL database.
- Enable required extensions from `docs/backend/schema.sql`: `pgcrypto`, `citext`.
- Store the connection string as `DATABASE_URL`.
- Prefer Secrets Manager for production.
- Run:

```powershell
python -m app.db.init_db
python -m app.db.seed_db
python -m app.db.check_schema --require-seed
```

Expected config status:

```text
GET /api/health/config -> databaseUrl.configured = true
GET /api/health/db -> status = ok
```

## 2. Cognito/Google Auth

- Keep mobile login through Cognito Hosted UI.
- Backend does not implement OAuth login screens.
- Set:

```env
AUTH_REQUIRED=true
COGNITO_USER_POOL_ID=
COGNITO_APP_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_ID=
```

- Mobile must send:

```text
Authorization: Bearer <Cognito JWT>
```

- Kakao/Naver are later provider extensions. Do not block them in DB/provider
  structure, but do not deploy them as required auth paths yet.

## 3. S3 Media Bucket

- Create the media bucket.
- Configure ECS task role or local AWS credentials for `s3:PutObject`.
- For ECS task role usage, set `AWS_USE_IAM_ROLE=true` instead of storing access keys in the task environment.
- Set:

```env
S3_BUCKET_NAME=
CLOUDFRONT_DOMAIN=
```

- Upload flow:

```text
POST /api/media/presigned-upload
mobile PUT to S3
POST /api/media/complete-upload
```

## 4. Bedrock

- Enable model access in the AWS account.
- Give the ECS task role permission to call Bedrock runtime.
- Set:

```env
BEDROCK_MODEL_ID=
AWS_REGION=ap-northeast-2
```

- Development path can use `runImmediately=true` on `POST /api/analysis/jobs`.
- Production can later move execution to SQS/ECS worker without changing the
  mobile job status contract.

## 5. Container Image

Build from repository root:

```powershell
docker build -f services/backend/Dockerfile -t aura-backend-api .
```

ECS task requirements:

- Container port: `8000`
- Health check path: `/health`
- Environment/secrets: use values from `docs/backend/SETUP_REQUIRED.md`
- ECS should set `AWS_USE_IAM_ROLE=true`; local development can use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
- Logs: send stdout/stderr to CloudWatch

## 6. ECS Service

- Create or confirm ECS cluster.
- Create task definition for the backend image.
- Attach task role with S3/Bedrock permissions.
- Attach execution role for pulling image and writing logs.
- Configure service desired count.
- Put ECS behind ALB or API Gateway integration.

Record:

```text
ECS_CLUSTER_NAME=
ECS_SERVICE_NAME=
ECS_TASK_DEFINITION=
CLOUDWATCH_LOG_GROUP_NAME=
SECRETS_MANAGER_SECRET_NAME=
```

## 7. API Gateway or ALB

Choose one origin for CloudFront `/api/*`:

- API Gateway URL
- ALB DNS name

Set or record:

```text
API_GATEWAY_URL=
ALB_DNS=
```

Health checks:

```text
GET /health
GET /api/health
GET /api/health/config
GET /api/health/db
```

## 8. CloudFront

Create behaviors:

- `/api/*` -> API Gateway or ALB origin
- S3 media path/origin -> S3 bucket

Recommended policy:

- `/api/*`: disable caching for dynamic API responses.
- `/api/*`: forward `Authorization`, `Origin`, `Content-Type`, and CORS-related headers.
- `/api/*`: allow needed methods such as `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`.
- S3/media: enable caching.
- Do not add business logic to CloudFront Functions or Lambda@Edge for this app.

Set:

```env
CLOUDFRONT_DOMAIN=
CDN_BASE_URL=
```

## 9. CORS Ownership

Pick one owner:

- API Gateway CORS, or
- FastAPI CORS with `CORS_ENABLED=true`

Avoid enabling conflicting CORS rules in CloudFront, API Gateway, and FastAPI at
the same time. CloudFront should mostly forward the needed headers.

## 10. CloudWatch

- Enable ECS container logs.
- Confirm log group name.
- Keep application logs on stdout/stderr.
- Add alarms later for 5xx rate, task restarts, CPU/memory, and ALB/API Gateway errors.

## 11. API Contract Export

Before mobile integration review, export the current OpenAPI contract from `services/backend`:

```powershell
python -m app.ops.export_openapi --output docs/backend/openapi.json
```

## 12. Setup Status Check

From `services/backend`, confirm deployment-required values without exposing secrets:

```powershell
python -m app.ops.setup_status --profile aws
```

## 13. Final Smoke Test

After deployment:

```text
GET https://<cloudfront-domain>/api/health
GET https://<cloudfront-domain>/api/health/config
GET https://<cloudfront-domain>/api/health/db
GET https://<cloudfront-domain>/api/home
```

Or run the packaged smoke checker from `services/backend`:

```powershell
python -m app.ops.smoke_api --base-url https://<cloudfront-domain> --require-db
```

Then test with auth:

```text
GET /api/users/me
POST /api/media/presigned-upload
POST /api/analysis/jobs
```

## 14. Mobile API Switch

After CloudFront is ready, mobile should point to:

```env
EXPO_PUBLIC_API_BASE_URL=https://<cloudfront-domain>/api
```

Only switch one mock service at a time:

1. `/users/me`
2. `/home`
3. media upload
4. analysis jobs and reports
5. products/likes/styles
6. feedback/filter/AR flows
