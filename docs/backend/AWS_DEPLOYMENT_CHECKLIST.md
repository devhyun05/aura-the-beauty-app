# AWS Deployment Checklist

This checklist is for wiring the FastAPI backend into the project architecture.
For the async AI worker deployment order, use `docs/backend/ASYNC_AI_WORKER_DEPLOYMENT_RUNBOOK.md`.
For the current implementation summary, see `docs/backend/BACKEND_STATUS.md`.

```text
Mobile App -> CloudFront -> API Gateway or ALB -> ECS/FastAPI -> SQS -> ECS Worker -> RDS/S3/OpenAI/Bedrock
S3 ObjectCreated -> Media Postprocess Lambda
```

CloudFront must not contain API business logic. Business logic belongs in
FastAPI. CloudFront is only for HTTPS entry, `/api/*` routing, header forwarding,
cache policy, and S3/CDN delivery.

## 0. Deployment Defaults

Use these defaults for AWS deployment:

```env
ENVIRONMENT=dev
AUTH_REQUIRED=true
AWS_REGION=ap-northeast-2
AWS_USE_IAM_ROLE=true
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Bootstrap with inline until SQS and the worker service are live.
AI_JOB_EXECUTION_MODE=inline
SQS_AI_JOB_QUEUE_URL=
```

After the SQS queue and worker service are deployed, switch the API and worker services to:

```env
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/<account-id>/<queue-name>
```

Do not put long-lived AWS access keys in ECS task environment variables. The backend container should use the ECS task role for S3. Secrets such as `DATABASE_URL` and `OPENAI_API_KEY` belong in Secrets Manager and are injected into the task definition.

Mobile deployment should point to CloudFront, not a local LAN IP:

```env
EXPO_PUBLIC_API_BASE_URL=https://<cloudfront-domain>/api
```

Mobile Cognito tokens are stored through `expo-secure-store` in `AuthSessionProvider`; do not store JWTs in navigation state.
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

### Partner credential rotation

Partner credentials are not issued through an HTTP API. Before deploying this
change, rotate existing partner credentials from a trusted operator terminal:

```bash
cd services/backend
.venv/bin/python scripts/rotate_partner_credentials.py --confirm rotate-partner-credentials --output ./partner-credentials.json
```

- The output file is created with owner-only permissions and must not already exist.
- Deliver each credential through an approved secret-sharing channel, then securely remove the file.
- Rotation replaces legacy password hashes and revokes every existing partner session.
- Confirm `POST /api/consulting/partner/dev/issue-accounts` returns `404` after deployment.

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
POST /api/media/presigned-upload -> uploadId + server-issued target
mobile PUT to S3
POST /api/media/complete-upload { uploadId }
```

- Restrict the ECS task role to the configured media bucket and the
  `uploads/*` object prefix. Do not grant object access to `arn:aws:s3:::*`.
  Replace `<media-bucket>` before applying this example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObjectTagging"],
      "Resource": "arn:aws:s3:::<media-bucket>/uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketVersions"],
      "Resource": "arn:aws:s3:::<media-bucket>",
      "Condition": {"StringLike": {"s3:prefix": ["uploads/*"]}}
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetBucketVersioning",
      "Resource": "arn:aws:s3:::<media-bucket>"
    }
  ]
}
```

- S3 ObjectCreated post-processing Lambda:

```text
handler: app.lambdas.media_postprocess.lambda_handler
event: separate s3:ObjectCreated:* notifications for uploads/capture/, uploads/makeup_feedback/, and uploads/filter-extraction/
excluded: uploads/makeup-filters/ and every other app-managed static prefix
permissions: s3:GetObject, s3:PutObject on the media bucket
```

- The Lambda rewrites the original object without EXIF and creates a thumbnail under `<original-dir>/thumbnails/`.
- The handler skips `/thumbnails/` keys and objects with `aura-postprocessed=true` metadata to avoid recursive processing.
- `media_assets.thumbnail_*` is filled by `POST /api/media/complete-upload` with a short best-effort S3 lookup for the expected thumbnail. Lambda does not connect directly to the database.

## 4. OpenAI API

- Create or confirm the OpenAI project API key used by the backend.
- Store the API key in Secrets Manager or the deployment secret store.
- Set:

```env
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL_ID=gpt-5.5
OPENAI_IMAGE_MODEL_ID=gpt-image-1
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_SIZE=1024x1024
```

- Development path can use `runImmediately=true` on `POST /api/analysis/jobs`.
- Production can run execution through SQS/ECS worker without changing the
  mobile job status contract.
- Keep `AI_JOB_EXECUTION_MODE=inline` until the SQS queue and ECS worker service
  are deployed. After that, set `AI_JOB_EXECUTION_MODE=sqs` and provide
  `SQS_AI_JOB_QUEUE_URL`.

## 5. Container Image

Build from repository root:

```powershell
docker build -f services/backend/Dockerfile -t aura-backend-api .
```

The API service uses the image default command. The AI worker service reuses the same image but overrides the command:

```text
python -m app.workers.ai_job_worker
```

Do not reuse the API container `/health` check for the worker service. The worker is not an HTTP server; configure a worker-specific ECS health check or omit the API health check on that service.

ECR push example:

```powershell
aws ecr create-repository --repository-name aura-backend-api --region ap-northeast-2
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-northeast-2.amazonaws.com
docker tag aura-backend-api:latest <account-id>.dkr.ecr.ap-northeast-2.amazonaws.com/aura-backend-api:latest
docker push <account-id>.dkr.ecr.ap-northeast-2.amazonaws.com/aura-backend-api:latest
```

GitHub Actions deploys the backend to ECS on pushes to `main` through
`.github/workflows/deploy-backend-ecs.yml`. Configure these repository
Variables before enabling the workflow:

```text
AWS_REGION=ap-northeast-2
ECR_REPOSITORY=aura-backend-api
ECS_CLUSTER=<ecs-cluster-name>
ECS_SERVICE=<ecs-service-name>
ECS_TASK_DEFINITION=<task-definition-family-or-arn>
ECS_CONTAINER_NAME=aura-backend-api
```

For AWS authentication, prefer an OIDC role and set this repository Secret:

```text
AWS_ROLE_TO_ASSUME=<github-actions-deploy-role-arn>
```

If OIDC is not ready yet, the workflow can also use these repository Secrets:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

ECS task requirements:

- Container port: `8000`
- Health check path: `/health`
- Environment/secrets: use values from `docs/backend/SETUP_REQUIRED.md`
- Product recommendations need `NAVER_SHOPPING_CLIENT_ID` and `NAVER_SHOPPING_CLIENT_SECRET`; without them `/api/products/recommendations` cannot return live NAVER Store products.
- ECS should set `AWS_USE_IAM_ROLE=true`; local development can use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
- Logs: send stdout/stderr to CloudWatch

## 6. ECS Services And SQS

- Create or confirm ECS cluster.
- Create task definition for the backend image.
- Create the FastAPI API ECS service with the default image command.
- Create the AI Worker ECS service with command `python -m app.workers.ai_job_worker`.
- Create an SQS AI job queue and DLQ.
- Attach API task role permission for `sqs:SendMessage` on the AI job queue.
- Attach worker task role permissions for `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`, and `sqs:GetQueueAttributes`.
- Attach shared S3/RDS/Secrets/Bedrock/OpenAI-related configuration to both API and worker services.
- Attach execution role for pulling image and writing logs.
- Configure API service desired count separately from worker desired count.
- Put only the FastAPI API service behind ALB or API Gateway integration. The worker has no public route.

Record:

```text
ECS_CLUSTER_NAME=
ECS_API_SERVICE_NAME=
ECS_WORKER_SERVICE_NAME=
ECS_API_TASK_DEFINITION=
ECS_WORKER_TASK_DEFINITION=
SQS_AI_JOB_QUEUE_URL=
SQS_AI_JOB_DLQ_URL=
CLOUDWATCH_API_LOG_GROUP_NAME=
CLOUDWATCH_WORKER_LOG_GROUP_NAME=
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
GET /api/analysis/jobs/{jobId}
```

Async worker checks:

```text
FastAPI logs include job:queued
Worker logs include analysis:received
SQS visible message count returns to 0 after processing
DLQ remains empty for a successful smoke test
analysis job reaches completed or failed terminal status
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

## 15. Hair Analysis Worker

헤어 분석·합성은 API ECS 서비스와 별도 SQS worker가 필요하다. 다음 항목을 함께 배포한다.

- `infra/hair-simulation.yaml`: SQS/DLQ, ECS worker, 1~10 autoscaling, 15분 정리 작업
- API ECS 환경 변수 `HAIR_JOBS_QUEUE_URL`
- 스타일 레퍼런스 12종 및 승인된 `manifest.json`
- `scripts/aws/configure-hair-api-routes.sh`
- `scripts/aws/configure-hair-s3-lifecycle.sh`

private subnet worker가 OpenAI에 접속하려면 NAT egress가 필요하다. 상세 순서와 데이터 보관 정책은 `docs/backend/HAIR_ANALYSIS_SIMULATION.md`를 따른다.
