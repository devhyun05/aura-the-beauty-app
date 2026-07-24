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
visibility timeout: at least 15 minutes (preserve any longer existing value)
message retention: 4 days or longer
receive wait time: 20 seconds
max receive count before DLQ: 3
DLQ message retention: 14 days
```

Why at least 15 minutes: a face analysis plus generated recommendation image can take longer than a normal HTTP request. The worker deletes the message only after the handler succeeds.

The Worker normally omits a per-receive visibility override and inherits the
source queue setting. The `--visibility-timeout-seconds` CLI option is an
explicit operational override and must not silently diverge from this runbook.

The five-minute `ApproximateAgeOfOldestMessage` CloudWatch alarm is an
operational alert; it does not delete a message, stop a Worker, or invoke AI by
itself. The age is for the oldest message that has not been deleted, so the
message may be visible and waiting or invisible because a Worker already owns
it. A visible message that is only waiting does not consume provider inference,
but an in-flight message may already have an active Bedrock/OpenAI call. Treat
the alarm as a symptom and inspect visible count, in-flight count, Worker logs,
task stop reasons, and provider latency before deciding what happened.

Do not auto-delete a message at five minutes because that loses user work.
Messages whose dispatch keeps failing because of malformed input, an uncaught
exception, or an infrastructure crash move to the DLQ after three receives.
Provider or application failures that a handler catches, records as a terminal
database failure, and returns normally are deleted by the Worker;
`maxReceiveCount=3` is not three automatic external-AI retries.

Audit the queue and DLQ without changing AWS:

```powershell
.\scripts\aws\configure_ai_job_queue.ps1
```

Create missing queues or apply the documented redrive settings explicitly:

```powershell
.\scripts\aws\configure_ai_job_queue.ps1 -Apply
```

Apply mode links the source queue to the DLQ with `maxReceiveCount=3`,
uses `byQueue` redrive permission, preserves any source ARNs already allowed,
and adds the current source queue. It sets the DLQ message retention period to
14 days, never purges queues, and never lowers an existing retention or
visibility timeout. For a Standard SQS queue, moving a message to a DLQ does not
reset its original enqueue timestamp, so its actual remaining time in the DLQ
is shorter by the time it already spent in the source queue.

An existing DLQ with no explicit allow policy uses the SQS `allowAll` default.
The script refuses to replace an existing/default `allowAll` policy because the
DLQ may be shared by other source queues. Prefer a dedicated DLQ. Only after
checking that restricting the DLQ cannot break another source, opt in explicitly:

```powershell
.\scripts\aws\configure_ai_job_queue.ps1 -AllowRestrictExistingDlq -Apply
```

Most SQS attributes can take up to 60 seconds to propagate, while
`MessageRetentionPeriod` can take up to 15 minutes. The script first applies the
DLQ allow policy and retention, and attaches or changes the source
`RedrivePolicy` only after both are read back successfully. If it reports
`SOURCE_ATTACHMENT_STATUS=PENDING_DLQ_RETENTION` and `RETRY_REQUIRED=1`, it
exits nonzero so automation cannot treat the unfinished attachment as success.
Wait up to 15 minutes and rerun with `-Apply`; after it reports
`APPLIED_AND_VALIDATED`, rerun without `-Apply` for a final read-only check. Do
not automatically redrive DLQ messages:
inspect the error and terminal database row first.

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

The Worker task role also needs these narrowly scoped ECS permissions:

```text
ecs:GetTaskProtection on arn:aws:ecs:<region>:<account>:task/<cluster>/*
ecs:UpdateTaskProtection on arn:aws:ecs:<region>:<account>:task/<cluster>/*
```

Audit or apply the policy resolved from the active Worker service:

```powershell
# Read-only validation
.\scripts\aws\configure_ai_worker_task_protection.ps1

# Explicit mutation, followed by a read-back validation
.\scripts\aws\configure_ai_worker_task_protection.ps1 -Apply
```

Apply IAM before deploying code that requires task protection. In dev, the API
and Worker currently share a task role, but the policy resource is restricted
to tasks in the selected cluster and only the Worker calls the ECS agent
endpoint. Split the Worker onto a dedicated task role as a later least-privilege
hardening step.

For every non-empty SQS receive, the Worker uses this lifecycle:

```text
receive message
-> enable ECS task scale-in protection (30-minute expiry)
-> call the job handler and external AI provider
-> persist the terminal result
-> delete the SQS message
-> disable task scale-in protection
```

At startup, the Worker detects ECS from `AWS_EXECUTION_ENV` or
`ECS_CONTAINER_METADATA_URI_V4`. If ECS is detected but `ECS_AGENT_URI` is
missing, startup fails before the first SQS receive. When the URI exists,
protection remains fail-closed: if the agent does not confirm protection after
bounded retries, the Worker does not call AI, does not delete the message, and
exits so ECS can replace it. The message becomes available again after its
visibility timeout. Outside ECS, where the runtime markers and
`ECS_AGENT_URI` are absent, protection is skipped for local development and
unit tests.

Task protection prevents ECS Service Auto Scaling and rolling deployments from
selecting the busy task for termination. It does not prevent a process crash,
OOM, manual `StopTask`, Fargate infrastructure loss, or provider failure.
`maxReceiveCount=3` bounds repeated receives and moves a persistently
interrupted message to the DLQ instead of retrying forever. The dispatchers also
skip terminal database jobs, so a message redelivered after a completed result
does not call AI again.

No queue can provide exactly-once execution across an external provider call
and a database write. If a task dies after a provider accepts the request but
before the terminal result is persisted, a later receive can still repeat that
provider call. For job types or providers that support it, add a stable
job-based provider idempotency key or a durable invocation ledger and enforce a
per-job attempt/spend budget.

The 30-minute protection expiry is finite so a dead Worker cannot stay
protected forever. If any job can approach 30 minutes, add periodic protection
renewal and `ChangeMessageVisibility` renewal before enabling that workload;
task protection and SQS visibility are independent leases.

Start with:

```text
desired count: 2
```

For a service with about 200 registered users, size for the measured peak rather
than 200 simultaneous AI requests. The starting assumption is a burst of about
20 queued AI jobs: keep two Workers warm for normal traffic and task-level
redundancy, then allow Auto Scaling up to eight. Recheck the range after load
tests and whenever Bedrock quotas or RDS connection limits change.

The current task definition requests `0.5 vCPU` and `1 GB` per Worker. At the
AWS Fargate Linux/x86 on-demand rates queried for Seoul on 2026-07-24, that is
about `$0.02839` per task-hour. Two always-on Workers are about `$41.45` per
730-hour month; eight Workers would be about `$165.80` if they stayed at the cap
for the entire month. A one-hour burst of the six additional Workers is about
`$0.17`. Recheck current AWS pricing before a budget decision. These figures
exclude Bedrock/OpenAI calls, RDS, CloudWatch Logs, data transfer, taxes, and
currency conversion.

This is a starting configuration, not proof that 2-8 Workers is sufficient.
Before production, replay a mixed burst that includes analysis, feedback, filter
extraction, and standalone makeup recommendation jobs, then tune the maximum
against provider quotas, database connections, latency, and the approved budget.

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
4. Run `configure_ai_job_queue.ps1 -Apply`. If source attachment is pending, wait and rerun with `-Apply`; then rerun without `-Apply` to verify the source queue, DLQ, and redrive policy.
5. Run `configure_ai_worker_task_protection.ps1 -Apply`, then rerun it without `-Apply` and require `STATUS=VALIDATED`.
6. Deploy AI Worker ECS service with desired count `2`.
7. Change FastAPI API service to `AI_JOB_EXECUTION_MODE=sqs`.
8. Run an analysis job and watch job status move through `pending -> processing -> completed`.
9. Add S3 ObjectCreated trigger for media postprocess Lambda.
10. Upload an image and confirm thumbnail object creation.

This order keeps the API usable while the queue and worker are being attached.

## 8. Verification

From `services/backend`, run before deployment:

```powershell
python -m pytest tests/test_ai_job_queue.py tests/test_ai_job_worker.py tests/test_ai_job_worker_task_protection.py tests/test_media_postprocess_lambda.py -q
python -m pytest tests/test_ai_job_queue_infra.py tests/test_ai_job_queue_script_runtime.py tests/test_worker_capacity_tool.py -q
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
- SQS visible and not-visible message counts both return to zero after the final
  handler succeeds and deletes its message.
- DLQ remains empty during successful smoke tests.
- S3 thumbnail object appears under `/thumbnails/`.

Re-run the read-only queue safety check after infrastructure changes:

```powershell
.\scripts\aws\configure_ai_job_queue.ps1
```

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
.\scripts\aws\configure_ai_worker_autoscaling.ps1
```

The defaults are `MinCapacity=2` and `MaxCapacity=8`. On the first alarm breach,
the `ChangeInCapacity` policy adds two Workers for 1-4 visible jobs, four for
5-9, and six for 10 or more, capped by `MaxCapacity`. Because the two warm
Workers may already hold one message each, a 20-job burst can expose about 18
visible messages and request the eight-Worker cap in the first 60-second alarm
evaluation.

If the alarm remains active after the cooldown, Application Auto Scaling can
apply another `ChangeInCapacity` adjustment on a later breach until the queue
recovers or the eight-Worker cap is reached. Treat eight tasks as the maximum
queued-job concurrency for this ECS policy.

The task cap is not a hard external-provider call or cost cap: one analysis or
image job can fan out to multiple provider calls. Before production, verify
Bedrock/OpenAI quotas under load and add provider-specific concurrency or rate
limits where needed. Use AWS Budgets or provider usage alerts as the separate
spend guard; changing SQS retention does not cap inference spend.

The scale-in alarm removes only one Worker after visible and in-flight messages
have both remained at zero for 15 minutes. Its 900-second cooldown and the
two-Worker minimum reduce rapid scale-in and scale-out churn. They do not by
themselves eliminate a race with delayed SQS metrics: a Worker can receive a
new message after the most recent empty datapoint but before ECS applies a
scale-in decision. Task scale-in protection on each busy Worker is the
authoritative defense for that race.

Review the measured-duration capacity scenarios before applying the policy. The
calculator deterministically assigns the measured per-job p95 duration to every
simulated job; its output is a conservative planning scenario, not a statistical
end-to-end p95 forecast. It models the first alarm breach only and separates the
60-second alarm detection window from 60/90-second ECS task startup. Because
one-minute SQS samples are not phase-aligned with a burst, the calculator uses
the conservative capacity and cost assumption that the earliest sample still
sees every burst job as visible. A later sample can see fewer short jobs and
request fewer Workers; this assumption can therefore understate latency for
those short-job bursts. The calculator does not include extra SQS metric
publication delay:

```powershell
python .\scripts\calculate_worker_capacity.py --job-counts 5,10,20
```

For a 20-job burst whose first metric sample still contains at least 10 visible
jobs, the first breach requests the eight-Worker cap. With the current analysis
profile, the p95 and final user-ready time are about `339.6` seconds in both
startup cases. The last Worker handler completes, and can delete the final
in-flight SQS message, at about `402.2` seconds. A 90-second startup raises the
user-ready p50 from `157.9` to `187.9` seconds and the mean from `200.4` to
`218.4` seconds, although the tied final wave is unchanged.

The checked-in measurements cover analysis, feedback, and filter extraction;
standalone `makeup_recommendation` has no measured duration profile and is
explicitly excluded from the calculator. The filter-extraction profile has only
three samples, and the measurement date/environment was not recorded. Re-measure
all job types in the production-like environment before treating these numbers
as a capacity baseline. Additional metric publication delay, provider
throttling, retries, and database contention can increase the values. This is
not an SLO guarantee. Validate ECS cold-start time, provider quotas, RDS
connections, and mixed real traffic with a load test, and budget for up to eight
tasks while the alarm persists and throughout the gradual scale-in tail. The
policy removes one task after the first 15-minute empty-queue window and at most
one more per 900-second cooldown. Returning from eight to the two-task minimum
therefore takes roughly 90 minutes in ideal metric alignment and can approach
105 minutes after sampling, publication, and task-stop lag.

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
- RDS Proxy need if worker count grows.
- Whether load tests and Bedrock quotas justify changing the current 2-8 Worker range or splitting job types into separate queues.
- Operator approval and audit-trail requirements for replaying messages from the DLQ.
