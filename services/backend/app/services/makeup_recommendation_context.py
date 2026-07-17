import json
from typing import Any, Literal
from uuid import UUID

from app.core.errors import AppError
from app.services.makeup_recommendation_prompt import INPUT_PRIORITY


SAFE_DETAIL_FIELDS = (
  "makeupGuideline",
  "recommendedMakeups",
  "facePointGuide",
)


MakeupProfileGender = Literal["female", "male", "unspecified"]
MakeupProfilePresentation = Literal["feminine", "masculine", "neutral"]

PROFILE_PRESENTATIONS: dict[MakeupProfileGender, MakeupProfilePresentation] = {
  "female": "feminine",
  "male": "masculine",
  "unspecified": "neutral",
}

PROFILE_PRESENTATION_GUIDANCE: dict[MakeupProfileGender, str] = {
  "female": (
    "계정 성별은 여성입니다. 직접 입력과 답변이 우선하며, 별도 요청이 없으면 "
    "여성적인 표현을 기본 방향으로 사용합니다."
  ),
  "male": (
    "계정 성별은 남성입니다. 직접 입력과 답변이 우선하며, 별도 요청이 없으면 "
    "남성적인 표현을 기본 방향으로 사용합니다."
  ),
  "unspecified": (
    "계정에서 성별을 선택하지 않았습니다. 직접 입력과 답변이 우선하며, "
    "별도 요청이 없으면 성별을 추정하지 않고 중성적인 표현을 기본 방향으로 사용합니다."
  ),
}


def normalize_makeup_profile_gender(value: Any) -> MakeupProfileGender:
  normalized = str(value or "").strip().casefold()
  if normalized in {"female", "woman", "여성", "여자"}:
    return "female"
  if normalized in {"male", "man", "남성", "남자"}:
    return "male"
  return "unspecified"


def compile_profile_snapshot(value: Any) -> dict[str, str]:
  gender = normalize_makeup_profile_gender(value)
  return {
    "gender": gender,
    "presentation": PROFILE_PRESENTATIONS[gender],
    "presentationGuidance": PROFILE_PRESENTATION_GUIDANCE[gender],
  }


def _json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return {}
  return value if isinstance(value, dict) else {}


def _clean_text(value: Any, limit: int = 500) -> str | None:
  if not isinstance(value, str):
    return None
  cleaned = " ".join(value.split())
  return cleaned[:limit] or None


def _clean_string_list(value: Any, *, limit: int = 12, item_limit: int = 120) -> list[str]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      value = [value]
  if not isinstance(value, (list, tuple)):
    return []
  result: list[str] = []
  for item in value[:limit]:
    cleaned = _clean_text(str(item), item_limit)
    if cleaned:
      result.append(cleaned)
  return result


def _bounded_detail(value: Any, *, depth: int = 0) -> Any:
  if depth >= 3:
    return None
  if isinstance(value, str):
    return _clean_text(value, 300)
  if isinstance(value, bool) or value is None:
    return value
  if isinstance(value, (int, float)):
    return value
  if isinstance(value, list):
    return [_bounded_detail(item, depth=depth + 1) for item in value[:8]]
  if isinstance(value, dict):
    return {
      str(key)[:80]: bounded
      for key, item in list(value.items())[:16]
      if (bounded := _bounded_detail(item, depth=depth + 1)) is not None
    }
  return None


async def fetch_owned_completed_analysis_report(
  db: Any,
  user_id: UUID,
  report_id: UUID,
) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select r.id, r.user_id, r.status, r.source_media_id, r.analyzed_at, r.created_at,
           r.title, r.report_title, r.personal_color, r.face_shape, r.skin_type,
           r.tone_summary, r.recommended_mood, r.summary, r.short_summary,
           r.skin_analysis_summary, r.base_makeup_guide, r.tags, r.detail_payload,
           source_media.id as valid_source_media_id
    from analysis_reports r
    left join media_assets source_media
      on source_media.id = r.source_media_id
     and source_media.owner_user_id = r.user_id
     and source_media.status = 'active'
     and source_media.deleted_at is null
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    report_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")
  if str(row.get("status") or "") != "completed":
    raise AppError(
      409,
      "ANALYSIS_REPORT_NOT_COMPLETED",
      "Only a completed analysis report can be used for makeup recommendation.",
    )
  return dict(row)


def compile_analysis_snapshot(report: dict[str, Any]) -> dict[str, Any]:
  detail_payload = _json_object(report.get("detail_payload"))
  result = _json_object(detail_payload.get("result")) or detail_payload
  detail = {
    field: bounded
    for field in SAFE_DETAIL_FIELDS
    if (bounded := _bounded_detail(result.get(field))) not in (None, {}, [])
  }
  return {
    "id": str(report["id"]),
    "title": _clean_text(report.get("report_title") or report.get("title"), 160),
    "analyzedAt": str(report.get("analyzed_at") or report.get("created_at") or "") or None,
    "personalColor": _clean_text(report.get("personal_color"), 120),
    "faceShape": _clean_text(report.get("face_shape"), 120),
    "skinType": _clean_text(report.get("skin_type"), 120),
    "toneSummary": _clean_text(report.get("tone_summary"), 240),
    "recommendedMood": _clean_text(report.get("recommended_mood"), 160),
    "summary": _clean_text(report.get("summary"), 500),
    "shortSummary": _clean_text(report.get("short_summary"), 300),
    "skinAnalysisSummary": _clean_text(report.get("skin_analysis_summary"), 400),
    "baseMakeupGuide": _clean_text(report.get("base_makeup_guide"), 400),
    "tags": _clean_string_list(report.get("tags")),
    "detail": detail,
    "sourceMediaId": str(report.get("valid_source_media_id") or "") or None,
  }


def compile_context_snapshot(
  report: dict[str, Any],
  *,
  situation: dict[str, Any] | None,
  keyword: dict[str, Any] | None,
  custom_situation_text: str | None,
  custom_situation_label: str | None,
  normalized_custom: dict[str, Any] | None,
  requested_image_mode: str,
  personalized_enabled: bool = True,
  editorial_preset: dict[str, Any] | None = None,
  profile_gender: Any = None,
) -> dict[str, Any]:
  analysis = compile_analysis_snapshot(report)
  effective_image_mode = (
    "personalized"
    if personalized_enabled and requested_image_mode == "personalized" and analysis.get("sourceMediaId")
    else "generic"
  )
  selection = {
    "situation": situation,
    "keyword": keyword,
    "customSituationText": custom_situation_text,
    "customSituationLabel": custom_situation_label,
    "normalizedCustom": normalized_custom,
    "editorialPreset": editorial_preset,
  }
  return {
    "schemaVersion": "makeup-recommendation-context-v2",
    "analysisReport": analysis,
    "profile": compile_profile_snapshot(profile_gender),
    "selection": selection,
    "image": {
      "requestedMode": requested_image_mode,
      "effectiveMode": effective_image_mode,
      "personalizedConsent": requested_image_mode == "personalized",
    },
    "inputPriority": list(INPUT_PRIORITY),
  }
