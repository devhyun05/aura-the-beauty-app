import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.beard import BeardJobCreate, BeardUploadUrlRequest
from app.schemas.beard_report import BeardAnalysisRequest
from app.services.beard_analysis import build_beard_analysis_result_for_request
from app.services.beard_lambda import BeardLambdaClient
from app.services.users import ensure_user


router = APIRouter(prefix="/beard", tags=["beard"])
logger = logging.getLogger(__name__)

# Job lifecycle: pending -> processing -> completed|failed. Terminal rows are
# never re-driven against the Lambda.
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
# Stall guard: a job stuck warming/simulating or waiting on SSM for too long is
# forced to a terminal failure instead of polling the Lambda forever.
PENDING_STALL_SECONDS = 6 * 60
PROCESSING_STALL_SECONDS = 10 * 60
# SSM RunCommand invocation states surfaced by the Lambda `result` action.
SSM_SUCCESS_STATUS = "Success"
SSM_FAILURE_STATUSES = {"Failed", "Cancelled", "TimedOut"}
BEARD_JOB_TIMEOUT_MESSAGE = "BEARD_JOB_TIMEOUT"


def _map_beard_job(row: dict[str, Any]) -> dict[str, Any]:
  # Whitelist the client-facing fields; flux_command_id and raw error_details
  # stay server-side only.
  return {
    "id": str(row["id"]),
    "status": row.get("status"),
    "path": row.get("path"),
    "instanceState": row.get("instance_state"),
    "resultUrl": row.get("result_url"),
    "errorMessage": row.get("error_message"),
    "createdAt": row.get("created_at"),
    "updatedAt": row.get("updated_at"),
  }


def _job_age_seconds(row: dict[str, Any]) -> float:
  created_at = row.get("created_at")

  if not isinstance(created_at, datetime):
    return 0.0

  if created_at.tzinfo is None:
    created_at = created_at.replace(tzinfo=timezone.utc)

  return (datetime.now(timezone.utc) - created_at).total_seconds()


def _is_stalled(row: dict[str, Any]) -> bool:
  status = row.get("status")
  age = _job_age_seconds(row)

  if status == "pending":
    return age > PENDING_STALL_SECONDS

  if status == "processing":
    return age > PROCESSING_STALL_SECONDS

  return False


async def _fail_job(db: Database, row: dict[str, Any], message: str) -> dict[str, Any]:
  updated = await db.fetchrow(
    """
    update beard_jobs
    set status = 'failed',
        error_message = $2,
        updated_at = now()
    where id = $1
    returning *
    """,
    row["id"],
    message,
  )

  return updated or {**row, "status": "failed", "error_message": message}


async def _advance_pending_job(
  client: BeardLambdaClient,
  db: Database,
  row: dict[str, Any],
) -> dict[str, Any]:
  response = await client.simulate(row["input_key"], row.get("output_key"))
  lambda_status = response.get("status")

  if lambda_status == "processing":
    updated = await db.fetchrow(
      """
      update beard_jobs
      set status = 'processing',
          flux_command_id = $2,
          output_key = coalesce($3, output_key),
          attempt_count = attempt_count + 1,
          updated_at = now()
      where id = $1
      returning *
      """,
      row["id"],
      response.get("commandId"),
      response.get("outputKey"),
    )

    return updated or row

  if lambda_status == "warming":
    updated = await db.fetchrow(
      """
      update beard_jobs
      set instance_state = $2,
          attempt_count = attempt_count + 1,
          updated_at = now()
      where id = $1
      returning *
      """,
      row["id"],
      response.get("instanceState"),
    )

    return updated or row

  return row


async def _advance_processing_job(
  client: BeardLambdaClient,
  db: Database,
  row: dict[str, Any],
) -> dict[str, Any]:
  response = await client.result(row.get("flux_command_id"), row.get("output_key"))
  ssm_status = response.get("status")

  if ssm_status == SSM_SUCCESS_STATUS:
    updated = await db.fetchrow(
      """
      update beard_jobs
      set status = 'completed',
          result_url = $2,
          error_message = null,
          updated_at = now()
      where id = $1
      returning *
      """,
      row["id"],
      response.get("resultUrl"),
    )

    return updated or row

  if ssm_status in SSM_FAILURE_STATUSES:
    message = response.get("errorMessage") or ssm_status
    return await _fail_job(db, row, message)

  return row


async def _advance_job(
  client: BeardLambdaClient,
  db: Database,
  row: dict[str, Any],
) -> dict[str, Any]:
  status = row.get("status")

  if status in TERMINAL_STATUSES:
    return row

  if _is_stalled(row):
    return await _fail_job(db, row, BEARD_JOB_TIMEOUT_MESSAGE)

  if status == "pending":
    return await _advance_pending_job(client, db, row)

  if status == "processing":
    return await _advance_processing_job(client, db, row)

  return row


@router.post("/upload-url")
async def create_beard_upload_url(
  payload: BeardUploadUrlRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  client = BeardLambdaClient(settings)
  # Never let client-controlled text into the S3 key: scope uploads to the user id.
  result = await client.upload_url(str(user["id"]))

  return success(result)


@router.post("/prewarm")
async def prewarm_beard_lambda(
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  client = BeardLambdaClient(settings)

  return success(await client.prewarm())


@router.post("/jobs")
async def create_beard_job(
  payload: BeardJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    """
    insert into beard_jobs (user_id, status, path, input_key, survey_payload)
    values ($1, 'pending', $2, $3, $4::jsonb)
    returning *
    """,
    user["id"],
    payload.path,
    payload.input_key,
    json.dumps(payload.survey),
  )

  client = BeardLambdaClient(settings)
  advanced = await _advance_job(client, db, row)

  return success(_map_beard_job(advanced))


@router.get("/jobs/{job_id}")
async def get_beard_job(
  job_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    """
    select *
    from beard_jobs
    where id = $1 and user_id = $2
    """,
    job_id,
    user["id"],
  )

  if not row:
    raise AppError(404, "BEARD_JOB_NOT_FOUND", "Beard job was not found.")

  client = BeardLambdaClient(settings)
  advanced = await _advance_job(client, db, row)

  return success(_map_beard_job(advanced))


@router.post("/report")
async def create_beard_report(
  payload: BeardAnalysisRequest,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  # Subsystem C: stateless Bedrock (Claude Sonnet) "상세 보고서" generator.
  # NO silent fallback — any Bedrock failure / parse error / forbidden term
  # raises an explicit AppError so the app can show a real error, never a
  # fabricated report.
  if not payload.guard_passed:
    raise AppError(
      400,
      "BEARD_ANALYSIS_GUARD_NOT_PASSED",
      "원본 보존이 확인되지 않아 상세 보고서를 만들 수 없어요.",
    )

  # The selfie was uploaded via /beard/upload-url into the FLUX bucket (us-west-2),
  # NOT the app media bucket — default there so the report reads the right object.
  request_payload = {
    "imageKey": payload.image_key,
    "bucket": payload.bucket or settings.beard_s3_bucket or settings.s3_bucket_name,
    "bucketRegion": settings.beard_lambda_region if not payload.bucket else None,
    "contentType": payload.content_type,
    "survey": payload.survey.model_dump(),
  }

  analysis = await build_beard_analysis_result_for_request(request_payload, settings)
  logger.info("[aura:beard-api] report:completed userSub=%s", auth.subject)

  return success({"analysis": analysis, "analysisStatus": "completed"})
