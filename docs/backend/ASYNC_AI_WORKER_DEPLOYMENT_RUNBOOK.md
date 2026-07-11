# Async AI Worker Deployment Runbook

??臾몄꽌??AURA 諛깆뿏?쒖쓽 ?μ떆媛?AI ?묒뾽??AWS 諛고룷 ?섍꼍???곌껐?????곕씪媛???ㅽ뻾 ?쒖꽌??

?듭떖? ?ㅼ쓬?대떎.

```text
Mobile App
-> CloudFront / API Gateway or ALB
-> ECS FastAPI API service
-> SQS
-> ECS AI Worker service
-> RDS / S3 / Bedrock / OpenAI

S3 ObjectCreated
-> Media Postprocess Lambda
-> S3 thumbnail / EXIF-free object
```

## 1. Runtime Modes

濡쒖뺄 媛쒕컻 湲곕낯媛믪? `inline`?대떎.

```env
AI_JOB_EXECUTION_MODE=inline
SQS_AI_JOB_QUEUE_URL=
```

??紐⑤뱶?먯꽌??FastAPI ?쒕쾭 ?덉뿉???쇨뎬吏꾨떒 遺꾩꽍???ㅽ뻾?쒕떎. SQS/ECS Worker ?놁씠 紐⑤컮????湲곕뒫???뺤씤?섍린 ?꾪븳 紐⑤뱶??

諛고룷 ?댁쁺 紐⑤뱶??`sqs`??

```env
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/<account-id>/<queue-name>
```

??紐⑤뱶?먯꽌??FastAPI媛 job row瑜?留뚮뱾怨?SQS 硫붿떆吏留?諛쒗뻾?쒕떎. ?쇨뎬吏꾨떒 遺꾩꽍怨?異붿쿇 ?대?吏 ?앹꽦? ECS Worker媛 泥섎━?쒕떎.

## 2. AWS Resources

?꾩닔 由ъ냼?ㅻ뒗 ?ㅼ쓬?대떎.

- ECS service: FastAPI API
- ECS service: AI Worker
- SQS queue: AI job queue
- SQS DLQ: failed AI job messages
- RDS PostgreSQL
- S3 media bucket
- Lambda: media postprocess
- CloudWatch log groups
- Secrets Manager values for DB/OpenAI/provider secrets

## 3. ECS FastAPI API Service

API service??紐⑤컮???붿껌??諛쏅뒗??

Command:

```text
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Required env/secrets:

```env
ENVIRONMENT=dev
AUTH_REQUIRED=true
AWS_REGION=ap-northeast-2
AWS_USE_IAM_ROLE=true

DATABASE_URL=...
S3_BUCKET_NAME=...
CLOUDFRONT_DOMAIN=...
CDN_BASE_URL=...

AI_PROVIDER=bedrock
IMAGE_GENERATION_PROVIDER=openai
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=...

OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL_ID=...
OPENAI_IMAGE_MODEL_ID=...
```

API task role permissions:

```text
sqs:SendMessage on AI job queue
s3:PutObject/GetObject/DeleteObject on media bucket paths used by the API
secretsmanager:GetSecretValue for configured secrets
bedrock:InvokeModel when Bedrock analysis/embedding is used
bedrock:InvokeModelWithResponseStream if a selected model path requires it
logs:CreateLogStream / logs:PutLogEvents through the ECS execution role
```

## 4. SQS Queue

Start with one standard queue and one DLQ.

Recommended starting values:

```text
queue type: Standard
visibility timeout: 15 minutes
message retention: 4 days or longer
receive wait time: 20 seconds
max receive count before DLQ: 3
```

Why 15 minutes visibility timeout: a face analysis plus generated recommendation image can take longer than a normal HTTP request. The worker deletes the message only after the handler succeeds.

## 5. ECS AI Worker Service

Worker service reuses the same backend image as FastAPI, but overrides the command.

Command:

```text
python -m app.workers.ai_job_worker
```

The worker is not an HTTP server. Do not attach the API `/health` check to this service.

Required env/secrets are mostly the same as the API service:

```env
ENVIRONMENT=dev
AWS_REGION=ap-northeast-2
AWS_USE_IAM_ROLE=true

DATABASE_URL=...
S3_BUCKET_NAME=...
CLOUDFRONT_DOMAIN=...
CDN_BASE_URL=...

AI_PROVIDER=bedrock
IMAGE_GENERATION_PROVIDER=openai
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=...

OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL_ID=...
OPENAI_IMAGE_MODEL_ID=...
```

Worker task role permissions:

```text
sqs:ReceiveMessage on AI job queue
sqs:DeleteMessage on AI job queue
sqs:ChangeMessageVisibility on AI job queue
sqs:GetQueueAttributes on AI job queue
s3:GetObject/PutObject on media bucket paths used by source and generated images
secretsmanager:GetSecretValue for configured secrets
bedrock:InvokeModel when Bedrock analysis/embedding is used
logs:CreateLogStream / logs:PutLogEvents through the ECS execution role
```

Start with:

```text
desired count: 1
```

Scale later by queue depth, processing time, OpenAI/Bedrock rate limits, and RDS connection capacity.

## 6. Media Postprocess Lambda

Handler:

```text
app.lambdas.media_postprocess.lambda_handler
```

Package:

```powershell
python scripts/aws/package_media_postprocess_lambda.py
```

This creates `dist/lambda/aura-media-postprocess.zip`. The zip is a generated deployment artifact and is intentionally ignored by git. CI/CD or the deploy machine should recreate it from source, then pass that zip to `aws lambda create-function` or `aws lambda update-function-code`.

Trigger:

```text
s3:ObjectCreated:* on uploads/capture/
s3:ObjectCreated:* on uploads/makeup_feedback/
s3:ObjectCreated:* on uploads/filter-extraction/
```

Do not attach the Lambda to the broad `uploads/` prefix. In particular, `uploads/makeup-filters/` contains app-managed static home assets and must remain excluded.

Lambda permissions:

```text
s3:GetObject on media bucket uploads/*
s3:PutObject on media bucket uploads/*
logs:CreateLogGroup
logs:CreateLogStream
logs:PutLogEvents
```

Behavior:

- Skips keys under `/thumbnails/`.
- Skips objects with metadata `aura-postprocessed=true`.
- Rewrites the original object without EXIF.
- Creates `<original-dir>/thumbnails/<name>.jpg`.
- Does not connect directly to the database. `POST /api/media/complete-upload` best-effort checks for the expected S3 thumbnail and fills `media_assets.thumbnail_*` when it is already available.

## 7. Deployment Order

Recommended order:

1. Deploy/confirm RDS schema.
2. Deploy FastAPI API service with `AI_JOB_EXECUTION_MODE=inline`.
3. Confirm mobile API path through CloudFront/API Gateway or ALB.
4. Create SQS queue and DLQ.
5. Deploy AI Worker ECS service with desired count `1`.
6. Change FastAPI API service to `AI_JOB_EXECUTION_MODE=sqs`.
7. Run an analysis job and watch job status move through `pending -> processing -> completed`.
8. Add S3 ObjectCreated trigger for media postprocess Lambda.
9. Upload an image and confirm thumbnail object creation.

This order keeps the API usable while the queue and worker are being attached.

## 8. Verification

From `services/backend`, run before deployment:

```powershell
python -m pytest tests/test_ai_job_queue.py tests/test_ai_job_worker.py tests/test_media_postprocess_lambda.py -q
python -m pytest tests/test_settings_and_services.py tests/test_setup_status.py -q
python -m pytest tests/test_route_contract.py tests/test_export_openapi.py tests/test_validation_contract.py -q
```

After deployment:

```text
GET /api/health
GET /api/health/config
GET /api/health/db
POST /api/media/presigned-upload
POST /api/media/complete-upload
POST /api/analysis/jobs
GET /api/analysis/jobs/{jobId}
```

CloudWatch checks:

- FastAPI logs show `job:queued`.
- Worker logs show `analysis:received`.
- Worker logs show SQS message deletion only after handler success.
- SQS visible messages return to zero after processing.
- DLQ remains empty during successful smoke tests.
- S3 thumbnail object appears under `/thumbnails/`.

Configure the dev operational alarms and SNS email subscription from the repository:

```powershell
.\scripts\aws\configure_operational_alarms.ps1 -AlertEmail "owner@example.com"
```

The script is idempotent. It creates or updates alarms for a non-empty AI DLQ,
AI jobs older than five minutes, media Lambda errors, and elevated API Gateway
5xx responses. The email recipient must confirm the AWS SNS subscription before
notifications can be delivered.

Configure SQS-driven ECS Worker Auto Scaling:

```powershell
.\scripts\aws\configure_ai_worker_autoscaling.ps1 -MinCapacity 1 -MaxCapacity 3
```

The scale-out alarm adds one Worker for 1-4 visible jobs and two Workers for five
or more visible jobs, capped by `MaxCapacity`. The scale-in alarm removes one
Worker only after visible and in-flight messages both remain at zero for 15
minutes. The script is idempotent and keeps at least one Worker running.

Configure reconciliation for AI reports left in `processing` after a crashed or
interrupted Worker:

```powershell
.\scripts\aws\configure_stuck_job_cleanup_schedule.ps1 `
  -ImageUri "<account-id>.dkr.ecr.ap-northeast-2.amazonaws.com/aura-backend-api:<tag>"
```

EventBridge starts a short-lived ECS task every 30 minutes. The task marks only
reports that have remained `processing` for more than two hours as `failed` and
records `STUCK_JOB_TIMEOUT`. It does not touch intentionally queued `pending`
reports, retry jobs, delete SQS messages, or delete report/media data. Run the
same command manually with `--dry-run` before enabling a new cleanup policy:

```text
python -m app.ops.cleanup_stuck_jobs --timeout-minutes 120 --dry-run
```
## 9. Rollback

Fast rollback:

```env
AI_JOB_EXECUTION_MODE=inline
```

Redeploy the FastAPI API service with that value. This sends new jobs back through the local FastAPI execution path.

Then:

- Keep worker desired count at `0` if it is causing failures.
- Inspect SQS queue and DLQ before deleting messages.
- Do not delete pending messages unless the related `analysis_reports` rows are already terminal or intentionally abandoned.

## 10. Open Decisions

These are intentionally not locked by this branch:

- Whether a later retry/reconciliation job is needed for rare cases where the thumbnail is still unavailable during the `complete-upload` best-effort wait window.
- Whether analysis and image generation should eventually split into separate worker services.
- Autoscaling policy based on SQS queue depth.
- RDS Proxy need if worker count grows.
- Exact DLQ redrive policy and alert threshold.
