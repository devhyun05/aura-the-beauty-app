import json
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.analysis import AnalysisJobCreate
from app.services.bedrock import BedrockService
from app.services.users import ensure_user


router = APIRouter(prefix="/analysis", tags=["analysis"])


async def mark_analysis_failed(
  db: Database,
  report_id: UUID,
  message: str,
  payload: AnalysisJobCreate,
) -> None:
  await db.execute(
    """
    update analysis_reports
    set status = 'failed',
        error_message = $2,
        detail_payload = $3::jsonb
    where id = $1
    """,
    report_id,
    message,
    json.dumps(
      {
        "request": payload.request_payload,
        "error": {"message": message},
      },
    ),
  )


@router.post("/jobs")
async def create_analysis_job(
  payload: AnalysisJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    insert into analysis_reports (
      user_id,
      photo_capture_id,
      source_media_id,
      preview_media_id,
      status,
      title,
      report_title,
      environment_label,
      detail_payload
    )
    values ($1, $2, $3, $4, 'pending', $5, $6, $7, $8::jsonb)
    returning *
    """,
    user["id"],
    payload.photo_capture_id,
    payload.source_media_id,
    payload.preview_media_id,
    payload.title,
    payload.report_title or payload.title,
    payload.environment_label,
    json.dumps({"request": payload.request_payload}),
  )

  if payload.run_immediately:
    await db.execute(
      "update analysis_reports set status = 'processing' where id = $1",
      report["id"],
    )

    try:
      result = await BedrockService(settings).analyze_image(payload.request_payload)
    except AppError as exc:
      await mark_analysis_failed(db, report["id"], exc.message, payload)
      raise
    except Exception as exc:
      message = "Bedrock analysis invocation failed."
      await mark_analysis_failed(db, report["id"], message, payload)
      raise AppError(
        status_code=502,
        code="BEDROCK_INVOCATION_FAILED",
        message=message,
        details={"reason": exc.__class__.__name__},
      ) from exc

    report = await db.fetchrow(
      """
      update analysis_reports
      set status = 'completed',
          ai_provider = 'bedrock',
          ai_model = $2,
          analyzed_at = now(),
          summary = coalesce($3, summary),
          short_summary = coalesce($4, short_summary),
          detail_payload = $5::jsonb
      where id = $1
      returning *
      """,
      report["id"],
      settings.bedrock_model_id,
      result.get("summary") if isinstance(result, dict) else None,
      result.get("short_summary") if isinstance(result, dict) else None,
      json.dumps({"request": payload.request_payload, "result": result}),
    )

  return success({"job": report})


@router.get("/jobs/{job_id}")
async def get_analysis_job(
  job_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  job = await db.fetchrow(
    """
    select *
    from analysis_reports
    where id = $1 and user_id = $2
    """,
    job_id,
    user["id"],
  )

  if not job:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  return success({"job": job})


@router.get("/reports")
async def list_analysis_reports(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  reports = await db.fetch(
    """
    select *
    from analysis_reports
    where user_id = $1
    order by created_at desc
    """,
    user["id"],
  )

  return success({"reports": reports})


@router.get("/reports/{report_id}")
async def get_analysis_report(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select *
    from analysis_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  return success({"report": report})