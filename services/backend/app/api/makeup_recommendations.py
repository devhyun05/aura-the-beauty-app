import json
import asyncio
import logging
import math
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query

from app.core.responses import success
from app.core.errors import AppError
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.makeup_recommendation import (
  MakeupQuestionRequest,
  MakeupRecommendationEventRequest,
  MakeupRecommendationGenerate,
  MakeupRecommendationImageRetryRequest,
  MakeupRecommendationRefinementRequest,
  MakeupRecommendationSessionAnswer,
  MakeupRecommendationSessionCreate,
  MakeupRecommendationRequest,
  MakeupScenarioRequest,
)
from app.services.makeup_recommendation import (
  apply_refinement_contract,
  enforce_scenario_generation_limit,
  generate_questions,
  generate_recommendation,
  generate_recommendation_v2,
  generate_shared_scenarios,
)
from app.services.makeup_editorial_question_templates import resolve_reviewed_editorial_preset
from app.services.makeup_recommendation_image import (
  PersonalizedImageInput,
  generate_recommendation_images,
)
from app.services.makeup_feedback_vision import (
  extract_makeup_face_crop_metadata,
  extract_personalized_makeup_face_metadata,
)
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.makeup_recommendation_prompt import (
  adapt_v1_recommendation,
  sanitize_recommendation_context,
)
from app.services.makeup_recommendation_fit import (
  build_post_image_fit_assessment,
)
from app.services.makeup_recommendation_match import attach_match_assessment
from app.services.makeup_recommendation_products import enrich_makeup_recommendation_products
from app.services.makeup_report_product_snapshots import (
  dispatch_makeup_report_product_snapshot_jobs,
  ensure_makeup_report_product_snapshots,
  run_makeup_report_product_snapshot_jobs,
  snapshot_job_is_schedulable,
)
from app.services.makeup_recommendation_session import (
  answer_session,
  begin_generation,
  complete_generation,
  create_session,
  fail_generation,
  get_owned_session,
  session_response,
)
from app.services.makeup_trends import curated_fallback_discovery, fetch_discovery, fetch_source_report_projections
from app.services.push_notifications import create_and_send_notification
from app.services.s3 import S3Service
from app.services.users import ensure_user


router = APIRouter(prefix="/makeup-recommendations", tags=["makeup-recommendations"])
logger = logging.getLogger(__name__)
MAKEUP_CROP_BACKFILL_MAX_BYTES = 20 * 1024 * 1024
MAKEUP_CROP_BACKFILL_MARKER_KEY = "cropMetadataBackfill"
MAKEUP_CROP_BACKFILL_MARKER_VERSION = "makeup-face-crop-backfill-v1"
MAKEUP_CROP_BACKFILL_PROCESSING_TTL = timedelta(minutes=5)
MAKEUP_CROP_BACKFILL_FAILURE_TTL = timedelta(minutes=15)
MAKEUP_CROP_BACKFILL_NO_FACE_TTL = timedelta(hours=24)
MAKEUP_ALIGNMENT_BACKFILL_MAX_BYTES = MAKEUP_CROP_BACKFILL_MAX_BYTES
MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY = "alignmentMetadataBackfill"
MAKEUP_ALIGNMENT_BACKFILL_MARKER_VERSION = "makeup-face-alignment-backfill-v1"
MAKEUP_ALIGNMENT_METADATA_VERSION = "makeup-face-alignment-v1"
MAKEUP_ALIGNMENT_BACKFILL_PROCESSING_TTL = timedelta(minutes=5)
MAKEUP_ALIGNMENT_BACKFILL_FAILURE_TTL = timedelta(minutes=15)
MAKEUP_ALIGNMENT_BACKFILL_NO_FACE_TTL = timedelta(hours=24)


def _require_makeup_v2(settings: Settings) -> None:
  if not settings.makeup_recommendation_v2_enabled:
    raise AppError(404, "MAKEUP_RECOMMENDATION_V2_DISABLED", "Makeup recommendation V2 is disabled.")


def _require_makeup_v1_compat(settings: Settings) -> None:
  if not settings.makeup_recommendation_v1_compat_enabled:
    raise AppError(410, "MAKEUP_RECOMMENDATION_V1_DISABLED", "Legacy makeup recommendation generation is disabled.")


_RECOMMENDATION_LIST_PRIVATE_FIELDS = frozenset({
  # analysisReportId/sourceAnalysisReportId are domain links used to restore saved-report context.
  # Strip only storage and raw media-delivery identifiers, including generic payload variants.
  "bucket",
  "storageBucket",
  "storage_bucket",
  "objectKey",
  "object_key",
  "mediaId",
  "media_id",
  "inputMediaId",
  "input_media_id",
  "sourceMediaId",
  "source_media_id",
})


def _sanitize_recommendation_list_value(value: object) -> object:
  if isinstance(value, dict):
    return {
      key: _sanitize_recommendation_list_value(item)
      for key, item in value.items()
      if key not in _RECOMMENDATION_LIST_PRIVATE_FIELDS
    }
  if isinstance(value, list):
    return [_sanitize_recommendation_list_value(item) for item in value]
  return value


def _sanitize_recommendation_list_context(context_snapshot: object) -> dict:
  context = sanitize_recommendation_context(_json_value(context_snapshot, {}))
  sanitized = _sanitize_recommendation_list_value(context)
  return sanitized if isinstance(sanitized, dict) else {}


def _recommendation_preview_status(value: object) -> str:
  status = str(value or "pending")
  return status if status in {"pending", "processing", "partial", "completed", "failed"} else "pending"


def _public_preview_url(value: object) -> str | None:
  normalized = str(value or "").strip()
  parsed = urlparse(normalized)
  return normalized if parsed.scheme.lower() in {"http", "https"} and parsed.netloc else None


def _recommendation_preview(
  report: dict,
  asset: dict | None,
  *,
  settings: Settings,
  s3_service: S3Service,
) -> tuple[str | None, str]:
  if asset is not None:
    status = _recommendation_preview_status(asset.get("status"))
    if status != "completed":
      return None, status

    if asset.get("is_private"):
      bucket = str(asset.get("storage_bucket") or "")
      object_key = str(asset.get("object_key") or "")
      if not bucket or not object_key:
        return None, status
      try:
        return (
          s3_service.create_presigned_download(
            bucket=bucket,
            object_key=object_key,
            expires_in=settings.makeup_private_url_ttl_seconds,
          ),
          status,
        )
      except Exception:
        logger.exception(
          "[aura:makeup-recommendation] preview-delivery:presign-failed reportId=%s",
          report.get("id"),
        )
        return None, status

    public_asset_url = _public_preview_url(asset.get("image_url"))
    if public_asset_url:
      return public_asset_url, status
    public_report_url = _public_preview_url(report.get("image_url"))
    if str(report.get("image_mode") or "generic") == "generic" and public_report_url:
      return public_report_url, status
    return None, status

  status = _recommendation_preview_status(report.get("image_status"))
  is_public_fallback = (
    str(report.get("schema_version") or "makeup-recommendation-v1") != "makeup-recommendation-v2"
    or str(report.get("image_mode") or "generic") == "generic"
  )
  public_report_url = _public_preview_url(report.get("image_url"))
  if is_public_fallback and status == "completed" and public_report_url:
    return public_report_url, status
  return None, status


@router.post("/events")
async def record_makeup_recommendation_event(
  payload: MakeupRecommendationEventRequest,
  _auth: AuthContext = Depends(get_current_user),
) -> dict:
  metadata = payload.metadata.model_dump(by_alias=True, exclude_none=True)
  logger.info(
    "makeup_recommendation_event",
    extra={"event_name": payload.event_name, "event_metadata": metadata},
  )
  return success({"accepted": True})

def _json_value(value, fallback):
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return fallback
  return value if isinstance(value, type(fallback)) else fallback


def _crop_backfill_now() -> datetime:
  return datetime.now(timezone.utc)


def _crop_backfill_timestamp(value: object) -> datetime | None:
  if not isinstance(value, str) or not value.strip():
    return None
  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError:
    return None
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=timezone.utc)
  return parsed.astimezone(timezone.utc)


def _crop_backfill_marker_is_fresh(marker: object, *, now: datetime) -> bool:
  if not isinstance(marker, dict) or marker.get("version") != MAKEUP_CROP_BACKFILL_MARKER_VERSION:
    return False
  retry_after = _crop_backfill_timestamp(marker.get("retryAfter"))
  if retry_after is not None:
    return retry_after > now
  attempted_at = _crop_backfill_timestamp(marker.get("attemptedAt"))
  if attempted_at is None:
    return False
  retry_ttl = {
    "processing": MAKEUP_CROP_BACKFILL_PROCESSING_TTL,
    "failed": MAKEUP_CROP_BACKFILL_FAILURE_TTL,
    "no-face": MAKEUP_CROP_BACKFILL_NO_FACE_TTL,
  }.get(str(marker.get("status") or ""))
  return retry_ttl is not None and attempted_at + retry_ttl > now


def _crop_backfill_marker(
  *,
  status: str,
  attempted_at: datetime,
  retry_ttl: timedelta | None,
) -> dict:
  marker = {
    "version": MAKEUP_CROP_BACKFILL_MARKER_VERSION,
    "status": status,
    "attemptedAt": attempted_at.isoformat().replace("+00:00", "Z"),
  }
  if retry_ttl is not None:
    marker["retryAfter"] = (
      attempted_at + retry_ttl
    ).isoformat().replace("+00:00", "Z")
  return marker


async def _persist_crop_backfill_result(
  *,
  report_id: UUID,
  look_id: str,
  db: Database,
  claim_marker: dict,
  result_marker: dict,
  crop_metadata: dict | None,
) -> dict | None:
  return await db.fetchrow(
    """
    update makeup_recommendation_assets
    set provenance = coalesce(provenance, '{}'::jsonb)
          || jsonb_build_object($3::text, $4::jsonb)
          || case
               when $5::jsonb is null then '{}'::jsonb
               else jsonb_build_object('cropMetadata', $5::jsonb)
             end,
        updated_at = now()
    where report_id = $1 and look_id = $2 and status = 'completed'
      and not (coalesce(provenance, '{}'::jsonb) ? 'cropMetadata')
      and coalesce(provenance, '{}'::jsonb) -> $3::text = $6::jsonb
    returning provenance
    """,
    report_id,
    look_id,
    MAKEUP_CROP_BACKFILL_MARKER_KEY,
    json.dumps(result_marker),
    json.dumps(crop_metadata) if crop_metadata is not None else None,
    json.dumps(claim_marker),
  )


async def _lazy_backfill_recommendation_crop_metadata(
  *,
  report_id: UUID,
  look_id: str,
  asset: dict,
  db: Database,
  settings: Settings,
) -> dict:
  provenance = _json_value(asset.get("provenance"), {})
  if (
    asset.get("status") != "completed"
    or isinstance(provenance.get("cropMetadata"), dict)
    or not asset.get("storage_bucket")
    or not asset.get("object_key")
  ):
    return provenance

  now = _crop_backfill_now()
  previous_marker = provenance.get(MAKEUP_CROP_BACKFILL_MARKER_KEY)
  if _crop_backfill_marker_is_fresh(previous_marker, now=now):
    return provenance

  claim_marker = _crop_backfill_marker(
    status="processing",
    attempted_at=now,
    retry_ttl=MAKEUP_CROP_BACKFILL_PROCESSING_TTL,
  )
  has_previous_marker = MAKEUP_CROP_BACKFILL_MARKER_KEY in provenance
  try:
    claimed = await db.fetchrow(
      """
      update makeup_recommendation_assets
      set provenance = coalesce(provenance, '{}'::jsonb)
            || jsonb_build_object($3::text, $4::jsonb),
          updated_at = now()
      where report_id = $1 and look_id = $2 and status = 'completed'
        and not (coalesce(provenance, '{}'::jsonb) ? 'cropMetadata')
        and (
          ($5::jsonb is null and not (coalesce(provenance, '{}'::jsonb) ? $3::text))
          or coalesce(provenance, '{}'::jsonb) -> $3::text = $5::jsonb
        )
      returning provenance
      """,
      report_id,
      look_id,
      MAKEUP_CROP_BACKFILL_MARKER_KEY,
      json.dumps(claim_marker),
      json.dumps(previous_marker) if has_previous_marker else None,
    )
  except Exception:  # noqa: BLE001 - legacy crop metadata must stay a soft enhancement.
    logger.warning(
      "[aura:makeup-recommendation] crop-backfill:claim-failed reportId=%s lookId=%s",
      report_id,
      look_id,
      exc_info=True,
    )
    return provenance
  if claimed is None:
    return provenance

  claimed_provenance = _json_value(
    claimed.get("provenance"),
    {
      **provenance,
      MAKEUP_CROP_BACKFILL_MARKER_KEY: claim_marker,
    },
  )
  bucket = str(asset["storage_bucket"])
  object_key = str(asset["object_key"])
  crop_metadata: dict | None = None
  result_status = "failed"
  retry_ttl: timedelta | None = MAKEUP_CROP_BACKFILL_FAILURE_TTL
  try:
    s3 = S3Service(settings)
    s3.assert_managed_media_location(bucket=bucket, object_key=object_key)
    image_bytes, _content_type = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=bucket,
      object_key=object_key,
      max_bytes=MAKEUP_CROP_BACKFILL_MAX_BYTES,
    )
    detected_metadata = await asyncio.to_thread(
      extract_makeup_face_crop_metadata,
      image_bytes,
    )
  except Exception:  # noqa: BLE001 - legacy crop metadata must stay a soft enhancement.
    logger.warning(
      "[aura:makeup-recommendation] crop-backfill:skipped reportId=%s lookId=%s",
      report_id,
      look_id,
      exc_info=True,
    )
  else:
    if isinstance(detected_metadata, dict):
      crop_metadata = detected_metadata
      result_status = "completed"
      retry_ttl = None
    else:
      result_status = "no-face"
      retry_ttl = MAKEUP_CROP_BACKFILL_NO_FACE_TTL
      logger.info(
        "[aura:makeup-recommendation] crop-backfill:face-unavailable reportId=%s lookId=%s",
        report_id,
        look_id,
      )

  result_marker = _crop_backfill_marker(
    status=result_status,
    attempted_at=now,
    retry_ttl=retry_ttl,
  )
  updated_provenance = {
    **claimed_provenance,
    MAKEUP_CROP_BACKFILL_MARKER_KEY: result_marker,
  }
  if crop_metadata is not None:
    updated_provenance["cropMetadata"] = crop_metadata

  try:
    persisted = await _persist_crop_backfill_result(
      report_id=report_id,
      look_id=look_id,
      db=db,
      claim_marker=claim_marker,
      result_marker=result_marker,
      crop_metadata=crop_metadata,
    )
  except Exception:  # noqa: BLE001 - the image response must stay available.
    logger.warning(
      "[aura:makeup-recommendation] crop-backfill:persist-failed reportId=%s lookId=%s",
      report_id,
      look_id,
      exc_info=True,
    )
    return updated_provenance

  if persisted is None:
    return updated_provenance
  return _json_value(persisted.get("provenance"), updated_provenance)


def _alignment_backfill_now() -> datetime:
  return datetime.now(timezone.utc)


def _alignment_backfill_marker_is_fresh(marker: object, *, now: datetime) -> bool:
  if not isinstance(marker, dict) or marker.get("version") != MAKEUP_ALIGNMENT_BACKFILL_MARKER_VERSION:
    return False
  retry_after = _crop_backfill_timestamp(marker.get("retryAfter"))
  if retry_after is not None:
    return retry_after > now
  attempted_at = _crop_backfill_timestamp(marker.get("attemptedAt"))
  if attempted_at is None:
    return False
  retry_ttl = {
    "processing": MAKEUP_ALIGNMENT_BACKFILL_PROCESSING_TTL,
    "failed": MAKEUP_ALIGNMENT_BACKFILL_FAILURE_TTL,
    "no-face": MAKEUP_ALIGNMENT_BACKFILL_NO_FACE_TTL,
  }.get(str(marker.get("status") or ""))
  return retry_ttl is not None and attempted_at + retry_ttl > now


def _alignment_backfill_marker(
  *,
  status: str,
  attempted_at: datetime,
  retry_ttl: timedelta | None,
) -> dict:
  marker = {
    "version": MAKEUP_ALIGNMENT_BACKFILL_MARKER_VERSION,
    "status": status,
    "attemptedAt": attempted_at.isoformat().replace("+00:00", "Z"),
  }
  if retry_ttl is not None:
    marker["retryAfter"] = (
      attempted_at + retry_ttl
    ).isoformat().replace("+00:00", "Z")
  return marker


def _alignment_number(value: object) -> float | None:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  number = float(value)
  return number if math.isfinite(number) else None


def _minimal_alignment_point(value: object) -> dict[str, float] | None:
  if not isinstance(value, dict):
    return None
  x = _alignment_number(value.get("x"))
  y = _alignment_number(value.get("y"))
  if x is None or y is None or not (0 <= x <= 1 and 0 <= y <= 1):
    return None
  return {"x": x, "y": y}


def _minimal_alignment_box(value: object) -> dict[str, float] | None:
  if not isinstance(value, dict):
    return None
  coordinates = {
    key: _alignment_number(value.get(key))
    for key in ("left", "top", "right", "bottom")
  }
  if any(number is None or not 0 <= number <= 1 for number in coordinates.values()):
    return None
  left = float(coordinates["left"])
  top = float(coordinates["top"])
  right = float(coordinates["right"])
  bottom = float(coordinates["bottom"])
  if left >= right or top >= bottom:
    return None
  return {
    "left": left,
    "top": top,
    "right": right,
    "bottom": bottom,
  }


def _minimal_alignment_frame(value: object) -> dict | None:
  if not isinstance(value, dict):
    return None
  image_size = value.get("imageSize")
  eye_centers = value.get("eyeCenters")
  if not isinstance(image_size, dict) or not isinstance(eye_centers, dict):
    return None
  width_number = _alignment_number(image_size.get("width"))
  height_number = _alignment_number(image_size.get("height"))
  if (
    width_number is None
    or height_number is None
    or not width_number.is_integer()
    or not height_number.is_integer()
    or width_number <= 0
    or height_number <= 0
  ):
    return None
  face_box = _minimal_alignment_box(value.get("faceBox"))
  image_left = _minimal_alignment_point(eye_centers.get("imageLeft"))
  image_right = _minimal_alignment_point(eye_centers.get("imageRight"))
  roll_deg = _alignment_number(value.get("rollDeg"))
  if (
    face_box is None
    or image_left is None
    or image_right is None
    or roll_deg is None
    or not -180 <= roll_deg <= 180
    or image_left["x"] >= image_right["x"]
  ):
    return None
  return {
    "imageSize": {
      "width": int(width_number),
      "height": int(height_number),
    },
    "faceBox": face_box,
    "eyeCenters": {
      "imageLeft": image_left,
      "imageRight": image_right,
    },
    "rollDeg": roll_deg,
  }


def _minimal_alignment_metadata(value: object) -> dict | None:
  if not isinstance(value, dict) or value.get("version") != MAKEUP_ALIGNMENT_METADATA_VERSION:
    return None
  source = _minimal_alignment_frame(value.get("source"))
  generated = _minimal_alignment_frame(value.get("generated"))
  if source is None or generated is None:
    return None
  return {
    "version": MAKEUP_ALIGNMENT_METADATA_VERSION,
    "source": source,
    "generated": generated,
  }


async def _persist_alignment_backfill_result(
  *,
  report_id: UUID,
  look_id: str,
  db: Database,
  claim_marker: dict,
  result_marker: dict,
  alignment_metadata: dict | None,
) -> dict | None:
  return await db.fetchrow(
    """
    update makeup_recommendation_assets as asset
    set provenance = coalesce(asset.provenance, '{}'::jsonb)
          || jsonb_build_object($3::text, $4::jsonb)
          || case
               when $5::jsonb is null then '{}'::jsonb
               else jsonb_build_object('alignmentMetadata', $5::jsonb)
             end,
        updated_at = now()
    where asset.report_id = $1 and asset.look_id = $2
      and asset.role = 'anchor'
      and asset.status = 'completed'
      and asset.is_private
      and asset.input_media_id is not null
      and asset.storage_bucket is not null
      and asset.object_key is not null
      and not (coalesce(asset.provenance, '{}'::jsonb) ? 'alignmentMetadata')
      and coalesce(asset.provenance, '{}'::jsonb) -> $3::text = $6::jsonb
      and exists (
        select 1
        from makeup_recommendation_reports as report
        join media_assets as source
          on source.id = asset.input_media_id
         and source.owner_user_id = report.user_id
         and source.status = 'active'
         and source.deleted_at is null
        where report.id = asset.report_id
          and report.image_mode = 'personalized'
          and source.bucket is not null
          and source.object_key is not null
      )
    returning asset.provenance
    """,
    report_id,
    look_id,
    MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY,
    json.dumps(result_marker),
    json.dumps(alignment_metadata) if alignment_metadata is not None else None,
    json.dumps(claim_marker),
  )


async def _lazy_backfill_recommendation_alignment_metadata(
  *,
  report_id: UUID,
  look_id: str,
  asset: dict,
  db: Database,
  settings: Settings,
) -> dict:
  provenance = _json_value(asset.get("provenance"), {})
  if (
    asset.get("role") != "anchor"
    or asset.get("status") != "completed"
    or not asset.get("is_private")
    or not asset.get("input_media_id")
    or isinstance(provenance.get("alignmentMetadata"), dict)
    or not asset.get("storage_bucket")
    or not asset.get("object_key")
  ):
    return provenance

  now = _alignment_backfill_now()
  previous_marker = provenance.get(MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY)
  if _alignment_backfill_marker_is_fresh(previous_marker, now=now):
    return provenance

  claim_marker = _alignment_backfill_marker(
    status="processing",
    attempted_at=now,
    retry_ttl=MAKEUP_ALIGNMENT_BACKFILL_PROCESSING_TTL,
  )
  has_previous_marker = MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY in provenance
  try:
    claimed = await db.fetchrow(
      """
      update makeup_recommendation_assets as asset
      set provenance = coalesce(asset.provenance, '{}'::jsonb)
            || jsonb_build_object($3::text, $4::jsonb),
          updated_at = now()
      from makeup_recommendation_reports as report,
           media_assets as source
      where asset.report_id = $1 and asset.look_id = $2
        and asset.role = 'anchor'
        and asset.status = 'completed'
        and asset.is_private
        and asset.input_media_id is not null
        and asset.storage_bucket is not null
        and asset.object_key is not null
        and report.id = asset.report_id
        and report.image_mode = 'personalized'
        and source.id = asset.input_media_id
        and source.owner_user_id = report.user_id
        and source.status = 'active'
        and source.deleted_at is null
        and source.bucket is not null
        and source.object_key is not null
        and not (coalesce(asset.provenance, '{}'::jsonb) ? 'alignmentMetadata')
        and (
          ($5::jsonb is null and not (coalesce(asset.provenance, '{}'::jsonb) ? $3::text))
          or coalesce(asset.provenance, '{}'::jsonb) -> $3::text = $5::jsonb
        )
      returning asset.provenance,
                asset.storage_bucket as generated_bucket,
                asset.object_key as generated_object_key,
                source.bucket as source_bucket,
                source.object_key as source_object_key
      """,
      report_id,
      look_id,
      MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY,
      json.dumps(claim_marker),
      json.dumps(previous_marker) if has_previous_marker else None,
    )
  except Exception:  # noqa: BLE001 - legacy alignment metadata must stay a soft enhancement.
    logger.warning(
      "[aura:makeup-recommendation] alignment-backfill:claim-failed reportId=%s lookId=%s",
      report_id,
      look_id,
      exc_info=True,
    )
    return provenance
  if claimed is None:
    return provenance

  claimed_provenance = _json_value(
    claimed.get("provenance"),
    {
      **provenance,
      MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY: claim_marker,
    },
  )
  source_bucket = str(claimed.get("source_bucket") or "")
  source_object_key = str(claimed.get("source_object_key") or "")
  generated_bucket = str(claimed.get("generated_bucket") or "")
  generated_object_key = str(claimed.get("generated_object_key") or "")
  alignment_metadata: dict | None = None
  result_status = "failed"
  retry_ttl: timedelta | None = MAKEUP_ALIGNMENT_BACKFILL_FAILURE_TTL
  try:
    if not all((
      source_bucket,
      source_object_key,
      generated_bucket,
      generated_object_key,
    )):
      raise ValueError("The claimed alignment backfill media locations are incomplete.")
    s3 = S3Service(settings)
    s3.assert_managed_media_location(
      bucket=source_bucket,
      object_key=source_object_key,
    )
    s3.assert_managed_media_location(
      bucket=generated_bucket,
      object_key=generated_object_key,
    )
    source_bytes, _source_content_type = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=source_bucket,
      object_key=source_object_key,
      max_bytes=MAKEUP_ALIGNMENT_BACKFILL_MAX_BYTES,
    )
    generated_bytes, _generated_content_type = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=generated_bucket,
      object_key=generated_object_key,
      max_bytes=MAKEUP_ALIGNMENT_BACKFILL_MAX_BYTES,
    )
    detected_metadata = await asyncio.to_thread(
      extract_personalized_makeup_face_metadata,
      source_bytes,
      generated_bytes,
    )
  except Exception:  # noqa: BLE001 - the generated image response must stay available.
    logger.warning(
      "[aura:makeup-recommendation] alignment-backfill:skipped reportId=%s lookId=%s",
      report_id,
      look_id,
      exc_info=True,
    )
  else:
    detected_alignment = (
      detected_metadata.get("alignmentMetadata")
      if isinstance(detected_metadata, dict)
      else None
    )
    alignment_metadata = _minimal_alignment_metadata(detected_alignment)
    if alignment_metadata is not None:
      result_status = "completed"
      retry_ttl = None
    else:
      result_status = "no-face"
      retry_ttl = MAKEUP_ALIGNMENT_BACKFILL_NO_FACE_TTL
      logger.info(
        "[aura:makeup-recommendation] alignment-backfill:face-unavailable reportId=%s lookId=%s",
        report_id,
        look_id,
      )

  result_marker = _alignment_backfill_marker(
    status=result_status,
    attempted_at=now,
    retry_ttl=retry_ttl,
  )
  updated_provenance = {
    **claimed_provenance,
    MAKEUP_ALIGNMENT_BACKFILL_MARKER_KEY: result_marker,
  }
  if alignment_metadata is not None:
    updated_provenance["alignmentMetadata"] = alignment_metadata

  try:
    persisted = await _persist_alignment_backfill_result(
      report_id=report_id,
      look_id=look_id,
      db=db,
      claim_marker=claim_marker,
      result_marker=result_marker,
      alignment_metadata=alignment_metadata,
    )
  except Exception:  # noqa: BLE001 - the generated image response must stay available.
    logger.warning(
      "[aura:makeup-recommendation] alignment-backfill:persist-failed reportId=%s lookId=%s",
      report_id,
      look_id,
      exc_info=True,
    )
    return updated_provenance

  if persisted is None:
    return updated_provenance
  return _json_value(persisted.get("provenance"), updated_provenance)


_POST_IMAGE_VALIDATION_SOURCE_RANK = {
  "generated_asset": 1,
  "generated_face_metadata": 2,
  "source_generated_alignment": 3,
}


def _post_image_fit_should_update(current: object, candidate: object) -> bool:
  current_assessment = current if isinstance(current, dict) else {}
  candidate_assessment = candidate if isinstance(candidate, dict) else {}
  current_validation = current_assessment.get("imageValidation")
  candidate_validation = candidate_assessment.get("imageValidation")
  if not isinstance(candidate_validation, dict):
    return False
  if not isinstance(current_validation, dict) or current_validation.get("stage") != "post_image":
    return True
  current_source_rank = _POST_IMAGE_VALIDATION_SOURCE_RANK.get(
    str(current_validation.get("validationSource") or ""),
    0,
  )
  candidate_source_rank = _POST_IMAGE_VALIDATION_SOURCE_RANK.get(
    str(candidate_validation.get("validationSource") or ""),
    0,
  )
  if candidate_source_rank > current_source_rank:
    return True
  current_attempt = current_validation.get("generationAttempt")
  candidate_attempt = candidate_validation.get("generationAttempt")
  if (
    isinstance(candidate_attempt, int)
    and not isinstance(candidate_attempt, bool)
    and (
      not isinstance(current_attempt, int)
      or isinstance(current_attempt, bool)
      or candidate_attempt > current_attempt
    )
  ):
    return True
  return int(candidate_validation.get("validCropAreaCount") or 0) > int(
    current_validation.get("validCropAreaCount") or 0,
  )


async def _persist_existing_post_image_fit(
  *,
  report_id: UUID,
  look_id: str,
  generation_attempt: int | None,
  fit_assessment: dict,
  db: Database,
) -> dict | None:
  return await db.fetchrow(
    """
    update makeup_recommendation_reports as report
    set recommendation = jsonb_set(
          report.recommendation,
          '{looks}',
          coalesce(
            (
              select jsonb_agg(
                case
                  when coalesce(nullif(item.look->>'id', ''), item.look->>'role') = $2
                    then jsonb_set(item.look, '{fitAssessment}', $4::jsonb, true)
                  else item.look
                end
                order by item.ordinality
              )
              from jsonb_array_elements(coalesce(report.recommendation->'looks', '[]'::jsonb))
                with ordinality as item(look, ordinality)
            ),
            '[]'::jsonb
          ),
          true
        ),
        updated_at = now()
    where report.id = $1
      and exists (
        select 1
        from makeup_recommendation_assets as asset
        where asset.report_id = report.id
          and asset.look_id = $2
          and asset.status = 'completed'
          and ($3::integer is null or asset.attempt_count = $3)
      )
    returning report.id
    """,
    report_id,
    look_id,
    generation_attempt,
    json.dumps(fit_assessment, ensure_ascii=False),
  )


async def _recommendation_report_response(
  report: dict,
  *,
  db: Database | None = None,
  settings: Settings | None = None,
) -> dict:
  recommendation = _json_value(report.get("recommendation"), {})
  schema_version = str(report.get("schema_version") or "makeup-recommendation-v1")
  if schema_version == "makeup-recommendation-v2":
    recommendation = adapt_v1_recommendation(recommendation)
  assets: list[dict] = []
  if schema_version == "makeup-recommendation-v2" and db is not None:
    assets = await db.fetch(
      """
      select look_id, role, status, image_url, image_error, storage_bucket,
             object_key, content_type, is_private, input_media_id, model_id, prompt_version, attempt_count,
             provenance
      from makeup_recommendation_assets
      where report_id = $1
      order by case role when 'anchor' then 1 when 'bold' then 2 else 3 end
      """,
      report["id"],
    )
    assets_by_look = {str(asset.get("look_id") or ""): dict(asset) for asset in assets}
    recommendation_looks = [
      look
      for look in recommendation.get("looks", [])
      if isinstance(look, dict)
    ]
    anchor_asset_ids = {
      str(asset.get("look_id") or "")
      for asset in assets
      if str(asset.get("role") or "") == "anchor"
    }
    crop_backfill_look_id = next(
      (
        str(look.get("id") or look.get("role") or "")
        for look in recommendation_looks
        if (
          str(look.get("role") or "") == "anchor"
          or str(look.get("id") or "") in anchor_asset_ids
        )
        and str(look.get("id") or look.get("role") or "") in assets_by_look
      ),
      "",
    )
    if not crop_backfill_look_id:
      crop_backfill_look_id = next(
        (
          str(look.get("id") or look.get("role") or "")
          for look in recommendation_looks
          if str(look.get("id") or look.get("role") or "") in assets_by_look
        ),
        "",
      )
    response_looks: list[dict] = []
    for look in recommendation_looks:
      if not isinstance(look, dict):
        continue
      look_id = str(look.get("id") or look.get("role") or "")
      asset = assets_by_look.get(look_id)
      if asset is None:
        response_looks.append(look)
        continue
      provenance = _json_value(asset.get("provenance"), {})
      if settings is not None and look_id == crop_backfill_look_id:
        provenance = await _lazy_backfill_recommendation_crop_metadata(
          report_id=report["id"],
          look_id=look_id,
          asset=asset,
          db=db,
          settings=settings,
        )
      if (
        settings is not None
        and str(report.get("image_mode") or "generic") == "personalized"
        and look_id == crop_backfill_look_id
        and str(asset.get("role") or "") == "anchor"
      ):
        provenance = await _lazy_backfill_recommendation_alignment_metadata(
          report_id=report["id"],
          look_id=look_id,
          asset={**asset, "provenance": provenance},
          db=db,
          settings=settings,
        )
      asset_attempt = asset.get("attempt_count")
      generation_attempt = (
        asset_attempt
        if isinstance(asset_attempt, int) and not isinstance(asset_attempt, bool) and asset_attempt > 0
        else None
      )
      fit_provenance = dict(provenance)
      if generation_attempt is not None and not isinstance(fit_provenance.get("generationAttempt"), int):
        fit_provenance["generationAttempt"] = generation_attempt
      generation_source = (
        "claude"
        if recommendation.get("generationSource") == "claude"
        else "deterministic_fallback"
      )
      post_image_fit = build_post_image_fit_assessment(
        look,
        generation_source=generation_source,
        image_status=str(asset.get("status") or "pending"),
        provenance=fit_provenance,
      )
      if _post_image_fit_should_update(look.get("fitAssessment"), post_image_fit):
        try:
          persisted_fit = await _persist_existing_post_image_fit(
            report_id=report["id"],
            look_id=look_id,
            generation_attempt=generation_attempt,
            fit_assessment=post_image_fit,
            db=db,
          )
        except Exception:  # noqa: BLE001 - fit backfill must not block image delivery.
          logger.warning(
            "[aura:makeup-recommendation] post-image-fit-backfill:failed reportId=%s lookId=%s",
            report["id"],
            look_id,
            exc_info=True,
          )
        else:
          if persisted_fit is not None:
            look = {**look, "fitAssessment": post_image_fit}
      delivery_url = str(asset.get("image_url") or "") or None
      if (
        asset.get("is_private")
        and asset.get("status") == "completed"
        and asset.get("storage_bucket")
        and asset.get("object_key")
        and settings is not None
      ):
        try:
          delivery_url = S3Service(settings).create_presigned_download(
            bucket=str(asset["storage_bucket"]),
            object_key=str(asset["object_key"]),
            expires_in=settings.makeup_private_url_ttl_seconds,
          )
        except Exception as exc:
          logger.exception(
            "[aura:makeup-recommendation] image-delivery:presign-failed reportId=%s lookId=%s",
            report["id"],
            look_id,
          )
          raise AppError(
            503,
            "MAKEUP_IMAGE_DELIVERY_UNAVAILABLE",
            "The generated recommendation image is temporarily unavailable.",
          ) from exc
      image_asset = {
        "imageUrl": delivery_url,
        "contentType": asset.get("content_type"),
        "isPrivate": bool(asset.get("is_private")),
        "inputMediaId": str(asset.get("input_media_id") or "") or None,
        "modelId": asset.get("model_id"),
        "promptVersion": asset.get("prompt_version"),
        "provenance": provenance,
      }
      response_look = {
        **look,
        "imageStatus": str(asset.get("status") or "pending"),
        "imageAsset": image_asset,
      }
      if delivery_url:
        response_look["imageUrl"] = delivery_url
      else:
        response_look.pop("imageUrl", None)
      if asset.get("image_error"):
        response_look["imageError"] = str(asset["image_error"])
      response_looks.append(response_look)
    recommendation = {**recommendation, "looks": response_looks}

  context_snapshot = _json_value(report.get("context_snapshot"), {})
  selection_context = (
    context_snapshot.get("selection")
    if isinstance(context_snapshot.get("selection"), dict)
    else {}
  )
  stored_editorial_preset = (
    selection_context.get("editorialPreset")
    if isinstance(selection_context.get("editorialPreset"), dict)
    else {}
  )
  current_editorial_preset = resolve_reviewed_editorial_preset(
    str(stored_editorial_preset.get("id") or ""),
  )
  if current_editorial_preset is not None:
    context_snapshot = {
      **context_snapshot,
      "selection": {
        **selection_context,
        "customSituationText": current_editorial_preset["seedPrompt"],
        "customSituationLabel": current_editorial_preset["displayText"],
        "editorialPreset": {
          **stored_editorial_preset,
          "displayText": current_editorial_preset["displayText"],
          "seedPrompt": current_editorial_preset["seedPrompt"],
        },
      },
    }
  analysis_context = (
    context_snapshot.get("analysisReport")
    if isinstance(context_snapshot.get("analysisReport"), dict)
    else None
  )
  if analysis_context is not None and "sourceMediaId" in analysis_context:
    context_snapshot = {
      **context_snapshot,
      "analysisReport": {
        key: value
        for key, value in analysis_context.items()
        if key != "sourceMediaId"
      },
    }
  context_snapshot = sanitize_recommendation_context(context_snapshot)
  return {
    **report,
    "schema_version": schema_version,
    "scenario_tags": _json_value(report.get("scenario_tags"), []),
    "questions": (
      current_editorial_preset["questions"]
      if current_editorial_preset is not None
      else _json_value(report.get("questions"), [])
    ),
    "answers": _json_value(report.get("answers"), []),
    "context_snapshot": context_snapshot,
    "recommendation": recommendation,
    "generationSource": str(recommendation.get("generationSource") or "") or None,
    "recommendation_v2": adapt_v1_recommendation(recommendation),
    "assets": [
      {
        "lookId": str(asset.get("look_id") or ""),
        "role": str(asset.get("role") or ""),
        "status": str(asset.get("status") or "pending"),
        "isPrivate": bool(asset.get("is_private")),
      }
      for asset in assets
    ],
  }

def _personalized_retry_context(report: dict) -> tuple[bool, str | None]:
  context = _json_value(report.get('context_snapshot'), {})
  image_context = context.get('image') if isinstance(context.get('image'), dict) else {}
  analysis_context = (
    context.get('analysisReport')
    if isinstance(context.get('analysisReport'), dict)
    else {}
  )
  source_media_id = image_context.get('sourceMediaId') or analysis_context.get('sourceMediaId')
  should_retry_personalized = (
    str(image_context.get('requestedMode') or '').strip().lower() == 'personalized'
    and str(image_context.get('effectiveMode') or '').strip().lower() == 'personalized'
    and image_context.get('personalizedConsent') is True
    and bool(str(source_media_id or '').strip())
  )
  return should_retry_personalized, (
    str(source_media_id).strip() if source_media_id is not None else None
  )


async def _personalized_source_input(
  db: Database,
  settings: Settings,
  report: dict,
  user_id: UUID,
  *,
  expected_source_media_id: str | None = None,
) -> PersonalizedImageInput | None:
  context = _json_value(report.get("context_snapshot"), {})
  image_context = context.get("image") if isinstance(context.get("image"), dict) else {}
  if not image_context.get("personalizedConsent"):
    return None
  source_report_id = report.get("source_analysis_report_id")
  if source_report_id is None:
    return None
  media = await db.fetchrow(
    """
    select media.id, media.owner_user_id, media.bucket, media.object_key,
           media.content_type, media.original_filename
    from analysis_reports analysis
    join media_assets media
      on media.id = analysis.source_media_id
     and media.owner_user_id = analysis.user_id
     and media.status = 'active'
     and media.deleted_at is null
    where analysis.id = $1 and analysis.user_id = $2
      and analysis.status = 'completed'
    """,
    source_report_id,
    user_id,
  )
  if media is None or not media.get("bucket") or not media.get("object_key"):
    return None
  if (
    expected_source_media_id
    and str(media.get("id") or "").strip().lower()
    != expected_source_media_id.strip().lower()
  ):
    logger.warning(
      "[aura:makeup-recommendation] personalized-source:context-mismatch reportId=%s",
      report.get("id"),
    )
    return None
  try:
    s3 = S3Service(settings)
    s3.assert_managed_media_location(bucket=str(media["bucket"]), object_key=str(media["object_key"]))
    content, detected_content_type = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=str(media["bucket"]),
      object_key=str(media["object_key"]),
      max_bytes=20 * 1024 * 1024,
    )
  except Exception:
    logger.exception(
      "[aura:makeup-recommendation] personalized-source:read-failed reportId=%s",
      report.get("id"),
    )
    return None
  return PersonalizedImageInput(
    media_id=media["id"],
    owner_user_id=media["owner_user_id"],
    requested_user_id=user_id,
    content=content,
    content_type=str(media.get("content_type") or detected_content_type),
    consent=True,
    filename=str(media.get("original_filename") or "source.jpg"),
  )

def _merge_generated_looks(
  looks: list[dict],
  generated_looks: list[dict],
) -> list[dict]:
  generated_by_id = {
    str(look.get("id") or look.get("role") or ""): look
    for look in generated_looks
    if isinstance(look, dict)
  }
  return [
    generated_by_id.get(str(look.get("id") or look.get("role") or ""), look)
    for look in looks
    if isinstance(look, dict)
  ]


async def _persist_v2_image_assets(
  db: Database,
  report_id: UUID,
  looks: list[dict],
  *,
  generation_attempt: int,
) -> bool:
  persisted_any = False
  for look in looks:
    look_id = str(look.get("id") or look.get("role") or "")
    if not look_id:
      continue
    asset = look.get("imageAsset") if isinstance(look.get("imageAsset"), dict) else {}
    status = str(look.get("imageStatus") or "pending")
    fit_assessment = look.get("fitAssessment")
    persisted_fit = fit_assessment if status == "completed" and isinstance(fit_assessment, dict) and isinstance(fit_assessment.get("imageValidation"), dict) else None
    persisted = await db.fetchrow(
      """
      with persisted_asset as (
      update makeup_recommendation_assets as asset
      set role = $3,
        status = $4,
        image_url = $5,
        image_error = $6,
        storage_bucket = $7,
        object_key = $8,
        content_type = $9,
        is_private = $10,
        input_media_id = $11,
        model_id = $12,
        prompt_version = $13,
        provenance = case
          when $14::jsonb = '{}'::jsonb then provenance
          else $14::jsonb
        end,
        completed_at = case when $4 = 'completed' then now() else null end,
        updated_at = now()
      where report_id = $1 and look_id = $2
        and attempt_count = $15
        and status = 'processing'
      returning asset.report_id, asset.look_id
      ), updated_report as (
        update makeup_recommendation_reports as report
        set recommendation = jsonb_set(
              report.recommendation,
              '{looks}',
              coalesce(
                (
                  select jsonb_agg(
                    case
                      when coalesce(nullif(item.look->>'id', ''), item.look->>'role') = $2
                        then jsonb_set(item.look, '{fitAssessment}', $16::jsonb, true)
                      else item.look
                    end
                    order by item.ordinality
                  )
                  from jsonb_array_elements(coalesce(report.recommendation->'looks', '[]'::jsonb))
                    with ordinality as item(look, ordinality)
                ),
                '[]'::jsonb
              ),
              true
            ),
            updated_at = now()
        from persisted_asset
        where report.id = persisted_asset.report_id
          and $16::jsonb is not null
        returning persisted_asset.look_id
      )
      select look_id from persisted_asset
      """,
      report_id,
      look_id,
      str(look.get("role") or look_id),
      status,
      asset.get("imageUrl") if not asset.get("isPrivate") else None,
      str(look.get("imageError") or "") or None,
      asset.get("storageBucket"),
      asset.get("objectKey"),
      asset.get("contentType"),
      bool(asset.get("isPrivate")),
      asset.get("inputMediaId"),
      asset.get("modelId"),
      asset.get("promptVersion"),
      json.dumps(asset.get("provenance") if isinstance(asset.get("provenance"), dict) else {}),
      generation_attempt,
      json.dumps(persisted_fit, ensure_ascii=False) if persisted_fit is not None else None,
    )
    if persisted is not None:
      persisted_any = True
  return persisted_any


async def _initialize_v2_image_assets(
  db: Database,
  report_id: UUID,
  recommendation: dict,
  model_id: str,
  image_mode: str = "generic",
) -> None:
  await db.execute(
    """
    insert into makeup_recommendation_assets
      (report_id, look_id, role, status, model_id, prompt_version, provenance)
    select $1,
           coalesce(nullif(look->>'id', ''), look->>'role'),
           look->>'role',
           'pending',
           $3,
           'makeup-image-v2',
           jsonb_build_object(
             'modelId', $3,
             'promptVersion', 'makeup-image-v2',
             'consentStatus', case when $4::text = 'personalized' then 'pending-verification' else 'not-required' end,
             'rightsStatus', case when $4::text = 'personalized' then 'pending-verification' else 'synthetic-reference' end,
             'sourceMediaId', null
           )
    from jsonb_array_elements(coalesce($2::jsonb->'looks', '[]'::jsonb)) as look
    where look->>'role' = 'anchor'
    on conflict (report_id, look_id) do nothing
    """,
    report_id,
    json.dumps(recommendation, ensure_ascii=False),
    model_id,
    image_mode,
  )


def _aggregate_v2_image_state(looks: list[dict]) -> tuple[str, str | None, str | None]:
  statuses = [str(look.get("imageStatus") or "pending") for look in looks if isinstance(look, dict)]
  if statuses and all(status == "completed" for status in statuses):
    status = "completed"
  elif any(status == "completed" for status in statuses) and any(status == "failed" for status in statuses):
    status = "partial"
  elif any(status == "failed" for status in statuses):
    status = "failed"
  elif any(status == "processing" for status in statuses):
    status = "processing"
  else:
    status = "pending"
  image_url = next(
    (
      str(look.get("imageUrl"))
      for look in looks
      if isinstance(look, dict) and look.get("role") == "anchor" and look.get("imageUrl")
    ),
    None,
  )
  error = next(
    (
      str(look.get("imageError"))
      for look in looks
      if isinstance(look, dict) and look.get("imageError")
    ),
    None,
  )
  return status, image_url, error


async def _notify_makeup_recommendation_completed(
  db: Database,
  settings: Settings,
  *,
  report_id: UUID,
  user_id: UUID,
) -> None:
  await create_and_send_notification(
    db,
    settings,
    user_id=user_id,
    notification_type="makeup_recommendation_completed",
    title="추천 메이크업이 완성됐어요",
    body="가장 잘 어울리는 메이크업 결과를 확인해 보세요.",
    data={
      "reportId": str(report_id),
      "route": "MakeupRecommendation",
    },
    dedupe_key=f"makeup-recommendation:{report_id}:completed",
  )


async def _refresh_v2_report_image_state(db: Database, report_id: UUID) -> str:
  assets = await db.fetch(
    """
    select role, status, image_url, image_error
    from makeup_recommendation_assets
    where report_id = $1 and role = 'anchor'
    """,
    report_id,
  )
  state_looks = [
    {
      "role": str(asset.get("role") or ""),
      "imageStatus": str(asset.get("status") or "pending"),
      "imageUrl": asset.get("image_url"),
      "imageError": asset.get("image_error"),
    }
    for asset in assets
  ]
  status, image_url, image_error = _aggregate_v2_image_state(state_looks)
  await db.execute(
    """
    update makeup_recommendation_reports
    set image_status = case
          when image_status in ('completed', 'partial', 'failed') and $2 = 'processing'
            then image_status
          else $2
        end,
        image_url = case
          when $2 = 'processing' and $3::text is null then image_url
          else $3::text
        end,
        image_error = case
          when image_status in ('completed', 'partial', 'failed') and $2 = 'processing'
            then image_error
          else $4::text
        end,
        updated_at = now()
    where id = $1
    """,
    report_id,
    status,
    image_url,
    image_error,
  )
  return status


async def run_recommendation_image_job(
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
  *,
  db: Database,
  look_id: str | None = None,
) -> None:
  claimed_attempts: dict[str, int] = {}
  if look_id is None:
    report = await db.fetchrow(
      """
      update makeup_recommendation_reports
      set image_status = 'processing', image_error = null, updated_at = now()
      where id = $1 and user_id = $2
        and (
          image_status = 'pending'
          or (image_status = 'processing' and updated_at < now() - interval '15 minutes')
        )
      returning id, user_id, scenario_text, recommendation, image_status,
                schema_version, image_mode, context_snapshot, source_analysis_report_id
      """,
      report_id,
      user_id,
    )
  else:
    report = await db.fetchrow(
      """
      select id, user_id, scenario_text, recommendation, image_status,
             schema_version, image_mode, context_snapshot, source_analysis_report_id
      from makeup_recommendation_reports
      where id = $1 and user_id = $2
      """,
      report_id,
      user_id,
    )
    if report is not None:
      claimed_asset = await db.fetchrow(
        """
        update makeup_recommendation_assets
        set status = 'processing', image_error = null,
            attempt_count = attempt_count + 1, last_attempt_at = now(), updated_at = now()
        where report_id = $1 and look_id = $2
          and role = 'anchor'
          and (
            status = 'pending'
            or status = 'failed'
            or (status = 'processing' and updated_at < now() - interval '15 minutes')
          )
        returning id, look_id, attempt_count
        """,
        report_id,
        look_id,
      )
      if claimed_asset is None:
        return
      claimed_attempts[str(claimed_asset["look_id"])] = int(
        claimed_asset["attempt_count"],
      )
      await db.execute(
        "update makeup_recommendation_reports set image_status = 'processing', image_error = null, updated_at = now() where id = $1 and user_id = $2",
        report_id,
        user_id,
      )
  if report is None:
    return

  recommendation = _json_value(report.get("recommendation"), {})
  looks = recommendation.get("looks") if isinstance(recommendation, dict) else None
  if not isinstance(looks, list) or not 1 <= len(looks) <= 3:
    error = AppError(502, "MAKEUP_RECOMMENDATION_LOOKS_INVALID", "The recommendation does not contain a valid look.")
    await db.execute(
      "update makeup_recommendation_reports set image_status = 'failed', image_error = $2, updated_at = now() where id = $1",
      report_id,
      error.message,
    )
    return

  is_v2 = str(report.get("schema_version") or "") == "makeup-recommendation-v2"
  context_snapshot = _json_value(report.get("context_snapshot"), {})
  profile = context_snapshot.get("profile") if isinstance(context_snapshot.get("profile"), dict) else {}
  profile_presentation = str(profile.get("presentation") or "neutral")
  if profile_presentation not in {"feminine", "masculine", "neutral"}:
    profile_presentation = "neutral"
  try:
    if not is_v2:
      generated_looks = await generate_recommendation_images(
        settings,
        report_id,
        str(report.get("scenario_text") or ""),
        looks,
      )
      completed_recommendation = {**recommendation, "looks": generated_looks}
      image_url = str(generated_looks[0].get("imageUrl") or "")
      completed_report = await db.fetchrow(
        """
        update makeup_recommendation_reports
        set image_status = 'completed', recommendation = $2::jsonb, image_url = $3, image_error = null
        where id = $1 and image_status = 'processing'
        returning user_id
        """,
        report_id,
        json.dumps(completed_recommendation, ensure_ascii=False),
        image_url,
      )
      if completed_report is not None:
        await _notify_makeup_recommendation_completed(
          db,
          settings,
          report_id=report_id,
          user_id=completed_report["user_id"],
        )
      return

    if look_id is None:
      claimed_assets = await db.fetch(
        """
        update makeup_recommendation_assets
        set status = 'processing', image_error = null,
            attempt_count = attempt_count + 1, last_attempt_at = now(), updated_at = now()
        where report_id = $1
          and role = 'anchor'
          and (
            status in ('pending', 'failed', 'completed')
            or (status = 'processing' and updated_at < now() - interval '15 minutes')
          )
        returning look_id, attempt_count
        """,
        report_id,
      )
      claimed_attempts = {
        str(asset["look_id"]): int(asset["attempt_count"])
        for asset in claimed_assets
      }
      if not claimed_attempts:
        await _refresh_v2_report_image_state(db, report_id)
        return

    requested_image_mode = str(report.get("image_mode") or "generic")
    persisted_image_mode = requested_image_mode
    recover_personalized, expected_source_media_id = _personalized_retry_context(report)
    requested_image_mode = (
      'personalized'
      if persisted_image_mode == 'personalized' or recover_personalized
      else 'generic'
    )
    image_mode = requested_image_mode
    source_image = None
    if requested_image_mode == "personalized":
      if settings.makeup_personalized_image_enabled:
        source_image = await _personalized_source_input(
          db,
          settings,
          report,
          user_id,
          expected_source_media_id=expected_source_media_id,
        )
      if source_image is None:
        image_mode = "generic"
        logger.warning(
          "[aura:makeup-recommendation] personalized-source:fallback-generic reportId=%s",
          report_id,
        )

    if requested_image_mode == 'personalized':
      await db.execute(
        'update makeup_recommendation_reports set image_mode = $3, updated_at = now() where id = $1 and user_id = $2',
        report_id,
        user_id,
        'personalized',
      )

    ordered_looks = sorted(
      [
        look
        for look in looks
        if isinstance(look, dict)
        and str(look.get("id") or look.get("role") or "") in claimed_attempts
      ],
      key=lambda look: (
        ("anchor", "bold", "discovery").index(str(look.get("role")))
        if str(look.get("role")) in {"anchor", "bold", "discovery"}
        else 3
      ),
    )

    async def generate_and_persist(current_look: dict, generation_attempt: int) -> None:
      stable_look_id = str(current_look.get("id") or current_look.get("role") or "")
      try:
        generated = await generate_recommendation_images(
          settings,
          report_id,
          str(report.get("scenario_text") or ""),
          looks,
          image_mode=image_mode,
          source_image=source_image,
          look_id=stable_look_id,
          continue_on_error=True,
          generation_attempt=generation_attempt,
          profile_presentation=profile_presentation,
        )
      except Exception as exc:
        message = exc.message if isinstance(exc, AppError) else "Recommendation image generation failed."
        generated = [
          {
            **current_look,
            "imageStatus": "failed",
            "imageError": message,
            "imageAsset": {
              "imageUrl": None,
              "isPrivate": image_mode == "personalized",
              "inputMediaId": str(source_image.media_id) if source_image else None,
              "modelId": settings.openai_image_model_id,
              "promptVersion": "makeup-image-v2",
              "lookId": stable_look_id,
            },
          },
        ]
      generated_items = [item for item in generated if isinstance(item, dict)]
      generation_source = (
        'claude'
        if recommendation.get('generationSource') == 'claude'
        else 'deterministic_fallback'
      )
      for generated_item in generated_items:
        image_asset = generated_item.get('imageAsset') if isinstance(generated_item.get('imageAsset'), dict) else {}
        post_image_fit = build_post_image_fit_assessment(
          generated_item,
          generation_source=generation_source,
          image_status=str(generated_item.get('imageStatus') or 'pending'),
          provenance=image_asset.get('provenance'),
        )
        if post_image_fit is not None:
          generated_item['fitAssessment'] = post_image_fit
      persisted = await _persist_v2_image_assets(
        db,
        report_id,
        generated_items,
        generation_attempt=generation_attempt,
      )
      if (
        persisted
        and generated_items
        and all(
          str(item.get('imageStatus') or '') == 'completed'
          for item in generated_items
        )
      ):
        await db.execute(
          'update makeup_recommendation_reports set image_mode = $3, updated_at = now() where id = $1 and user_id = $2',
          report_id,
          user_id,
          image_mode,
        )
      await _refresh_v2_report_image_state(db, report_id)

    if look_id is not None:
      selected = [
        look
        for look in ordered_looks
        if str(look.get("id") or look.get("role") or "") == look_id
      ]
      if not selected:
        raise AppError(404, "MAKEUP_LOOK_NOT_FOUND", "The requested recommendation look was not found.")
      await generate_and_persist(selected[0], claimed_attempts[look_id])
    else:
      if ordered_looks:
        first_look_id = str(
          ordered_looks[0].get("id") or ordered_looks[0].get("role") or "",
        )
        await generate_and_persist(
          ordered_looks[0], claimed_attempts[first_look_id],
        )
      if len(ordered_looks) > 1:
        await asyncio.gather(
          *(
            generate_and_persist(
              look,
              claimed_attempts[
                str(look.get("id") or look.get("role") or "")
              ],
            )
            for look in ordered_looks[1:]
          ),
        )

    final_status = await _refresh_v2_report_image_state(db, report_id)
    if final_status == "completed":
      await _notify_makeup_recommendation_completed(
        db,
        settings,
        report_id=report_id,
        user_id=user_id,
      )
  except Exception as exc:
    message = exc.message if isinstance(exc, AppError) else "Recommendation image generation failed."
    logger.exception(
      "[aura:makeup-recommendation] image:failed reportId=%s lookId=%s",
      report_id,
      look_id,
    )
    if is_v2:
      for claimed_look_id, generation_attempt in claimed_attempts.items():
        await db.fetchrow(
          """
          update makeup_recommendation_assets
          set status = 'failed', image_error = $3, updated_at = now()
          where report_id = $1 and look_id = $2
            and attempt_count = $4
            and status = 'processing'
          returning look_id
          """,
          report_id,
          claimed_look_id,
          message,
          generation_attempt,
        )
      await _refresh_v2_report_image_state(db, report_id)
      return
    await db.execute(
      """
      update makeup_recommendation_reports
      set image_status = 'failed', image_error = $2, updated_at = now()
      where id = $1 and image_status = 'processing'
      """,
      report_id,
      message,
    )
    return


async def dispatch_recommendation_image_job(
  *,
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
  look_id: str | None = None,
) -> str:
  execution_mode = settings.ai_job_execution_mode_normalized
  if execution_mode == "inline":
    background_tasks.add_task(run_recommendation_image_job, report_id, user_id, settings, db=db, look_id=look_id)
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
    await asyncio.to_thread(publisher.publish_makeup_recommendation_job, report_id, user_id, look_id)
    return "pending"
  except Exception as exc:
    message = exc.message if isinstance(exc, AppError) else "Recommendation image job dispatch failed."
    logger.exception("[aura:makeup-recommendation] image-dispatch:failed reportId=%s", report_id)
    await db.execute(
      "update makeup_recommendation_reports set image_status = 'failed', image_error = $2 where id = $1",
      report_id,
      message,
    )
    await db.execute(
      """
      update makeup_recommendation_assets
      set status = 'failed', image_error = $3, updated_at = now()
      where report_id = $1
        and ($2::text is null or look_id = $2)
        and status = 'pending'
      """,
      report_id,
      look_id,
      message,
    )
    return "failed"


async def dispatch_makeup_product_snapshot_job(
  *,
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
) -> None:
  """Persist pending look mappings now; GET provides a durable retry backstop."""

  try:
    await dispatch_makeup_report_product_snapshot_jobs(
      db=db,
      background_tasks=background_tasks,
      report_id=report_id,
      user_id=user_id,
      settings=settings,
      all_looks=True,
    )
  except Exception:  # noqa: BLE001 - product matching must not discard a completed report.
    logger.exception(
      "[aura:makeup-recommendation] product-snapshot-dispatch-failed report=%s",
      report_id,
    )


async def run_makeup_post_generation_jobs(
  *,
  db: Database,
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
  product_run_ids: list[UUID],
) -> None:
  """Run independent image and product jobs concurrently on inline workers."""

  jobs = [run_recommendation_image_job(report_id, user_id, settings, db=db)]
  if product_run_ids:
    jobs.append(run_makeup_report_product_snapshot_jobs(product_run_ids, settings, db=db))
  results = await asyncio.gather(*jobs, return_exceptions=True)
  for error in results:
    if isinstance(error, BaseException):
      logger.error(
        "[aura:makeup-recommendation] post-generation-background-job-failed report=%s type=%s",
        report_id,
        type(error).__name__,
      )


async def dispatch_makeup_post_generation_jobs(
  *,
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
) -> str:
  """Create durable product rows and avoid serializing them ahead of image work."""

  product_run_ids: list[UUID] = []
  try:
    runs = await ensure_makeup_report_product_snapshots(
      db,
      settings,
      report_id=report_id,
      user_id=user_id,
      all_looks=True,
    )
    product_run_ids = [
      UUID(str(run["id"]))
      for run in runs
      if snapshot_job_is_schedulable(run)
    ]
  except Exception:  # noqa: BLE001 - image generation remains independent.
    logger.exception(
      "[aura:makeup-recommendation] product-snapshot-ensure-failed report=%s",
      report_id,
    )

  if settings.ai_job_execution_mode_normalized == "inline":
    background_tasks.add_task(
      run_makeup_post_generation_jobs,
      db=db,
      report_id=report_id,
      user_id=user_id,
      settings=settings,
      product_run_ids=product_run_ids,
    )
    return "pending"

  if product_run_ids:
    background_tasks.add_task(
      run_makeup_report_product_snapshot_jobs,
      product_run_ids,
      settings,
      db=db,
    )
  return await dispatch_recommendation_image_job(
    db=db,
    background_tasks=background_tasks,
    report_id=report_id,
    user_id=user_id,
    settings=settings,
  )


@router.post("/scenarios")
async def create_scenarios(
  payload: MakeupScenarioRequest,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v1_compat(settings)
  user = await ensure_user(db, auth)
  await enforce_scenario_generation_limit(db, user["id"])
  return success(await generate_shared_scenarios(settings, db, payload.count, payload.exclude_texts, user["id"]))


@router.post("/questions")
async def create_questions(payload: MakeupQuestionRequest, settings: Settings = Depends(get_settings), _: AuthContext = Depends(get_current_user)) -> dict:
  _require_makeup_v1_compat(settings)
  return success(await generate_questions(settings, payload.scenario_text, payload.scenario_tags, payload.scenario_label))


@router.post("/generate")
async def generate_makeup_recommendations(
  payload: MakeupRecommendationGenerate,
  _auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  _require_makeup_v1_compat(settings)
  raise AppError(
    410,
    "MAKEUP_RECOMMENDATION_LEGACY_GENERATE_DEPRECATED",
    "This OpenAI text-analysis route is deprecated. Use the v2 session flow.",
  )


@router.get("/discovery")
async def get_makeup_discovery(
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v2(settings)
  user = await ensure_user(db, auth)
  discovery = (
    await fetch_discovery(db)
    if settings.makeup_trend_keywords_enabled
    else curated_fallback_discovery()
  )
  discovery["sourceReports"] = await fetch_source_report_projections(db, user["id"])
  return success(discovery)


@router.post("/sessions")
async def create_makeup_recommendation_session(
  payload: MakeupRecommendationSessionCreate,
  idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v2(settings)
  user = await ensure_user(db, auth)
  return success(
    await create_session(
      db,
      settings,
      user["id"],
      payload,
      idempotency_key,
      profile_gender=user.get("gender"),
    ),
  )


@router.get("/sessions/{session_id}")
async def get_makeup_recommendation_session(
  session_id: UUID,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v2(settings)
  user = await ensure_user(db, auth)


  return success(session_response(await get_owned_session(db, user["id"], session_id)))


@router.post("/sessions/{session_id}/answers")
async def answer_makeup_recommendation_session(
  session_id: UUID,
  payload: MakeupRecommendationSessionAnswer,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v2(settings)
  user = await ensure_user(db, auth)
  return success(await answer_session(db, user["id"], session_id, payload))


@router.post("/sessions/{session_id}/generate")
async def generate_makeup_recommendation_session(
  session_id: UUID,
  background_tasks: BackgroundTasks,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v2(settings)
  user = await ensure_user(db, auth)
  generation = await begin_generation(db, user["id"], session_id)
  if generation.get("reused"):
    await dispatch_makeup_product_snapshot_job(
      db=db,
      background_tasks=background_tasks,
      report_id=UUID(str(generation["reportId"])),
      user_id=user["id"],
      settings=settings,
    )
    generation.pop("reused", None)
    return success(generation)

  session = generation["session"]
  context = _json_value(session.get("context_snapshot"), {})
  questions = _json_value(session.get("questions"), [])
  answers = _json_value(session.get("answers"), [])
  try:
    recommendation = await generate_recommendation_v2(settings, context, questions, answers)
    recommendation = await enrich_makeup_recommendation_products(
      db,
      settings,
      recommendation,
      context,
      answers,
      questions,
    )
    result = await complete_generation(db, settings, user["id"], session, recommendation)
  except Exception:
    await fail_generation(db, user["id"], session_id)
    raise

  image_status = await dispatch_makeup_post_generation_jobs(
    db=db,
    background_tasks=background_tasks,
    report_id=UUID(str(result["reportId"])),
    user_id=user["id"],
    settings=settings,
  )
  result["imageStatus"] = image_status or result["imageStatus"]
  result.pop("reused", None)
  return success(result)

@router.post("")
async def create_recommendation(
  payload: MakeupRecommendationRequest,
  background_tasks: BackgroundTasks,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  _require_makeup_v1_compat(settings)
  user = await ensure_user(db, auth)
  recommendation = await generate_recommendation(
    settings,
    payload.scenario_text,
    payload.scenario_tags,
    payload.questions,
    payload.answers,
    payload.scenario_label,
  )
  row = await db.fetchrow(
    """
    insert into makeup_recommendation_reports
      (user_id, scenario_text, scenario_tags, questions, answers, recommendation,
       scenario_model_id, question_model_id, recommendation_model_id, image_model_id, prompt_version, schema_version)
    values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, 'makeup-recommendation-v1')
    returning id
    """,
    user["id"],
    payload.scenario_label or payload.scenario_text,
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
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  reports = await db.fetch(
    """
    select id, scenario_text, recommendation, questions, answers,
           image_status, image_url, image_error, schema_version, image_mode,
           source_analysis_report_id,
           context_snapshot #- '{analysisReport,sourceMediaId}' as context_snapshot,
           context_snapshot #>> '{profile,gender}' as profile_gender,
           created_at, updated_at
    from makeup_recommendation_reports
    where user_id = $1
    order by created_at desc
    limit $2 offset $3
    """,
    user["id"],
    limit,
    offset,
  )
  report_ids = [report["id"] for report in reports]
  anchor_assets = (
    await db.fetch(
      """
      select distinct on (asset.report_id)
             asset.report_id, asset.status, asset.image_url, asset.storage_bucket,
             asset.object_key, asset.is_private
      from makeup_recommendation_assets as asset
      join makeup_recommendation_reports as report on report.id = asset.report_id
      where report.user_id = $1
        and asset.report_id = any($2::uuid[])
        and asset.role = 'anchor'
      order by asset.report_id, asset.updated_at desc
      """,
      user["id"],
      report_ids,
    )
    if report_ids
    else []
  )
  anchor_assets_by_report_id = {
    asset["report_id"]: dict(asset)
    for asset in anchor_assets
  }
  s3_service = S3Service(settings)
  response_reports: list[dict] = []
  for report in reports:
    item = dict(report)
    recommendation = _sanitize_recommendation_list_value(
      _json_value(item.get("recommendation"), {}),
    )
    recommendation = recommendation if isinstance(recommendation, dict) else {}
    item["recommendation"] = recommendation
    item["generationSource"] = str(recommendation.get("generationSource") or "") or None
    item["context_snapshot"] = _sanitize_recommendation_list_context(
      item.get("context_snapshot"),
    )
    preview_url, preview_status = _recommendation_preview(
      item,
      anchor_assets_by_report_id.get(item["id"]),
      settings=settings,
      s3_service=s3_service,
    )
    item["preview_image_url"] = preview_url
    item["preview_image_status"] = preview_status
    response_reports.append(item)
  return success({"reports": response_reports, "limit": limit, "offset": offset})



@router.post("/{report_id}/image/retry")
async def retry_recommendation_images(
  report_id: UUID,
  background_tasks: BackgroundTasks,
  payload: MakeupRecommendationImageRetryRequest | None = None,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  look_id = payload.look_id if payload is not None else None
  if look_id is not None:
    asset = await db.fetchrow(
      """
      select asset.look_id, asset.status
      from makeup_recommendation_assets asset
      join makeup_recommendation_reports report on report.id = asset.report_id
      where asset.report_id = $1 and asset.look_id = $2 and report.user_id = $3
      """,
      report_id,
      look_id,
      user["id"],
    )
    if asset is None:
      raise AppError(404, "MAKEUP_LOOK_NOT_FOUND", "The requested recommendation look was not found.")
    if asset.get("status") == "completed":
      return success({"reportId": report_id, "lookId": look_id, "imageStatus": "completed"})
    if asset.get("status") == "pending":
      raise AppError(409, "MAKEUP_RECOMMENDATION_IMAGE_PENDING", "This look is already waiting to be generated.")
    claimed_asset = await db.fetchrow(
      """
      update makeup_recommendation_assets asset
      set status = 'pending', image_error = null, updated_at = now()
      from makeup_recommendation_reports report
      where asset.report_id = $1 and asset.look_id = $2
        and report.id = asset.report_id and report.user_id = $3
        and (
          asset.status = 'failed'
          or (asset.status = 'processing' and asset.updated_at < now() - interval '15 minutes')
        )
      returning asset.id
      """,
      report_id,
      look_id,
      user["id"],
    )
    if claimed_asset is None:
      raise AppError(
        409,
        "MAKEUP_RECOMMENDATION_IMAGE_PROCESSING",
        "This look is already being generated.",
      )
    image_status = await dispatch_recommendation_image_job(
      db=db,
      background_tasks=background_tasks,
      report_id=report_id,
      user_id=user["id"],
      settings=settings,
      look_id=look_id,
    )
    return success(
      {
        "reportId": report_id,
        "lookId": look_id,
        "imageStatus": image_status or "pending",
      },
    )

  report = await db.fetchrow(
    "select id, image_status from makeup_recommendation_reports where id = $1 and user_id = $2",
    report_id,
    user["id"],
  )
  if report is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")
  if report.get("image_status") == "completed":
    return success({"reportId": report_id, "imageStatus": "completed"})
  if report.get("image_status") == "pending":
    raise AppError(409, "MAKEUP_RECOMMENDATION_IMAGE_PENDING", "Recommendation images are already waiting to be generated.")

  claimed = await db.fetchrow(
    """
    update makeup_recommendation_reports
    set image_status = 'pending', image_error = null, updated_at = now()
    where id = $1 and user_id = $2
      and (
        image_status = 'failed'
        or image_status = 'partial'
        or (image_status = 'processing' and updated_at < now() - interval '15 minutes')
      )
    returning id
    """,
    report_id,
    user["id"],
  )
  if claimed is None:
    if report.get("image_status") == "processing":
      raise AppError(409, "MAKEUP_RECOMMENDATION_IMAGE_PROCESSING", "Recommendation images are already being generated.")
    raise AppError(409, "MAKEUP_RECOMMENDATION_IMAGE_PENDING", "Recommendation images are already waiting to be generated.")
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
    select id, scenario_text, scenario_tags, questions, answers, recommendation,
           source_analysis_report_id, situation_id, keyword_id, context_snapshot,
           schema_version, image_mode
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
  sanitized_context = sanitize_recommendation_context(
    _json_value(source.get("context_snapshot"), {}),
  )
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
  schema_version = str(source.get("schema_version") or "makeup-recommendation-v1")
  if schema_version == "makeup-recommendation-v2":
    _require_makeup_v2(settings)
  else:
    _require_makeup_v1_compat(settings)
  if schema_version == "makeup-recommendation-v2":
    refinement_context = {
      **sanitized_context,
      "refinement": {
        "type": payload.refinement,
        "instruction": refinement_instructions[payload.refinement],
        "previousRecommendation": previous_recommendation,
      },
    }
    recommendation = await generate_recommendation_v2(
      settings,
      refinement_context,
      questions,
      [
        *answers,
        {
          "refinement": payload.refinement,
          "instruction": refinement_instructions[payload.refinement],
        },
      ],
    )
  else:
    recommendation = await generate_recommendation(
      settings,
      str(source.get("scenario_text") or ""),
      scenario_tags,
      questions,
      refined_answers,
    )
  recommendation = apply_refinement_contract(previous_recommendation, recommendation, payload.refinement)
  if schema_version == "makeup-recommendation-v2":
    generation_source = (
      "claude"
      if recommendation.get("generationSource") == "claude"
      else "deterministic_fallback"
    )
    recommendation = attach_match_assessment(
      recommendation,
      sanitized_context,
      refined_answers,
      questions,
      generation_source=generation_source,
    )
    # Resolve the refinement contract before product matching. In particular,
    # replaceProducts keeps the previous makeup recipe, then refreshes catalog
    # matches against that preserved recipe instead of trusting model products.
    recommendation = await enrich_makeup_recommendation_products(
      db,
      settings,
      recommendation,
      sanitized_context,
      refined_answers,
      questions,
    )
  row = await db.fetchrow(
    """
    insert into makeup_recommendation_reports
      (user_id, scenario_text, scenario_tags, questions, answers, recommendation,
       scenario_model_id, question_model_id, recommendation_model_id, image_model_id,
       prompt_version, parent_report_id, refinement_type, source_analysis_report_id,
       situation_id, keyword_id, context_snapshot, schema_version, image_mode)
    values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19)
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
    source.get("source_analysis_report_id"),
    source.get("situation_id"),
    source.get("keyword_id"),
    json.dumps(
      sanitized_context,
      ensure_ascii=False,
      default=str,
    ),
    schema_version,
    str(source.get("image_mode") or "generic"),
  )
  if schema_version == "makeup-recommendation-v2":
    await _initialize_v2_image_assets(
      db,
      row["id"],
      recommendation,
      settings.openai_image_model_id,
      str(source.get("image_mode") or "generic"),
    )
  image_status = (
    await dispatch_makeup_post_generation_jobs(
      db=db,
      background_tasks=background_tasks,
      report_id=UUID(str(row["id"])),
      user_id=user["id"],
      settings=settings,
    )
    if schema_version == "makeup-recommendation-v2"
    else await dispatch_recommendation_image_job(
      db=db,
      background_tasks=background_tasks,
      report_id=row["id"],
      user_id=user["id"],
      settings=settings,
    )
  )
  response_recommendation = recommendation
  if schema_version == "makeup-recommendation-v2":
    response_recommendation = {
      **recommendation,
      "looks": [
        {**look, "imageStatus": str(look.get("imageStatus") or "pending")}
        for look in recommendation.get("looks", [])
        if isinstance(look, dict)
      ],
    }
  return success(
    {
      "reportId": row["id"],
      "recommendation": response_recommendation,
      "generationSource": str(response_recommendation.get("generationSource") or "") or None,
      "imageStatus": image_status or "pending",
    },
  )


@router.get("/{report_id}")
async def get_recommendation_report(
  report_id: UUID,
  settings: Settings = Depends(get_settings),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select id, scenario_text, scenario_tags, questions, answers, recommendation,
           image_status, image_url, image_error, schema_version, context_snapshot,
           source_analysis_report_id, session_id, situation_id, keyword_id, image_mode,
           created_at, updated_at
    from makeup_recommendation_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user["id"],
  )
  if report is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")
  return success(await _recommendation_report_response(report, db=db, settings=settings))
