import json
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.analysis import FilterExtractionAnalyzeRequest, FilterExtractionJobCreate
from app.services.reference_makeup_extraction import (
  MODEL_VERSION,
  build_reference_makeup_extraction_payload_for_request,
  enrich_reference_makeup_products,
)
from app.services.owned_media import resolve_owned_source_media, trusted_media_request_payload
from app.services.users import ensure_user


router = APIRouter(prefix="/filter-extractions", tags=["filter-extractions"])


@router.post("/jobs")
async def create_filter_extraction_job(
  payload: FilterExtractionJobCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  media = await resolve_owned_source_media(
    db,
    owner_user_id=user["id"],
    media_id=payload.result_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=False,
  )
  request_payload = trusted_media_request_payload(settings, payload.request_payload, media)
  report = await db.fetchrow(
    """
    insert into filter_extraction_reports (
      user_id,
      photo_capture_id,
      result_media_id,
      status,
      title,
      subtitle,
      result_payload
    )
    values ($1, $2, $3, 'pending', $4, $5, $6::jsonb)
    returning *
    """,
    user["id"],
    payload.photo_capture_id,
    payload.result_media_id,
    payload.title,
    payload.subtitle,
    json.dumps({"request": request_payload}),
  )

  return success({"job": report})


@router.post("/analyze")
async def analyze_filter_extraction(
  payload: FilterExtractionAnalyzeRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  media = await resolve_owned_source_media(
    db,
    owner_user_id=user["id"],
    media_id=payload.result_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=payload.run_ai,
  )
  payload = payload.model_copy(
    update={
      "request_payload": trusted_media_request_payload(
        settings,
        payload.request_payload,
        media,
      ),
    },
  )
  extraction_payload, ai_status, ai_error = await build_reference_makeup_extraction_payload_for_request(
    payload,
    settings,
  )
  extraction_payload, product_source = await enrich_reference_makeup_products(
    db,
    settings,
    extraction_payload,
  )
  extracted_look = extraction_payload["extracted_makeup_look"]

  report = await db.fetchrow(
    """
    insert into filter_extraction_reports (
      user_id,
      photo_capture_id,
      result_media_id,
      status,
      title,
      subtitle,
      tags,
      accuracy,
      model_version,
      result_payload,
      completed_at
    )
    values ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9::jsonb, now())
    returning *
    """,
    user["id"],
    payload.photo_capture_id,
    payload.result_media_id,
    extracted_look["title"],
    extracted_look.get("subtitle"),
    extracted_look.get("tags"),
    extracted_look.get("accuracy"),
    MODEL_VERSION,
    json.dumps(
      {
        "request": payload.request_payload,
        "result": extraction_payload,
        "runAi": payload.run_ai,
        "productSource": product_source,
        "aiStatus": ai_status,
        "aiError": ai_error,
      },
      ensure_ascii=False,
    ),
  )

  return success(
    {
      "report": report,
      "loading_steps": extraction_payload["loading_steps"],
      "extracted_makeup_look": extracted_look,
      "product_source": product_source,
      "ai_status": ai_status,
      "ai_error": ai_error,
      "run_ai": payload.run_ai,
    },
  )


@router.get("/{report_id}")
async def get_filter_extraction(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select *
    from filter_extraction_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )

  if not report:
    from app.core.errors import AppError

    raise AppError(404, "FILTER_EXTRACTION_NOT_FOUND", "Filter extraction report was not found.")

  return success({"report": report})
