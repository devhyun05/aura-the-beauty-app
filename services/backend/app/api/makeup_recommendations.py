import json
import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.responses import success
from app.core.errors import AppError
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.makeup_recommendation import (
  MakeupQuestionRequest,
  MakeupRecommendationRefinementRequest,
  MakeupRecommendationRequest,
  MakeupScenarioRequest,
)
from app.services.makeup_recommendation import apply_refinement_contract, generate_questions, generate_recommendation, generate_scenarios
from app.services.makeup_recommendation_image import generate_recommendation_images
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.users import ensure_user


router = APIRouter(prefix="/makeup-recommendations", tags=["makeup-recommendations"])
logger = logging.getLogger(__name__)


def _json_value(value, fallback):
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return fallback
  return value if isinstance(value, type(fallback)) else fallback


async def run_recommendation_image_job(
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
  *,
  db: Database,
) -> None:
  report = await db.fetchrow(
    """
    select id, user_id, scenario_text, recommendation, image_status
    from makeup_recommendation_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user_id,
  )
  if report is None or report.get("image_status") == "completed":
    return
  await db.execute(
    "update makeup_recommendation_reports set image_status = 'processing', image_error = null where id = $1",
    report_id,
  )
  try:
    recommendation = report.get("recommendation")
    if isinstance(recommendation, str):
      recommendation = json.loads(recommendation)
    looks = recommendation.get("looks") if isinstance(recommendation, dict) else None
    if not isinstance(looks, list) or len(looks) != 3:
      raise AppError(502, "MAKEUP_RECOMMENDATION_LOOKS_INVALID", "The recommendation does not contain three looks.")
    generated_looks = await generate_recommendation_images(
      settings,
      report_id,
      str(report.get("scenario_text") or ""),
      looks,
    )
    completed_recommendation = {**recommendation, "looks": generated_looks}
    image_url = str(generated_looks[0].get("imageUrl") or "")
  except Exception as exc:
    message = exc.message if isinstance(exc, AppError) else "Recommendation image generation failed."
    logger.exception("[aura:makeup-recommendation] image:failed reportId=%s", report_id)
    await db.execute(
      "update makeup_recommendation_reports set image_status = 'failed', image_error = $2 where id = $1",
      report_id,
      message,
    )
    return
  await db.execute(
    """
    update makeup_recommendation_reports
    set image_status = 'completed', recommendation = $2::jsonb, image_url = $3, image_error = null
    where id = $1
    """,
    report_id,
    json.dumps(completed_recommendation, ensure_ascii=False),
    image_url,
  )


async def dispatch_recommendation_image_job(
  *,
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
) -> str:
  execution_mode = settings.ai_job_execution_mode_normalized
  if execution_mode == "inline":
    background_tasks.add_task(run_recommendation_image_job, report_id, user_id, settings, db=db)
    return "pending"
  try:
    if execution_mode != "sqs":
      raise AppError(
        503,
        "AI_JOB_EXECUTION_MODE_INVALID",
        "AI_JOB_EXECUTION_MODE must be inline or sqs.",
        {"executionMode": execution_mode},
      )
    publisher = AIJobQueuePublisher(settings)
    await asyncio.to_thread(publisher.publish_makeup_recommendation_job, report_id, user_id)
    return "pending"
  except Exception as exc:
    message = exc.message if isinstance(exc, AppError) else "Recommendation image job dispatch failed."
    logger.exception("[aura:makeup-recommendation] image-dispatch:failed reportId=%s", report_id)
    await db.execute(
      "update makeup_recommendation_reports set image_status = 'failed', image_error = $2 where id = $1",
      report_id,
      message,
    )
    return "failed"


@router.post("/scenarios")
async def create_scenarios(payload: MakeupScenarioRequest, settings: Settings = Depends(get_settings), _: AuthContext = Depends(get_current_user)) -> dict:
  return success(await generate_scenarios(settings, payload.count, payload.exclude_texts))


@router.post("/questions")
async def create_questions(payload: MakeupQuestionRequest, settings: Settings = Depends(get_settings), _: AuthContext = Depends(get_current_user)) -> dict:
  return success(await generate_questions(settings, payload.scenario_text, payload.scenario_tags))


@router.post("")
async def create_recommendation(
  payload: MakeupRecommendationRequest,
  background_tasks: BackgroundTasks,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  recommendation = await generate_recommendation(settings, payload.scenario_text, payload.scenario_tags, payload.questions, payload.answers)
  row = await db.fetchrow(
    """
    insert into makeup_recommendation_reports
      (user_id, scenario_text, scenario_tags, questions, answers, recommendation,
       scenario_model_id, question_model_id, recommendation_model_id, image_model_id, prompt_version)
    values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
    returning id
    """,
    user["id"],
    payload.scenario_text,
    json.dumps(payload.scenario_tags, ensure_ascii=False),
    json.dumps(payload.questions, ensure_ascii=False),
    json.dumps(payload.answers, ensure_ascii=False),
    json.dumps(recommendation, ensure_ascii=False),
    settings.effective_scenario_model_id,
    settings.effective_question_model_id,
    settings.effective_recommendation_model_id,
    settings.openai_image_model_id,
    "makeup-recommendation-v1",
  )
  image_status = await dispatch_recommendation_image_job(
    db=db,
    background_tasks=background_tasks,
    report_id=row["id"],
    user_id=user["id"],
    settings=settings,
  )
  return success({"reportId": row["id"], "recommendation": recommendation, "imageStatus": image_status or "pending"})


@router.get("")
async def list_recommendation_reports(
  limit: int = Query(default=20, ge=1, le=50),
  offset: int = Query(default=0, ge=0),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  reports = await db.fetch(
    """
    select id, scenario_text, recommendation, image_status, image_url, image_error, created_at, updated_at
    from makeup_recommendation_reports
    where user_id = $1
    order by created_at desc
    limit $2 offset $3
    """,
    user["id"],
    limit,
    offset,
  )
  return success({"reports": reports, "limit": limit, "offset": offset})


@router.post("/{report_id}/image/retry")
async def retry_recommendation_images(
  report_id: UUID,
  background_tasks: BackgroundTasks,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    "select id, image_status from makeup_recommendation_reports where id = $1 and user_id = $2",
    report_id,
    user["id"],
  )
  if report is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")
  if report.get("image_status") == "completed":
    return success({"reportId": report_id, "imageStatus": "completed"})
  if report.get("image_status") == "processing":
    raise AppError(409, "MAKEUP_RECOMMENDATION_IMAGE_PROCESSING", "Recommendation images are already being generated.")

  await db.execute(
    "update makeup_recommendation_reports set image_status = 'pending', image_error = null where id = $1",
    report_id,
  )
  image_status = await dispatch_recommendation_image_job(
    db=db,
    background_tasks=background_tasks,
    report_id=report_id,
    user_id=user["id"],
    settings=settings,
  )
  return success({"reportId": report_id, "imageStatus": image_status or "pending"})


@router.post("/{report_id}/refine")
async def refine_recommendation_report(
  report_id: UUID,
  payload: MakeupRecommendationRefinementRequest,
  background_tasks: BackgroundTasks,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  source = await db.fetchrow(
    """
    select id, scenario_text, scenario_tags, questions, answers, recommendation
    from makeup_recommendation_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )
  if source is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")

  scenario_tags = _json_value(source.get("scenario_tags"), [])
  questions = _json_value(source.get("questions"), [])
  answers = _json_value(source.get("answers"), [])
  previous_recommendation = _json_value(source.get("recommendation"), {})
  refinement_instructions = {
    "natural": "Keep the three roles but make color, texture, and lines one step more natural.",
    "hip": "Keep the three roles but add a more current, expressive texture or focal point.",
    "differentColor": "Keep the concepts and constraints but change each look to a meaningfully different color family.",
    "replaceProducts": "Keep every look, step, color, and technique unchanged; replace only the product suggestions.",
  }
  refined_answers = [
    *answers,
    {
      "refinement": payload.refinement,
      "instruction": refinement_instructions[payload.refinement],
      "previousRecommendation": previous_recommendation,
    },
  ]
  recommendation = await generate_recommendation(
    settings,
    str(source.get("scenario_text") or ""),
    scenario_tags,
    questions,
    refined_answers,
  )
  recommendation = apply_refinement_contract(previous_recommendation, recommendation, payload.refinement)
  row = await db.fetchrow(
    """
    insert into makeup_recommendation_reports
      (user_id, scenario_text, scenario_tags, questions, answers, recommendation,
       scenario_model_id, question_model_id, recommendation_model_id, image_model_id,
       prompt_version, parent_report_id, refinement_type)
    values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
    returning id
    """,
    user["id"],
    source["scenario_text"],
    json.dumps(scenario_tags, ensure_ascii=False),
    json.dumps(questions, ensure_ascii=False),
    json.dumps(refined_answers, ensure_ascii=False),
    json.dumps(recommendation, ensure_ascii=False),
    settings.effective_scenario_model_id,
    settings.effective_question_model_id,
    settings.effective_recommendation_model_id,
    settings.openai_image_model_id,
    "makeup-recommendation-v2",
    report_id,
    payload.refinement,
  )
  image_status = await dispatch_recommendation_image_job(
    db=db,
    background_tasks=background_tasks,
    report_id=row["id"],
    user_id=user["id"],
    settings=settings,
  )
  return success({"reportId": row["id"], "recommendation": recommendation, "imageStatus": image_status or "pending"})


@router.get("/{report_id}")
async def get_recommendation_report(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select id, scenario_text, scenario_tags, questions, answers, recommendation,
           image_status, image_url, image_error, created_at, updated_at
    from makeup_recommendation_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )
  if report is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")
  return success(report)
