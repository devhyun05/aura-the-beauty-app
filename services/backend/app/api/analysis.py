import asyncio
import copy
import json
import logging
import time
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response

from app.core.errors import AppError
from app.core.media_policy import (
  GOLDEN_MASK_CONTENT_TYPE,
  GOLDEN_MASK_MEDIA_KIND,
)
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, database, require_database
from app.schemas.analysis import AnalysisJobCreate, GoldenMaskAttachRequest
from app.schemas.face_analysis_v2 import FaceAnalysisStageRetryRequest
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.account_identity import log_identifier_token
from app.services.embeddings import embed_text, format_pgvector, report_embedding_text
from app.services.face_analysis_ai import FaceAnalysisAI
from app.services.face_analysis_pipeline import (
  FaceAnalysisPipeline,
  initialize_face_analysis_v2,
  project_legacy_analysis_result,
)
from app.services.face3d_calibration_receipts import (
  FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION,
  build_face3d_calibration_receipt_request_context,
  verify_face3d_calibration_receipt,
  verify_and_consume_face3d_calibration_receipt,
)
from app.services.media_deletion import (
  GOLDEN_MASK_UNATTACHED_DELETION_REASON,
  MediaObjectRef,
  collect_report_media_refs,
  enqueue_unattached_media_deletion,
  enqueue_unreferenced_report_media_deletions,
  ensure_media_deletion_schema,
  is_media_object_referenced,
  process_media_deletion_outbox_items,
)
from app.services.makeup_recommendation_context import normalize_makeup_profile_gender
from app.services.openai_analysis import (
  OpenAIAnalysisService,
  append_analysis_metric,
  measured_personal_color_column_values,
)
from app.services.owned_media import (
  require_owned_media,
  resolve_owned_source_media,
  trusted_media_request_payload,
)
from app.services.push_notifications import create_and_send_notification
from app.services.private_media_delivery import (
  create_owned_media_delivery_urls,
  project_payload_with_private_media,
  project_private_media_reference,
)
from app.services.report_rate_limit import enforce_report_generation_limit
from app.services.s3 import (
  PRIVATE_USER_MEDIA_OBJECT_PREFIX,
  S3Service,
  is_private_golden_mask_object_key,
)
from app.services.users import ensure_user


router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)

async def update_analysis_report_embedding(db: Database, report: dict) -> bool:
  embedding = await asyncio.to_thread(embed_text, report_embedding_text(report))
  if embedding is None:
    return False

  try:
    await db.execute(
      "update analysis_reports set embedding = $2::vector where id = $1",
      report["id"],
      format_pgvector(embedding),
    )
  except Exception:
    return False
  return True

ANALYSIS_MEDIA_SELECT = """
  r.*,
  source_media.id as source_media_ref_id,
  source_media.bucket as source_media_ref_bucket,
  source_media.object_key as source_media_ref_object_key,
  source_media.cdn_url as source_media_ref_cdn_url,
  source_media.content_type as source_media_ref_content_type,
  source_media.width as source_media_ref_width,
  source_media.height as source_media_ref_height,
  preview_media.id as preview_media_ref_id,
  preview_media.bucket as preview_media_ref_bucket,
  preview_media.object_key as preview_media_ref_object_key,
  preview_media.cdn_url as preview_media_ref_cdn_url,
  preview_media.content_type as preview_media_ref_content_type,
  preview_media.width as preview_media_ref_width,
  preview_media.height as preview_media_ref_height,
  golden_mask_media.id as golden_mask_ref_id,
  golden_mask_media.content_type as golden_mask_ref_content_type,
  golden_mask_media.byte_size as golden_mask_ref_byte_size
"""

# 목록 응답 경량화: 측정 원본(request.measurements)은 목록 SQL에서도 제외한다.
# 상세 응답은 아래 response projection에서 mm/receipt 같은 내부 전용 필드를
# 제거한다. DB에는 검증·감사를 위해 원본 detail_payload를 그대로 보존한다.
ANALYSIS_MEDIA_LIST_SELECT = (
  ANALYSIS_MEDIA_SELECT
  + ",\n  (r.detail_payload"
  " #- '{request,measurements}'"
  " #- '{result,faceAnalysisV2,coverage}'"
  " #- '{result,faceAnalysisV2,aiMeasurements}'"
  " #- '{result,faceAnalysisV2,faceProfile}'"
  " #- '{result,faceAnalysisV2,derived}'"
  " #- '{result,faceAnalysisV2,perception}'"
  " #- '{result,faceAnalysisV2,consulting}') as detail_payload"
)
# NOTE(M5): result.stylingLooks/beautyGuide 추가 제거는 getFaceAnalysisReports
# 소비자 8곳이 목록 리포트에서 이 필드를 읽지 않음을 전수 확인한 뒤에만 한다.


def decode_json_object(value: object) -> dict:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


_FACE3D_INTERNAL_PROFILE_FIELDS = {
  "calibrationReceipt",
  "captureNonce",
  "profileBindingSha256",
  "sensorProvenance",
  "serverCalibrationReceiptStatus",
}
_INTERNAL_ONLY = object()


def _project_face3d_profile_for_response(value: object) -> object:
  if not isinstance(value, dict):
    return value
  projected = copy.deepcopy(value)
  for field in _FACE3D_INTERNAL_PROFILE_FIELDS:
    projected.pop(field, None)
  metrics = projected.get("metrics")
  if isinstance(metrics, dict):
    for metric in metrics.values():
      if isinstance(metric, dict):
        for field in list(metric):
          if field.startswith("valueMm"):
            metric.pop(field, None)
  return projected


def _project_internal_only_records(value: object) -> object:
  if isinstance(value, dict):
    sensitivity = value.get("sensitivity")
    if (
      not isinstance(sensitivity, bool)
      and isinstance(sensitivity, (int, float))
      and sensitivity >= 3
    ):
      return _INTERNAL_ONLY
    projected: dict = {}
    for key, item in value.items():
      if isinstance(key, str) and key.endswith(".mm"):
        continue
      if key == "rationaleMetricKeys" and isinstance(item, list):
        projected[key] = [
          metric_key
          for metric_key in item
          if isinstance(metric_key, str) and not metric_key.endswith(".mm")
        ]
        continue
      child = _project_internal_only_records(item)
      if child is not _INTERNAL_ONLY:
        projected[key] = child
    return projected
  if isinstance(value, list):
    projected_items = []
    for item in value:
      child = _project_internal_only_records(item)
      if child is not _INTERNAL_ONLY:
        projected_items.append(child)
    return projected_items
  return value


def project_analysis_detail_payload_for_response(detail_payload: dict) -> dict:
  projected = copy.deepcopy(detail_payload)
  request = projected.get("request")
  if isinstance(request, dict):
    if "face3d" in request:
      request["face3d"] = _project_face3d_profile_for_response(request["face3d"])
    measurements = request.get("measurements")
    if isinstance(measurements, dict) and "face3d" in measurements:
      measurements["face3d"] = _project_face3d_profile_for_response(
        measurements["face3d"],
      )

  result = projected.get("result")
  if isinstance(result, dict):
    filtered_result = _project_internal_only_records(result)
    if isinstance(filtered_result, dict):
      projected["result"] = filtered_result
  return projected


def restore_app_store_face_report_contract(
  detail_payload: dict,
  source_object_key: object,
) -> dict:
  is_app_store_face_source = False
  if isinstance(source_object_key, str):
    is_app_store_face_source = source_object_key.startswith(
      "uploads/face-analysis-source/",
    )
    if source_object_key.startswith(PRIVATE_USER_MEDIA_OBJECT_PREFIX):
      private_path = source_object_key.removeprefix(
        PRIVATE_USER_MEDIA_OBJECT_PREFIX,
      ).split("/")
      is_app_store_face_source = (
        len(private_path) >= 4
        and private_path[0] == "users"
        and bool(private_path[1])
        and private_path[2] == "face-analysis-source"
      )
  if not is_app_store_face_source:
    return detail_payload

  result = detail_payload.get("result")
  if not isinstance(result, dict) or "recommendedMakeups" in result:
    return detail_payload

  styling_looks = result.get("stylingLooks")
  natural_look = (
    styling_looks.get("natural")
    if isinstance(styling_looks, dict)
    else None
  )
  if not isinstance(natural_look, dict):
    return detail_payload

  required_fields = ("title", "subtitle", "description")
  if not all(
    isinstance(natural_look.get(field), str)
    and natural_look[field].strip()
    for field in required_fields
  ):
    return detail_payload

  projected = copy.deepcopy(detail_payload)
  projected_result = projected["result"]
  tags = projected_result.get("tags")
  projected_result["recommendedMakeups"] = [
    {
      field: natural_look[field].strip()
      for field in required_fields
    }
    | {
      "tags": [
        tag.strip()
        for tag in tags
        if isinstance(tag, str) and tag.strip()
      ] if isinstance(tags, list) else [],
    },
  ]
  return projected


def normalize_analysis_report_row(row: dict | None) -> dict | None:
  if row is None:
    return None

  normalized = dict(row)
  normalized["detail_payload"] = restore_app_store_face_report_contract(
    project_analysis_detail_payload_for_response(
      decode_json_object(normalized.get("detail_payload")),
    ),
    normalized.get("source_media_ref_object_key"),
  )
  attach_analysis_media_reference(normalized, "source_media_ref", "source_media")
  attach_analysis_media_reference(normalized, "preview_media_ref", "preview_media")
  attach_golden_mask_reference(normalized)

  return normalized


def attach_analysis_media_reference(row: dict, prefix: str, target_key: str) -> None:
  media_id = row.pop(f"{prefix}_id", None)
  bucket = row.pop(f"{prefix}_bucket", None)
  object_key = row.pop(f"{prefix}_object_key", None)
  cdn_url = row.pop(f"{prefix}_cdn_url", None)
  content_type = row.pop(f"{prefix}_content_type", None)
  width = row.pop(f"{prefix}_width", None)
  height = row.pop(f"{prefix}_height", None)

  if media_id is None:
    row[target_key] = None
    return

  row[target_key] = {
    "id": str(media_id),
    "bucket": bucket,
    "object_key": object_key,
    "cdn_url": cdn_url,
    "content_type": content_type,
    "width": width,
    "height": height,
  }


def attach_golden_mask_reference(row: dict) -> None:
  attached_media_id = row.pop("golden_mask_media_id", None)
  metadata = decode_json_object(row.pop("golden_mask_metadata", None))
  active_media_id = row.pop("golden_mask_ref_id", None)
  content_type = row.pop("golden_mask_ref_content_type", None)
  byte_size = row.pop("golden_mask_ref_byte_size", None)

  if attached_media_id is None or active_media_id is None:
    row["golden_mask"] = None
    return

  row["golden_mask"] = {
    **metadata,
    "available": True,
    "media_id": str(active_media_id),
    "content_type": content_type,
    "byte_size": byte_size,
  }


def normalize_analysis_report_rows(rows: list[dict]) -> list[dict]:
  return [
    normalized
    for row in rows
    if (normalized := normalize_analysis_report_row(row)) is not None
  ]


async def project_analysis_reports_with_private_media(
  db: Database,
  settings: Settings,
  *,
  owner_user_id: UUID | str,
  reports: list[dict],
) -> list[dict]:
  media_ids: list[UUID | str | None] = []
  for report in reports:
    source_media = report.get("source_media")
    preview_media = report.get("preview_media")
    media_ids.extend(
      (
        source_media.get("id")
        if isinstance(source_media, dict)
        else report.get("source_media_id"),
        preview_media.get("id")
        if isinstance(preview_media, dict)
        else report.get("preview_media_id"),
      ),
    )

  delivery_urls = await create_owned_media_delivery_urls(
    db,
    settings,
    owner_user_id=owner_user_id,
    media_ids=media_ids,
  )

  projected_reports: list[dict] = []
  for report in reports:
    projected = dict(report)
    source_media = projected.get("source_media")
    preview_media = projected.get("preview_media")
    source_media_id = (
      source_media.get("id")
      if isinstance(source_media, dict)
      else projected.get("source_media_id")
    )
    preview_media_id = (
      preview_media.get("id")
      if isinstance(preview_media, dict)
      else projected.get("preview_media_id")
    )
    source_delivery_url = (
      delivery_urls.get(str(source_media_id)) if source_media_id else None
    )
    preview_delivery_url = (
      delivery_urls.get(str(preview_media_id)) if preview_media_id else None
    )

    if isinstance(source_media, dict):
      projected["source_media"] = project_private_media_reference(
        source_media,
        source_delivery_url,
      )
    if isinstance(preview_media, dict):
      projected["preview_media"] = project_private_media_reference(
        preview_media,
        preview_delivery_url,
      )
    projected["detail_payload"] = project_payload_with_private_media(
      decode_json_object(projected.get("detail_payload")),
      delivery_url=source_delivery_url,
      preview_delivery_url=preview_delivery_url,
    )
    projected_reports.append(projected)
  return projected_reports


async def project_analysis_report_with_private_media(
  db: Database,
  settings: Settings,
  *,
  owner_user_id: UUID | str,
  report: dict | None,
) -> dict | None:
  normalized = normalize_analysis_report_row(report)
  if normalized is None:
    return None
  return (
    await project_analysis_reports_with_private_media(
      db,
      settings,
      owner_user_id=owner_user_id,
      reports=[normalized],
    )
  )[0]


def build_analysis_detail_payload(payload: AnalysisJobCreate, result: dict) -> dict:
  request_payload = {
    key: value
    for key, value in payload.request_payload.items()
    if not key.startswith("_faceAnalysis")
  }
  return {"request": request_payload, "result": result}


def build_initial_analysis_detail_payload(
  payload: AnalysisJobCreate,
  *,
  face_analysis_v2_enabled: bool,
) -> dict:
  measurements = payload.request_payload.get("measurements")
  if not (
    face_analysis_v2_enabled
    and isinstance(measurements, dict)
    and measurements.get("schemaVersion") == "aura-face-analysis-measurements-v1"
  ):
    return {"request": payload.request_payload}

  face_analysis_v2 = initialize_face_analysis_v2(payload.request_payload)
  # AI 단계가 끝나기 전에는 규칙 기반 파생값을 완성된 얼굴 분석처럼 투영하지 않는다.
  result = {
    "faceAnalysisV2": face_analysis_v2.model_dump(by_alias=True, mode="json"),
  }
  return build_analysis_detail_payload(payload, result)


async def mark_analysis_failed(
  db: Database,
  report_id: UUID,
  message: str,
  payload: AnalysisJobCreate,
  details: dict | None = None,
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
        "error": {"message": message, "details": details or {}},
      },
    ),
  )


async def run_analysis_job_background(
  report_id: UUID,
  payload: AnalysisJobCreate,
  settings: Settings,
  *,
  db: Database = database,
) -> None:
  started_at = time.monotonic()

  def record_outcome(success: bool, error_code: str | None) -> None:
    # 실험 지표: 리포트 단위 성공/실패 + 방식(단일 vs V2) + 총 지연.
    append_analysis_metric(
      settings.analysis_metrics_path,
      {
        "kind": "outcome",
        "reportId": str(report_id),
        "method": "v2" if settings.face_analysis_v2_enabled else "single",
        "success": success,
        "errorCode": error_code,
        "durationMs": round((time.monotonic() - started_at) * 1000),
      },
    )

  logger.info(
    "[aura:analysis-api] background:start reportId=%s",
    report_id,
  )
  await db.execute(
    "update analysis_reports set status = 'processing' where id = $1",
    report_id,
  )

  analysis_service = OpenAIAnalysisService(settings)

  async def persist_anchor(anchor: dict) -> None:
    # 앵커 확정 즉시 컬럼을 조기 기록한다. V1 fan-out과 V2 병렬 anchor가
    # 같은 저장 계약을 사용하므로 모바일은 실행 모드를 구분할 필요가 없다.
    await db.execute(
      """
      update analysis_reports
      set face_shape = coalesce($2, face_shape),
          skin_type = coalesce($3, skin_type),
          recommended_mood = coalesce($4, recommended_mood)
      where id = $1 and status = 'processing'
      """,
      report_id,
      anchor.get("faceShape"),
      anchor.get("skinType"),
      anchor.get("recommendedMood"),
    )
    logger.info(
      "[aura:analysis-api] anchor:persisted reportId=%s durationMs=%s",
      report_id,
      round((time.monotonic() - started_at) * 1000),
    )

  try:
    logger.info(
      "[aura:analysis-api] text:start reportId=%s provider=%s model=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
    )
    if settings.face_analysis_v2_enabled:
      source_image_bytes = await analysis_service.read_source_image_bytes(
        payload.request_payload,
      )
      initial_v2 = initialize_face_analysis_v2(payload.request_payload)
      authoritative_face_shape = initial_v2.derived.face_shape.label

      async def generate_and_persist_v2_anchor() -> dict | None:
        try:
          anchor = await analysis_service.analyze_face_report_anchor(
            payload.request_payload,
            source_image_bytes,
            face_shape=authoritative_face_shape,
          )
          await persist_anchor(anchor)
          return anchor
        except Exception as exc:  # noqa: BLE001 - preview failure must not fail the report.
          logger.warning(
            "[aura:analysis-api] anchor:failed reportId=%s reason=%s",
            report_id,
            exc.__class__.__name__,
          )
          return None

      anchor_task = asyncio.create_task(generate_and_persist_v2_anchor())
      face_analysis_v2 = await FaceAnalysisPipeline(
        db=db,
        settings=settings,
        ai=FaceAnalysisAI(analysis_service),
      ).run(
        report_id=report_id,
        request_payload=payload.request_payload,
        source_image_bytes=source_image_bytes,
        anchor_values=anchor_task,
      )
      result = project_legacy_analysis_result(face_analysis_v2)
      result["faceAnalysisV2"] = face_analysis_v2.model_dump(
        by_alias=True,
        mode="json",
      )
    else:
      result = await analysis_service.analyze_text(
        payload.request_payload,
        on_anchor=persist_anchor,
      )
    logger.info(
      "[aura:analysis-api] text:success reportId=%s provider=%s model=%s durationMs=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
      round((time.monotonic() - started_at) * 1000),
    )
    record_outcome(success=True, error_code=None)
  except AppError as exc:
    logger.warning(
      "[aura:analysis-api] text:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    record_outcome(success=False, error_code=exc.code)
    await mark_analysis_failed(db, report_id, exc.message, payload, exc.details)
    return
  except Exception as exc:
    message = "AI analysis invocation failed."
    details = {"reason": exc.__class__.__name__}
    logger.exception("[aura:analysis-api] text:failed reportId=%s", report_id)
    record_outcome(success=False, error_code=exc.__class__.__name__)
    await mark_analysis_failed(db, report_id, message, payload, details)
    return

  # DB 정본은 기기 측정값 원칙: 조명 보정·정합성 게이트를 통과한 측정 퍼컬의
  # 한국어 라벨을 result에 **주입**해 정본화한다(측정 성공 시). result에 직접
  # 넣어야 (a) DB 컬럼, (b) detail_payload, (c) 모바일 완결성 게이트가 읽는
  # result.personalColor/toneSummary가 모두 같은 정본을 보게 된다 — 컬럼만
  # 채우면 게이트(result.personalColor 요구)가 프로드 경로에서 여전히 실패한다.
  # 측정 실패면 주입하지 않아 기존 값(V2 perception 등)을 그대로 둔다("측정
  # 우선, 실패 시만 기존/LLM 값").
  measured_personal_color, measured_tone_summary = (
    measured_personal_color_column_values(
      payload.request_payload.get("measurements"),
    )
  )
  if isinstance(result, dict):
    if measured_personal_color:
      result["personalColor"] = measured_personal_color
    if measured_tone_summary:
      result["toneSummary"] = measured_tone_summary
  effective_personal_color = result.get("personalColor") if isinstance(result, dict) else None
  effective_tone_summary = result.get("toneSummary") if isinstance(result, dict) else None
  report_status = "completed"
  report = await db.fetchrow(
    """
    update analysis_reports
    set status = $2::job_status,
        ai_provider = $3,
        ai_model = $4,
        analyzed_at = now(),
        personal_color = coalesce($5, personal_color),
        face_shape = coalesce($6, face_shape),
        skin_type = coalesce($7, skin_type),
        tone_summary = coalesce($8, tone_summary),
        recommended_mood = coalesce($9, recommended_mood),
        summary = coalesce($10, summary),
        short_summary = coalesce($11, short_summary),
        skin_analysis_summary = coalesce($12, skin_analysis_summary),
        base_makeup_guide = coalesce($13, base_makeup_guide),
        tags = coalesce($14, tags),
        detail_payload = $15::jsonb
    where id = $1
    returning *
    """,
    report_id,
    report_status,
    settings.analysis_provider,
    settings.effective_analysis_model_id,
    effective_personal_color,
    result.get("faceShape") if isinstance(result, dict) else None,
    result.get("skinType") if isinstance(result, dict) else None,
    effective_tone_summary,
    result.get("recommendedMood") if isinstance(result, dict) else None,
    result.get("summary") if isinstance(result, dict) else None,
    result.get("shortSummary") if isinstance(result, dict) else None,
    result.get("skinAnalysisSummary") if isinstance(result, dict) else None,
    result.get("baseMakeupGuide") if isinstance(result, dict) else None,
    result.get("tags") if isinstance(result, dict) else None,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )

  if report is None:
    logger.warning(
      "[aura:analysis-api] background:missing-report reportId=%s",
      report_id,
    )
    return

  logger.info(
    "[aura:analysis-api] report:completed reportId=%s durationMs=%s",
    report_id,
    round((time.monotonic() - started_at) * 1000),
  )

  # The report text is already renderable at this point. Publish its completion
  # event so users outside the loading/result screen receive the notification
  # as soon as My Page can show the completed report.
  await create_and_send_notification(
    db,
    settings,
    user_id=report["user_id"],
    notification_type="analysis_report_completed",
    title="맞춤 분석 보고서가 완성됐어요",
    body="AURA에서 얼굴 분석 결과를 확인해 보세요.",
    data={
      "reportId": str(report_id),
      "route": "FaceAnalysisReportDetail",
    },
    dedupe_key=f"analysis-report:{report_id}:completed",
  )

  # 임베딩 실패는 보고서 완료를 막지 않지만, 조용히 삼키면 벡터 검색에서
  # 해당 보고서가 소리 없이 빠진다 — 최소한 로그로 드러낸다.
  if not await update_analysis_report_embedding(db, report):
    logger.warning(
      "[aura:analysis-api] embedding:failed reportId=%s",
      report_id,
    )

async def dispatch_analysis_job(
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  payload: AnalysisJobCreate,
  settings: Settings,
) -> None:
  execution_mode = settings.ai_job_execution_mode_normalized

  if execution_mode == "inline":
    background_tasks.add_task(
      run_analysis_job_background,
      report_id,
      payload,
      settings,
    )
    return

  if execution_mode != "sqs":
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  publisher = AIJobQueuePublisher(settings)

  try:
    result = await asyncio.to_thread(publisher.publish_analysis_job, report_id, user_id)
  except AppError as exc:
    await mark_analysis_failed(db, report_id, exc.message, payload, exc.details)
    raise

  logger.info(
    "[aura:analysis-api] job:queued reportId=%s messageId=%s",
    report_id,
    result.get("messageId"),
  )


@router.post("/jobs")
async def create_analysis_job(
  payload: AnalysisJobCreate,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  # 계정 성별을 서버가 주입한다(클라이언트 값은 신뢰하지 않고 덮어씀).
  # 분석 프롬프트가 사진으로 성별을 추론하는 대신 이 값을 쓰게 하는 근거 —
  # 메이크업 추천 V2의 "성별 재추론 금지" 원칙과 정합.
  payload.request_payload["profileGender"] = normalize_makeup_profile_gender(
    user.get("gender"),
  )
  execution_mode = settings.ai_job_execution_mode_normalized

  if payload.run_immediately and execution_mode not in {"inline", "sqs"}:
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  source_media = await resolve_owned_source_media(
    db,
    owner_user_id=user["id"],
    media_id=payload.source_media_id,
    photo_capture_id=payload.photo_capture_id,
    required=payload.run_immediately,
  )
  if payload.preview_media_id is not None and (
    source_media is None or payload.preview_media_id != source_media["id"]
  ):
    await require_owned_media(
      db,
      media_id=payload.preview_media_id,
      owner_user_id=user["id"],
    )
  payload = payload.model_copy(
    update={
      "request_payload": trusted_media_request_payload(
        settings,
        payload.request_payload,
        source_media,
      ),
    },
  )
  await enforce_report_generation_limit(
    db,
    user_id=user["id"],
    feature="face_analysis",
    per_minute=settings.face_analysis_generation_limit_per_minute,
    per_day=settings.face_analysis_generation_limit_per_day,
  )
  logger.info(
    "[aura:analysis-api] job:create-start userToken=%s runImmediately=%s executionMode=%s",
    log_identifier_token(auth.subject),
    payload.run_immediately,
    execution_mode,
  )
  async def insert_report(executor) -> dict | None:
    row = await executor.fetchrow(
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
      json.dumps(
        build_initial_analysis_detail_payload(
          payload,
          face_analysis_v2_enabled=settings.face_analysis_v2_enabled,
        ),
      ),
    )
    return dict(row) if row else None

  measurements = payload.request_payload.get("measurements")
  measurement_face3d = (
    measurements.get("face3d")
    if isinstance(measurements, dict)
    else None
  )
  primary_face3d = (
    measurement_face3d
    if isinstance(measurement_face3d, dict)
    else payload.request_payload.get("face3d")
  )
  receipt_request_context = build_face3d_calibration_receipt_request_context(
    user_id=user["id"],
    photo_capture_id=payload.photo_capture_id,
    source_media_id=payload.source_media_id,
  )
  receipt_verification = (
    verify_face3d_calibration_receipt(
      primary_face3d,
      settings,
      expected_report_context_id=receipt_request_context.report_context_id,
      expected_subject_context_id=receipt_request_context.subject_context_id,
    )
    if isinstance(primary_face3d, dict)
    and primary_face3d.get("schemaVersion") == FACE3D_TRUSTED_PROFILE_SCHEMA_VERSION
    and primary_face3d.get("confidenceCalibrationStatus") == "calibrated"
    else None
  )

  # NOTE(M3 후속): 동일 촬영 연타의 멱등 dedup은 부분 유니크 인덱스(위 init_db
  # NOTE 참조)가 전제인데, 그 인덱스는 배포 안전성 문제로 보류했다. 인덱스 없이
  # UniqueViolation catch만 두면 무의미하므로 함께 보류한다.
  if receipt_verification is not None and receipt_verification.verified:
    async def consume_and_insert(connection) -> dict | None:
      await verify_and_consume_face3d_calibration_receipt(
        connection,
        settings,
        payload.request_payload,
        expected_report_context_id=receipt_request_context.report_context_id,
        expected_subject_context_id=receipt_request_context.subject_context_id,
      )
      return await insert_report(connection)

    report = await db.run_in_transaction(consume_and_insert)
  else:
    await verify_and_consume_face3d_calibration_receipt(
      db,
      settings,
      payload.request_payload,
      expected_report_context_id=receipt_request_context.report_context_id,
      expected_subject_context_id=receipt_request_context.subject_context_id,
    )
    report = await insert_report(db)

  if payload.run_immediately:
    await dispatch_analysis_job(
      db,
      background_tasks,
      report["id"],
      user["id"],
      payload,
      settings,
    )

  projected_report = await project_analysis_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=report,
  )
  return success({"job": projected_report})

@router.get("/jobs/{job_id}")
async def get_analysis_job(
  job_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  job = await db.fetchrow(
    f"""
    select {ANALYSIS_MEDIA_SELECT}
    from analysis_reports r
    left join media_assets source_media
      on source_media.id = r.source_media_id
      and source_media.owner_user_id = r.user_id
      and source_media.status = 'active'
      and source_media.deleted_at is null
    left join media_assets preview_media
      on preview_media.id = r.preview_media_id
      and preview_media.owner_user_id = r.user_id
      and preview_media.status = 'active'
      and preview_media.deleted_at is null
    left join media_assets golden_mask_media
      on golden_mask_media.id = r.golden_mask_media_id
      and golden_mask_media.owner_user_id = r.user_id
      and golden_mask_media.status = 'active'
      and golden_mask_media.deleted_at is null
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    job_id,
    user["id"],
  )

  if not job:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  projected_job = await project_analysis_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=job,
  )
  return success({"job": projected_job})


@router.post("/jobs/{job_id}/retry")
async def retry_analysis_job_stage(
  job_id: UUID,
  retry: FaceAnalysisStageRetryRequest,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  if not settings.face_analysis_v2_enabled:
    raise AppError(
      409,
      "FACE_ANALYSIS_V2_DISABLED",
      "Progressive face analysis is not enabled.",
    )

  user = await ensure_user(db, auth)
  await enforce_report_generation_limit(
    db,
    user_id=user["id"],
    feature="face_analysis",
    per_minute=settings.face_analysis_generation_limit_per_minute,
    per_day=settings.face_analysis_generation_limit_per_day,
  )
  existing = await db.fetchrow(
    """
    select *
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    """,
    job_id,
    user["id"],
  )
  if existing is None:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  row = dict(existing)
  detail = decode_json_object(row.get("detail_payload"))
  request_payload = decode_json_object(detail.get("request"))
  measurements = request_payload.get("measurements")
  if not (
    isinstance(measurements, dict)
    and measurements.get("schemaVersion") == "aura-face-analysis-measurements-v1"
  ):
    raise AppError(
      409,
      "FACE_ANALYSIS_V2_RETRY_UNAVAILABLE",
      "This report does not contain retryable face measurements.",
    )

  retry_payload = {
    **request_payload,
    "_faceAnalysisRetryStage": retry.stage.value,
  }
  payload = AnalysisJobCreate(
    photo_capture_id=row.get("photo_capture_id"),
    source_media_id=row.get("source_media_id"),
    preview_media_id=row.get("preview_media_id"),
    title=row.get("title") or "AI makeup analysis",
    report_title=row.get("report_title"),
    environment_label=row.get("environment_label"),
    run_immediately=True,
    request_payload=retry_payload,
  )
  # 조건부 전이: 이미 pending/processing이면 되돌리지 않는다 — 진행 중 실행과
  # 겹쳐 같은 행을 두 백그라운드 태스크가 경쟁 업데이트하는 것을 막는다.
  updated = await db.fetchrow(
    """
    update analysis_reports
    set status = 'pending',
        error_message = null,
        detail_payload = jsonb_set(
          detail_payload,
          '{result,faceAnalysisV2,pipeline,retryRequestedStage}',
          to_jsonb($2::text),
          true
        )
    where id = $1 and status in ('completed', 'failed')
    returning *
    """,
    job_id,
    retry.stage.value,
  )
  if updated is None:
    raise AppError(
      409,
      "ANALYSIS_JOB_NOT_RETRYABLE",
      "이미 분석이 진행 중이에요. 잠시 후 다시 시도해 주세요.",
      {"jobId": str(job_id)},
    )
  await dispatch_analysis_job(
    db,
    background_tasks,
    job_id,
    user["id"],
    payload,
    settings,
  )
  projected_job = await project_analysis_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=updated,
  )
  return success({"job": projected_job})


@router.get("/reports")
async def list_analysis_reports(
  with_recommended_makeups: bool = Query(False, alias="withRecommendedMakeups"),
  # 미지정 시 무제한(기존 동작). 페이지네이션/무한스크롤 없이 기본 상한을 두면
  # 51번째 이후 리포트가 UI에서 접근 불가해지는 회귀라, 상한 도입은 offset/커서와
  # 함께 별건으로 한다.
  limit: int | None = Query(None, ge=1, le=200),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  filters = [
    "r.user_id = $1",
    "r.status = 'completed'",
    """
    (
      jsonb_typeof(r.detail_payload->'result'->'faceAnalysisV2') is null
      or (
        jsonb_typeof(r.detail_payload->'result'->'faceAnalysisV2') = 'object'
        and jsonb_typeof(
          r.detail_payload->'result'->'faceAnalysisV2'->'perception'
        ) = 'object'
        and jsonb_typeof(
          r.detail_payload->'result'->'faceAnalysisV2'->'consulting'
        ) = 'object'
      )
    )
    """,
  ]
  values: list[object] = [user["id"]]

  if with_recommended_makeups:
    filters.append(
      """
      jsonb_typeof(r.detail_payload->'result'->'recommendedMakeups') = 'array'
      and jsonb_array_length(r.detail_payload->'result'->'recommendedMakeups') > 0
      """,
    )

  query = f"""
    select {ANALYSIS_MEDIA_LIST_SELECT}
    from analysis_reports r
    left join media_assets source_media
      on source_media.id = r.source_media_id
      and source_media.owner_user_id = r.user_id
      and source_media.status = 'active'
      and source_media.deleted_at is null
    left join media_assets preview_media
      on preview_media.id = r.preview_media_id
      and preview_media.owner_user_id = r.user_id
      and preview_media.status = 'active'
      and preview_media.deleted_at is null
    left join media_assets golden_mask_media
      on golden_mask_media.id = r.golden_mask_media_id
      and golden_mask_media.owner_user_id = r.user_id
      and golden_mask_media.status = 'active'
      and golden_mask_media.deleted_at is null
    where {' and '.join(filters)}
      and r.deleted_at is null
    order by r.created_at desc
  """

  if limit is not None:
    values.append(limit)
    query += f" limit ${len(values)}"

  reports = await db.fetch(
    query,
    *values,
  )

  projected_reports = await project_analysis_reports_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    reports=normalize_analysis_report_rows(reports),
  )
  return success({"reports": projected_reports})


@router.get("/reports/{report_id}")
async def get_analysis_report(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
  # 실험 계측(로컬 전용): 클라이언트가 실제로 기다린 벽시계 시간(업로드 후 분석 시작~
  # 보고서 준비). 서버 분석 시간엔 안 잡히는 폴링 감지 지연까지 포함한 "체감 시간".
  # ANALYSIS_METRICS_PATH 미설정(프로드 기본)이면 append는 no-op.
  client_elapsed_ms: int | None = Query(default=None, alias="clientElapsedMs", ge=0),
  client_preview_elapsed_ms: int | None = Query(
    default=None,
    alias="clientPreviewElapsedMs",
    ge=0,
  ),
  client_preview_perception_ready: bool | None = Query(
    default=None,
    alias="clientPreviewPerceptionReady",
  ),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    f"""
    select {ANALYSIS_MEDIA_SELECT}
    from analysis_reports r
    left join media_assets source_media
      on source_media.id = r.source_media_id
      and source_media.owner_user_id = r.user_id
      and source_media.status = 'active'
      and source_media.deleted_at is null
    left join media_assets preview_media
      on preview_media.id = r.preview_media_id
      and preview_media.owner_user_id = r.user_id
      and preview_media.status = 'active'
      and preview_media.deleted_at is null
    left join media_assets golden_mask_media
      on golden_mask_media.id = r.golden_mask_media_id
      and golden_mask_media.owner_user_id = r.user_id
      and golden_mask_media.status = 'active'
      and golden_mask_media.deleted_at is null
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  if client_elapsed_ms is not None:
    append_analysis_metric(
      settings.analysis_metrics_path,
      {
        "kind": "perceived",
        "reportId": str(report_id),
        "method": "v2" if settings.face_analysis_v2_enabled else "single",
        "clientElapsedMs": client_elapsed_ms,
      },
    )
  if client_preview_elapsed_ms is not None:
    append_analysis_metric(
      settings.analysis_metrics_path,
      {
        "kind": "preview",
        "reportId": str(report_id),
        "method": "v2" if settings.face_analysis_v2_enabled else "single",
        "clientElapsedMs": client_preview_elapsed_ms,
        "perceptionReady": client_preview_perception_ready,
      },
    )

  projected_report = await project_analysis_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=report,
  )
  return success({"report": projected_report})


async def _attach_analysis_report_golden_mask(
  connection,
  *,
  report_id: UUID,
  user_id: UUID,
  payload: GoldenMaskAttachRequest,
) -> dict:
  report = await connection.fetchrow(
    """
    select id, status, golden_mask_media_id, golden_mask_metadata
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    for update
    """,
    report_id,
    user_id,
  )
  if report is None:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  report_status = str(report.get("status") or "")
  if report_status in {"pending", "processing"}:
    raise AppError(
      425,
      "GOLDEN_MASK_REPORT_NOT_READY",
      "The analysis report must complete before its Golden Mask can be attached.",
    )
  if report_status != "completed":
    raise AppError(
      409,
      "GOLDEN_MASK_REPORT_NOT_ATTACHABLE",
      "A Golden Mask cannot be attached to this terminal analysis report.",
    )

  attached_media_id = report.get("golden_mask_media_id")
  if attached_media_id is not None and attached_media_id != payload.media_id:
    raise AppError(
      409,
      "GOLDEN_MASK_ATTACHMENT_CONFLICT",
      "A different Golden Mask is already attached to this report.",
    )

  media = await connection.fetchrow(
    """
    select id, media_kind, bucket, object_key, cdn_url, content_type, byte_size
    from media_assets
    where id = $1
      and owner_user_id = $2
      and status = 'active'
      and deleted_at is null
    for share
    """,
    payload.media_id,
    user_id,
  )
  if media is None:
    raise AppError(
      404,
      "GOLDEN_MASK_MEDIA_NOT_FOUND",
      "The Golden Mask media asset was not found for this user.",
    )
  if media["media_kind"] != GOLDEN_MASK_MEDIA_KIND:
    raise AppError(
      400,
      "GOLDEN_MASK_MEDIA_KIND_INVALID",
      "The attached media asset is not a Golden Mask.",
    )
  if media["content_type"] != GOLDEN_MASK_CONTENT_TYPE:
    raise AppError(
      415,
      "GOLDEN_MASK_CONTENT_TYPE_INVALID",
      "The Golden Mask media content type is not supported.",
    )
  if media.get("cdn_url") is not None:
    raise AppError(
      409,
      "GOLDEN_MASK_MEDIA_NOT_PRIVATE",
      "Golden Mask media must not have a public CDN URL.",
    )
  if int(media.get("byte_size") or 0) != payload.byte_size:
    raise AppError(
      409,
      "GOLDEN_MASK_BYTE_SIZE_MISMATCH",
      "Golden Mask metadata does not match the uploaded media size.",
      {
        "actualByteSize": int(media.get("byte_size") or 0),
        "expectedByteSize": payload.byte_size,
      },
    )

  if attached_media_id == payload.media_id:
    descriptor = {
      **decode_json_object(report.get("golden_mask_metadata")),
      "available": True,
      "media_id": str(payload.media_id),
      "content_type": media["content_type"],
      "byte_size": media["byte_size"],
    }
    return success({"goldenMask": descriptor})

  metadata = payload.metadata_payload()
  updated = await connection.fetchrow(
    """
    update analysis_reports
    set golden_mask_media_id = $3,
        golden_mask_metadata = $4::jsonb,
        updated_at = now()
    where id = $1
      and user_id = $2
      and deleted_at is null
      and golden_mask_media_id is null
    returning golden_mask_media_id, golden_mask_metadata
    """,
    report_id,
    user_id,
    payload.media_id,
    json.dumps(metadata),
  )
  if updated is None:
    current = await connection.fetchrow(
      """
      select golden_mask_media_id, golden_mask_metadata
      from analysis_reports
      where id = $1 and user_id = $2 and deleted_at is null
      """,
      report_id,
      user_id,
    )
    if current is not None and current.get("golden_mask_media_id") == payload.media_id:
      descriptor = {
        **decode_json_object(current.get("golden_mask_metadata")),
        "available": True,
        "media_id": str(payload.media_id),
        "content_type": media["content_type"],
        "byte_size": media["byte_size"],
      }
      return success({"goldenMask": descriptor})
    raise AppError(
      409,
      "GOLDEN_MASK_ATTACHMENT_CONFLICT",
      "A different Golden Mask is already attached to this report.",
    )

  descriptor = {
    **decode_json_object(updated.get("golden_mask_metadata")),
    "available": True,
    "media_id": str(payload.media_id),
    "content_type": media["content_type"],
    "byte_size": media["byte_size"],
  }
  return success({"goldenMask": descriptor})


@router.post("/reports/{report_id}/golden-mask")
async def attach_analysis_report_golden_mask(
  report_id: UUID,
  payload: GoldenMaskAttachRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)

  async def attach(connection) -> dict:
    return await _attach_analysis_report_golden_mask(
      connection,
      report_id=report_id,
      user_id=user["id"],
      payload=payload,
    )

  return await db.run_in_transaction(attach)


@router.get("/reports/{report_id}/golden-mask")
async def get_analysis_report_golden_mask(
  report_id: UUID,
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  row = await db.fetchrow(
    """
    select
      r.id as report_id,
      r.golden_mask_metadata,
      media.id as media_id,
      media.bucket,
      media.object_key,
      media.content_type,
      media.byte_size
    from analysis_reports r
    left join media_assets media
      on media.id = r.golden_mask_media_id
      and media.owner_user_id = r.user_id
      and media.media_kind = $3
      and media.content_type = $4
      and media.cdn_url is null
      and media.status = 'active'
      and media.deleted_at is null
    where r.id = $1
      and r.user_id = $2
      and r.deleted_at is null
    """,
    report_id,
    user["id"],
    GOLDEN_MASK_MEDIA_KIND,
    GOLDEN_MASK_CONTENT_TYPE,
  )
  if row is None:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")
  if row.get("media_id") is None:
    raise AppError(
      404,
      "GOLDEN_MASK_NOT_FOUND",
      "This analysis report does not have an available Golden Mask.",
    )

  s3 = S3Service(settings)
  s3.assert_managed_media_location(
    bucket=str(row["bucket"]),
    object_key=str(row["object_key"]),
  )
  download_url = s3.create_presigned_download(
    bucket=str(row["bucket"]),
    object_key=str(row["object_key"]),
    expires_in=900,
  )
  response.headers["Cache-Control"] = "private, no-store"
  descriptor = {
    **decode_json_object(row.get("golden_mask_metadata")),
    "available": True,
    "media_id": str(row["media_id"]),
    "content_type": row["content_type"],
    "byte_size": row["byte_size"],
    "download_url": download_url,
    "expires_in_seconds": 900,
  }
  return success({"goldenMask": descriptor})


@router.delete("/golden-mask-media/{media_id}")
async def delete_unattached_golden_mask_media(
  media_id: UUID,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  await ensure_media_deletion_schema(db)
  user = await ensure_user(db, auth)

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  async def queue_deletion(connection) -> tuple[list[UUID], bool]:
    media = await connection.fetchrow(
      """
      select
        id,
        media_kind,
        bucket,
        object_key,
        cdn_url,
        content_type,
        status,
        deleted_at
      from media_assets
      where id = $1 and owner_user_id = $2
      for update
      """,
      media_id,
      user["id"],
    )
    if (
      media is None
      or media.get("media_kind") != GOLDEN_MASK_MEDIA_KIND
      or media.get("content_type") != GOLDEN_MASK_CONTENT_TYPE
      or media.get("cdn_url") is not None
      or not media.get("bucket")
      or not is_private_golden_mask_object_key(str(media.get("object_key") or ""))
    ):
      raise AppError(
        404,
        "GOLDEN_MASK_MEDIA_NOT_FOUND",
        "The Golden Mask media asset was not found for this user.",
      )

    already_deleted = (
      media.get("status") != "active"
      or media.get("deleted_at") is not None
    )
    if media.get("status") == "deleted" or media.get("deleted_at") is not None:
      return [], True
    if media.get("status") not in {"active", "deletion_pending"}:
      raise AppError(
        404,
        "GOLDEN_MASK_MEDIA_NOT_FOUND",
        "The Golden Mask media asset was not found for this user.",
      )

    bucket = str(media["bucket"])
    object_key = str(media["object_key"])
    if await is_media_object_referenced(
      connection,
      bucket=bucket,
      object_key=object_key,
    ):
      raise AppError(
        409,
        "GOLDEN_MASK_MEDIA_REFERENCED",
        "An attached Golden Mask cannot be deleted with this endpoint.",
      )

    if media.get("status") == "active":
      await connection.execute(
        """
        update media_assets
        set status = 'deletion_pending'
        where id = $1
          and owner_user_id = $2
          and status = 'active'
          and deleted_at is null
        """,
        media_id,
        user["id"],
      )

    outbox_id, should_process = await enqueue_unattached_media_deletion(
      connection,
      ref=MediaObjectRef(
        bucket=bucket,
        object_key=object_key,
        media_asset_id=media_id,
      ),
      reason=GOLDEN_MASK_UNATTACHED_DELETION_REASON,
    )
    return ([outbox_id] if should_process else []), already_deleted

  outbox_ids, already_deleted = await db.run_in_transaction(queue_deletion)
  if outbox_ids:
    background_tasks.add_task(
      process_media_deletion_outbox_items,
      database,
      settings,
      outbox_ids,
    )

  return success({
    "alreadyDeleted": already_deleted,
    "deleted": True,
    "mediaId": str(media_id),
    "outboxCount": len(outbox_ids),
  })


@router.delete("/reports/{report_id}")
async def delete_analysis_report(
  report_id: UUID,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  await ensure_media_deletion_schema(db)
  user = await ensure_user(db, auth)

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  outbox_ids: list[UUID] = []
  skipped_referenced_count = 0
  already_deleted = False

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      report = await connection.fetchrow(
        """
        select
          r.*,
          source_media.bucket as source_media_bucket,
          source_media.object_key as source_media_object_key,
          preview_media.bucket as preview_media_bucket,
          preview_media.object_key as preview_media_object_key,
          golden_mask_media.id as golden_mask_media_id,
          golden_mask_media.bucket as golden_mask_media_bucket,
          golden_mask_media.object_key as golden_mask_media_object_key,
          capture_media.id as capture_media_id,
          capture_media.bucket as capture_media_bucket,
          capture_media.object_key as capture_media_object_key
        from analysis_reports r
        left join media_assets source_media
          on source_media.id = r.source_media_id
          and source_media.owner_user_id = r.user_id
        left join media_assets preview_media
          on preview_media.id = r.preview_media_id
          and preview_media.owner_user_id = r.user_id
        left join media_assets golden_mask_media
          on golden_mask_media.id = r.golden_mask_media_id
          and golden_mask_media.owner_user_id = r.user_id
        left join photo_captures pc
          on pc.id = r.photo_capture_id
          and pc.user_id = r.user_id
        left join media_assets capture_media
          on capture_media.id = pc.media_id
          and capture_media.owner_user_id = r.user_id
        where r.id = $1 and r.user_id = $2
        for update of r
        """,
        report_id,
        user["id"],
      )

      if not report:
        raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

      already_deleted = report["deleted_at"] is not None
      refs = collect_report_media_refs(
        dict(report),
        cdn_base_url=settings.effective_cdn_base_url,
        default_bucket=settings.s3_bucket_name,
      )

      await connection.execute(
        """
        update analysis_reports
        set deleted_at = coalesce(deleted_at, now()),
            status = case
              when status in ('pending', 'processing') then 'cancelled'::job_status
              else status
            end
        where id = $1 and user_id = $2
        """,
        report_id,
        user["id"],
      )

      outbox_ids, skipped_referenced_count = (
        await enqueue_unreferenced_report_media_deletions(
          connection,
          report_id=report_id,
          refs=refs,
        )
      )

  if outbox_ids:
    background_tasks.add_task(
      process_media_deletion_outbox_items,
      database,
      settings,
      outbox_ids,
    )

  return success({
    "alreadyDeleted": already_deleted,
    "deleted": True,
    "outboxCount": len(outbox_ids),
    "reportId": str(report_id),
    "skippedReferencedCount": skipped_referenced_count,
  })


@router.delete("/reports/{report_id}/recommended-makeups/{makeup_index}")
async def delete_analysis_report_recommended_makeup(
  report_id: UUID,
  makeup_index: int,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  if makeup_index < 0:
    raise AppError(
      400,
      "INVALID_RECOMMENDED_MAKEUP_INDEX",
      "Recommended makeup index must be zero or greater.",
    )

  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select detail_payload
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  detail_payload = decode_json_object(report.get("detail_payload"))
  result = detail_payload.get("result")
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None

  if not isinstance(recommended_makeups, list) or makeup_index >= len(recommended_makeups):
    raise AppError(
      404,
      "RECOMMENDED_MAKEUP_NOT_FOUND",
      "Recommended makeup was not found.",
      details={"makeupIndex": makeup_index},
    )

  updated_makeups = [
    makeup
    for index, makeup in enumerate(recommended_makeups)
    if index != makeup_index
  ]
  result["recommendedMakeups"] = updated_makeups
  detail_payload["result"] = result

  updated_report = await db.fetchrow(
    """
    update analysis_reports
    set detail_payload = $3::jsonb
    where id = $1 and user_id = $2 and deleted_at is null
    returning *
    """,
    report_id,
    user["id"],
    json.dumps(detail_payload),
  )

  projected_report = await project_analysis_report_with_private_media(
    db,
    settings,
    owner_user_id=user["id"],
    report=updated_report,
  )
  return success({"report": projected_report})
