from datetime import datetime, timezone
from hashlib import sha256
import json
import logging
import re
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.makeup_recommendation import (
  MakeupRecommendationSessionAnswer,
  MakeupRecommendationSessionCreate,
)
from app.services.makeup_editorial_question_templates import resolve_reviewed_editorial_preset
from app.services.makeup_keyword_question_templates import resolve_reviewed_keyword_questions
from app.services.makeup_recommendation import (
  deterministic_questions_v2,
  generate_questions_v2_with_fallback,
  normalize_custom_situation_v2,
)
from app.services.makeup_recommendation_custom_situation import validate_custom_situation_for_request
from app.services.makeup_recommendation_context import (
  compile_context_snapshot,
  fetch_owned_completed_analysis_report,
)
from app.services.makeup_trends import resolve_keyword_selection


logger = logging.getLogger(__name__)

CUSTOM_BLOCKED_PATTERNS = (
  r"ignore\s+(all\s+)?previous",
  r"system\s*prompt",
  r"developer\s*message",
  r"이전\s*(지시|명령).{0,12}무시",
  r"시스템\s*프롬프트",
  r"개발자\s*메시지",
  r"<\s*/?\s*(script|system|developer)\b",
  r"```",
)
CUSTOM_BLOCKED_RE = re.compile("|".join(CUSTOM_BLOCKED_PATTERNS), re.IGNORECASE)


def _json_value(value: Any, fallback: Any) -> Any:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return fallback
  return value if isinstance(value, type(fallback)) else fallback


def guard_custom_text(value: str, *, field: str = "customSituationText") -> str:
  normalized = " ".join(value.split())
  if not normalized:
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_EMPTY", f"{field} cannot be empty.")
  if any(ord(character) < 32 and character not in "\t\n\r" for character in value):
    raise AppError(422, "MAKEUP_CUSTOM_SITUATION_INVALID", f"{field} contains invalid characters.")
  if CUSTOM_BLOCKED_RE.search(normalized):
    raise AppError(
      422,
      "MAKEUP_CUSTOM_SITUATION_UNSAFE",
      f"{field} must describe the occasion and desired impression, not model instructions.",
    )
  return normalized[:240]


def normalize_idempotency_key(payload: MakeupRecommendationSessionCreate, value: str | None) -> str:
  if value is not None:
    normalized = value.strip()
    if not normalized or len(normalized) > 120 or not re.fullmatch(r"[A-Za-z0-9._:-]+", normalized):
      raise AppError(422, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key is invalid.")
    return normalized
  canonical = json.dumps(payload.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":"))
  return f"auto-{sha256(canonical.encode('utf-8')).hexdigest()}"


def session_response(row: dict[str, Any]) -> dict[str, Any]:
  context = _json_value(row.get("context_snapshot"), {})
  selection = context.get("selection") if isinstance(context.get("selection"), dict) else {}
  profile = context.get("profile") if isinstance(context.get("profile"), dict) else {}
  profile_gender = str(profile.get("gender") or "")
  editorial_preset = (
    selection.get("editorialPreset")
    if isinstance(selection.get("editorialPreset"), dict)
    else {}
  )
  return {
    "id": str(row["id"]),
    **({"profileGender": profile_gender} if profile_gender in {"female", "male", "unspecified"} else {}),
    "status": str(row.get("status") or "questioning"),
    "questions": _json_value(row.get("questions"), []),
    "currentQuestionIndex": int(row.get("current_question_index") or 0),
    "answers": _json_value(row.get("answers"), []),
    "sourceAnalysisReportId": str(row.get("analysis_report_id") or "") or None,
    "situation": selection.get("situation"),
    "keyword": selection.get("keyword"),
    "editorialPresetId": editorial_preset.get("id"),
    "customSituationText": selection.get("customSituationText"),
    "customSituationLabel": selection.get("customSituationLabel"),
    "imageMode": str(row.get("image_mode") or context.get("image", {}).get("effectiveMode") or "generic"),
    "reportId": str(row.get("report_id") or "") or None,
    "expiresAt": str(row.get("expires_at") or "") or None,
  }


def _idempotency_matches(row: dict[str, Any], payload: MakeupRecommendationSessionCreate) -> bool:
  context = _json_value(row.get("context_snapshot"), {})
  image = context.get("image") if isinstance(context.get("image"), dict) else {}
  selection = context.get("selection") if isinstance(context.get("selection"), dict) else {}
  editorial_preset = (
    selection.get("editorialPreset")
    if isinstance(selection.get("editorialPreset"), dict)
    else {}
  )
  stored_editorial_preset_id = str(editorial_preset.get("id") or "")
  custom_text_matches = (
    stored_editorial_preset_id == str(payload.editorial_preset_id or "")
    if payload.editorial_preset_id is not None
    else str(row.get("custom_situation_text") or "") == str(payload.custom_situation_text or "")
  )
  custom_label_matches = (
    True
    if payload.editorial_preset_id is not None
    else str(selection.get("customSituationLabel") or "") == str(payload.custom_situation_label or "")
  )
  requested_image_mode = str(image.get("requestedMode") or row.get("image_mode") or "generic")
  return all(
    (
      str(row.get("analysis_report_id") or "") == str(payload.analysis_report_id),
      str(row.get("situation_id") or "") == str(payload.situation_id or ""),
      str(row.get("keyword_id") or "") == str(payload.keyword_id or ""),
      custom_text_matches,
      custom_label_matches,
      requested_image_mode == payload.image_mode,
    ),
  )

async def create_session(
  db: Any,
  settings: Settings,
  user_id: UUID,
  payload: MakeupRecommendationSessionCreate,
  idempotency_key: str | None,
  *,
  profile_gender: Any = None,
) -> dict[str, Any]:
  normalized_key = normalize_idempotency_key(payload, idempotency_key)
  existing = await db.fetchrow(
    """
    select id, analysis_report_id, situation_id, keyword_id, custom_situation_text,
           context_snapshot, questions, answers, current_question_index, status,
           report_id, image_mode, expires_at
    from makeup_recommendation_sessions
    where user_id = $1 and idempotency_key = $2
    """,
    user_id,
    normalized_key,
  )
  if existing is not None:
    if not _idempotency_matches(existing, payload):
      raise AppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for different input.")
    return session_response(existing)

  report = await fetch_owned_completed_analysis_report(db, user_id, payload.analysis_report_id)
  situation: dict[str, Any] | None = None
  keyword: dict[str, Any] | None = None
  custom_text: str | None = None
  custom_label: str | None = None
  normalized_custom: dict[str, Any] | None = None
  editorial_preset: dict[str, Any] | None = None
  if payload.keyword_id is not None and payload.situation_id is not None:
    situation, keyword = await resolve_keyword_selection(db, payload.situation_id, payload.keyword_id)
  elif payload.custom_situation_text is not None:
    custom_text = await validate_custom_situation_for_request(payload.custom_situation_text, settings)
    if payload.custom_situation_label is not None:
      custom_label = guard_custom_text(payload.custom_situation_label, field="customSituationLabel")
    normalized_custom = await normalize_custom_situation_v2(settings, custom_text)
  elif payload.editorial_preset_id is not None:
    editorial_preset = resolve_reviewed_editorial_preset(payload.editorial_preset_id)
    if editorial_preset is None:
      raise AppError(422, "MAKEUP_EDITORIAL_PRESET_UNKNOWN", "The editorial trend is not available.")
    custom_text = str(editorial_preset["seedPrompt"])
    custom_label = str(editorial_preset["displayText"])

  context = compile_context_snapshot(
    report,
    situation=situation,
    keyword=keyword,
    custom_situation_text=custom_text,
    custom_situation_label=custom_label,
    normalized_custom=normalized_custom,
    requested_image_mode=payload.image_mode,
    personalized_enabled=settings.makeup_personalized_image_enabled,
    editorial_preset={
      "id": editorial_preset["id"],
      "displayText": editorial_preset["displayText"],
      "seedPrompt": editorial_preset["seedPrompt"],
    } if editorial_preset is not None else None,
    profile_gender=profile_gender,
  )
  if keyword is not None:
    question_result = await resolve_reviewed_keyword_questions(db, keyword)
    if question_result is None:
      question_result = {
        "questions": deterministic_questions_v2(context),
        "source": "keyword_template_fallback",
        "version": "makeup-keyword-questions-fallback-v1",
      }
  elif editorial_preset is not None:
    question_result = {
      "questions": editorial_preset["questions"],
      "source": editorial_preset["source"],
      "version": editorial_preset["version"],
    }
  else:
    question_result = await generate_questions_v2_with_fallback(settings, context)
  questions = question_result["questions"]
  context["questioning"] = {
    "source": question_result["source"],
    "version": question_result["version"],
  }
  status = "questioning" if questions else "ready"
  effective_image_mode = str(context["image"]["effectiveMode"])
  row = await db.fetchrow(
    """
    insert into makeup_recommendation_sessions
      (user_id, analysis_report_id, situation_id, keyword_id, custom_situation_text,
       context_snapshot, questions, answers, current_question_index, status,
       report_id, idempotency_key, image_mode, expires_at)
    values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, '[]'::jsonb, 0, $8,
            null, $9, $10, now() + interval '24 hours')
    on conflict (user_id, idempotency_key) do update
      set idempotency_key = excluded.idempotency_key
    returning id, analysis_report_id, situation_id, keyword_id, custom_situation_text,
              context_snapshot, questions, answers, current_question_index, status,
              report_id, image_mode, idempotency_key, expires_at
    """,
    user_id,
    payload.analysis_report_id,
    payload.situation_id,
    payload.keyword_id,
    custom_text,
    json.dumps(context, ensure_ascii=False, default=str),
    json.dumps(questions, ensure_ascii=False),
    status,
    normalized_key,
    effective_image_mode,
  )
  if row is None:
    raise AppError(503, "MAKEUP_SESSION_CREATE_FAILED", "The recommendation session could not be created.")
  if not _idempotency_matches(row, payload):
    raise AppError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for different input.")
  return session_response(row)


async def get_owned_session(db: Any, user_id: UUID, session_id: UUID) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select id, user_id, analysis_report_id, situation_id, keyword_id, custom_situation_text,
           context_snapshot, questions, answers, current_question_index, status,
           report_id, image_mode, expires_at
    from makeup_recommendation_sessions
    where id = $1 and user_id = $2
    """,
    session_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "MAKEUP_SESSION_NOT_FOUND", "The recommendation session was not found.")
  expires_at = row.get("expires_at")
  if isinstance(expires_at, str):
    try:
      expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
      expires_at = None
  expired_by_time = (
    isinstance(expires_at, datetime)
    and expires_at.astimezone(timezone.utc) <= datetime.now(timezone.utc)
  )
  if str(row.get("status") or "") == "expired" or expired_by_time:
    if str(row.get("status") or "") != "expired":
      await db.execute(
        "update makeup_recommendation_sessions set status = 'expired', updated_at = now() where id = $1 and user_id = $2",
        session_id,
        user_id,
      )
    raise AppError(410, "MAKEUP_SESSION_EXPIRED", "The recommendation session has expired.")
  return row


async def answer_session(
  db: Any,
  user_id: UUID,
  session_id: UUID,
  payload: MakeupRecommendationSessionAnswer,
) -> dict[str, Any]:
  row = await get_owned_session(db, user_id, session_id)
  status = str(row.get("status") or "")
  if status not in {"questioning", "ready"}:
    raise AppError(409, "MAKEUP_SESSION_NOT_ANSWERABLE", "This session cannot accept answers.")
  questions = _json_value(row.get("questions"), [])
  answers = _json_value(row.get("answers"), [])
  question_index = next(
    (index for index, question in enumerate(questions) if question.get("id") == payload.question_id),
    None,
  )
  if question_index is None:
    raise AppError(422, "MAKEUP_SESSION_QUESTION_INVALID", "The question does not belong to this session.")
  current_index = int(row.get("current_question_index") or 0)
  if question_index > current_index:
    raise AppError(409, "MAKEUP_SESSION_QUESTION_OUT_OF_ORDER", "Answer the current question first.")

  question = questions[question_index]
  option_label: str | None = None
  if payload.option_id is not None:
    option = next(
      (item for item in question.get("options", []) if item.get("id") == payload.option_id),
      None,
    )
    if option is None:
      raise AppError(422, "MAKEUP_SESSION_OPTION_INVALID", "The option does not belong to this question.")
    option_label = str(option.get("label") or "")
  free_text = guard_custom_text(payload.free_text, field="freeText") if payload.free_text else None
  additional = (
    guard_custom_text(payload.additional_constraints, field="additionalConstraints")
    if payload.additional_constraints
    else None
  )
  answer = {
    "questionId": payload.question_id,
    "optionId": payload.option_id,
    "label": option_label,
    "freeText": free_text,
    "additionalConstraints": additional,
  }
  existing_index = next(
    (index for index, item in enumerate(answers) if item.get("questionId") == payload.question_id),
    None,
  )
  if existing_index is None:
    answers.append(answer)
  else:
    answers[existing_index] = answer

  next_index = max(current_index, question_index + 1)
  next_status = "ready" if next_index >= len(questions) else "questioning"
  updated = await db.fetchrow(
    """
    update makeup_recommendation_sessions
    set answers = $3::jsonb, current_question_index = $4, status = $5, updated_at = now()
    where id = $1 and user_id = $2 and status in ('questioning', 'ready')
    returning id, analysis_report_id, situation_id, keyword_id, custom_situation_text,
              context_snapshot, questions, answers, current_question_index, status,
              report_id, image_mode, expires_at
    """,
    session_id,
    user_id,
    json.dumps(answers, ensure_ascii=False),
    next_index,
    next_status,
  )
  if updated is None:
    raise AppError(409, "MAKEUP_SESSION_STATE_CHANGED", "The session state changed. Refresh and retry.")
  return session_response(updated)


async def _existing_report(db: Any, user_id: UUID, report_id: UUID) -> dict[str, Any]:
  row = await db.fetchrow(
    """
    select id, recommendation, image_status
    from makeup_recommendation_reports
    where id = $1 and user_id = $2
    """,
    report_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "MAKEUP_RECOMMENDATION_NOT_FOUND", "The makeup recommendation report was not found.")
  recommendation = _json_value(row.get("recommendation"), {})
  return {
    "reportId": row["id"],
    "recommendation": recommendation,
    "generationSource": str(recommendation.get("generationSource") or "") or None,
    "imageStatus": str(row.get("image_status") or "pending"),
    "reused": True,
  }


async def begin_generation(db: Any, user_id: UUID, session_id: UUID) -> dict[str, Any]:
  row = await get_owned_session(db, user_id, session_id)
  if row.get("report_id") is not None:
    return await _existing_report(db, user_id, row["report_id"])
  status = str(row.get("status") or "")
  if status == "questioning":
    raise AppError(409, "MAKEUP_SESSION_ANSWERS_REQUIRED", "Answer all recommendation questions first.")
  if status == "generating":
    raise AppError(409, "MAKEUP_SESSION_GENERATING", "The recommendation is already being generated.")
  if status not in {"ready", "failed"}:
    raise AppError(409, "MAKEUP_SESSION_NOT_GENERATABLE", "This session cannot generate a recommendation.")
  claimed = await db.fetchrow(
    """
    update makeup_recommendation_sessions
    set status = 'generating', updated_at = now()
    where id = $1 and user_id = $2 and report_id is null and status in ('ready', 'failed')
    returning id, user_id, analysis_report_id, situation_id, keyword_id,
              context_snapshot, questions, answers, image_mode
    """,
    session_id,
    user_id,
  )
  if claimed is None:
    refreshed = await get_owned_session(db, user_id, session_id)
    if refreshed.get("report_id") is not None:
      return await _existing_report(db, user_id, refreshed["report_id"])
    raise AppError(409, "MAKEUP_SESSION_STATE_CHANGED", "The session state changed. Refresh and retry.")
  return {"session": claimed, "reused": False}


async def complete_generation(
  db: Any,
  settings: Settings,
  user_id: UUID,
  session: dict[str, Any],
  recommendation: dict[str, Any],
) -> dict[str, Any]:
  context = _json_value(session.get("context_snapshot"), {})
  selection = context.get("selection") if isinstance(context.get("selection"), dict) else {}
  situation = selection.get("situation") if isinstance(selection.get("situation"), dict) else {}
  keyword = selection.get("keyword") if isinstance(selection.get("keyword"), dict) else {}
  custom = str(selection.get("customSituationText") or "")
  custom_label = str(selection.get("customSituationLabel") or "")
  scenario_text = str(keyword.get("label") or custom_label or custom or situation.get("label") or "맞춤 메이크업")
  tags = keyword.get("tags") if isinstance(keyword.get("tags"), list) else []
  row = await db.fetchrow(
    """
    with saved_report as (
      insert into makeup_recommendation_reports
        (user_id, scenario_text, scenario_tags, questions, answers, recommendation,
         scenario_model_id, question_model_id, recommendation_model_id, image_model_id,
         prompt_version, source_analysis_report_id, session_id, situation_id, keyword_id,
         context_snapshot, schema_version, image_mode)
      values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb,
              $7, $8, $9, $10, 'makeup-recommendation-v2', $11, $12, $13, $14,
              $15::jsonb, 'makeup-recommendation-v2', $16)
      on conflict (session_id) do update set session_id = excluded.session_id
      returning id, recommendation, image_status
    ), pending_assets as (
      insert into makeup_recommendation_assets
        (report_id, look_id, role, status, model_id, prompt_version, provenance)
      select saved_report.id,
             coalesce(nullif(look->>'id', ''), look->>'role'),
             look->>'role',
             'pending',
             $10,
             'makeup-image-v2',
             jsonb_build_object(
               'modelId', $10,
               'promptVersion', 'makeup-image-v2',
               'consentStatus', case when $16 = 'personalized' then 'pending-verification' else 'not-required' end,
               'rightsStatus', case when $16 = 'personalized' then 'pending-verification' else 'synthetic-reference' end,
               'sourceMediaId', null
             )
      from saved_report,
           jsonb_array_elements(coalesce($6::jsonb->'looks', '[]'::jsonb)) as look
      where look->>'role' = 'anchor'
      on conflict (report_id, look_id) do nothing
      returning id
    ), completed_session as (
      update makeup_recommendation_sessions session
      set status = 'completed', report_id = (select id from saved_report), updated_at = now()
      where session.id = $12 and session.user_id = $1
      returning session.id
    )
    select saved_report.id, saved_report.recommendation, saved_report.image_status
    from saved_report, completed_session
    """,
    user_id,
    scenario_text,
    json.dumps(tags, ensure_ascii=False),
    json.dumps(_json_value(session.get("questions"), []), ensure_ascii=False),
    json.dumps(_json_value(session.get("answers"), []), ensure_ascii=False),
    json.dumps(recommendation, ensure_ascii=False),
    settings.effective_scenario_model_id,
    settings.effective_question_model_id,
    settings.effective_recommendation_model_id,
    settings.openai_image_model_id,
    session["analysis_report_id"],
    session["id"],
    session.get("situation_id"),
    session.get("keyword_id"),
    json.dumps(context, ensure_ascii=False, default=str),
    str(session.get("image_mode") or "generic"),
  )
  if row is None:
    raise AppError(503, "MAKEUP_RECOMMENDATION_SAVE_FAILED", "The recommendation could not be saved.")
  saved_recommendation = _json_value(row.get("recommendation"), recommendation)
  response_looks = [
    {**look, "imageStatus": str(look.get("imageStatus") or "pending")}
    for look in saved_recommendation.get("looks", [])
    if isinstance(look, dict)
  ]
  response_recommendation = {**saved_recommendation, "looks": response_looks}
  return {
    "reportId": row["id"],
    "generationSource": str(response_recommendation.get("generationSource") or "") or None,
    "recommendation": response_recommendation,
    "imageStatus": str(row.get("image_status") or "pending"),
    "reused": False,
  }


async def fail_generation(db: Any, user_id: UUID, session_id: UUID) -> None:
  await db.execute(
    """
    update makeup_recommendation_sessions
    set status = 'failed', updated_at = now()
    where id = $1 and user_id = $2 and status = 'generating' and report_id is null
    """,
    session_id,
    user_id,
  )
