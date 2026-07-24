import json
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.db.session import Database


AI_DATA_CONSENT_VERSION = "ai-photo-processing-v1"
AI_DATA_CONSENT_TYPES = (
  "camera_analysis",
  "ai_processing",
  "third_party_ai",
)
AI_DATA_RECIPIENTS = (
  "Amazon Web Services (Amazon Bedrock / Anthropic Claude)",
  "OpenAI",
)
AI_DATA_CATEGORIES = (
  "face_photo",
  "face_and_color_measurements",
  "beauty_preferences_and_answers",
)


def _empty_purpose_state() -> dict[str, Any]:
  return {
    "accepted": False,
    "acceptedAt": None,
    "revokedAt": None,
    "version": None,
  }


async def get_ai_data_consent(
  db: Database,
  *,
  user_id: UUID,
) -> dict[str, Any]:
  rows = await db.fetch(
    """
    select distinct on (consent_type)
      id,
      consent_type::text as purpose,
      accepted,
      version,
      accepted_at,
      revoked_at
    from user_consents
    where user_id = $1
      and consent_type::text = any($2::text[])
    order by consent_type, recorded_at desc, id desc
    """,
    user_id,
    list(AI_DATA_CONSENT_TYPES),
  )
  states = {
    purpose: _empty_purpose_state()
    for purpose in AI_DATA_CONSENT_TYPES
  }
  consent_ids: list[str] = []

  for row in rows:
    purpose = str(row["purpose"])
    states[purpose] = {
      "accepted": bool(row["accepted"]),
      "acceptedAt": row.get("accepted_at"),
      "revokedAt": row.get("revoked_at"),
      "version": row.get("version"),
    }
    if row.get("id"):
      consent_ids.append(str(row["id"]))

  accepted = all(
    states[purpose]["accepted"]
    and states[purpose]["version"] == AI_DATA_CONSENT_VERSION
    for purpose in AI_DATA_CONSENT_TYPES
  )
  return {
    "accepted": accepted,
    "consentIds": consent_ids if accepted else [],
    "dataCategories": list(AI_DATA_CATEGORIES),
    "purposes": states,
    "recipients": list(AI_DATA_RECIPIENTS),
    "version": AI_DATA_CONSENT_VERSION,
  }


async def set_ai_data_consent(
  db: Database,
  *,
  accepted: bool,
  user_id: UUID,
) -> dict[str, Any]:
  metadata = json.dumps({
    "dataCategories": list(AI_DATA_CATEGORIES),
    "recipients": list(AI_DATA_RECIPIENTS),
    "source": "mobile_explicit_choice",
  })

  for purpose in AI_DATA_CONSENT_TYPES:
    await db.execute(
      """
      insert into user_consents (
        user_id,
        consent_type,
        version,
        accepted,
        accepted_at,
        revoked_at,
        metadata
      )
      values (
        $1,
        $2::consent_type,
        $3,
        $4,
        case when $4 then now() else null end,
        case when $4 then null else now() end,
        $5::jsonb
      )
      """,
      user_id,
      purpose,
      AI_DATA_CONSENT_VERSION,
      accepted,
      metadata,
    )

  return await get_ai_data_consent(db, user_id=user_id)


async def require_current_ai_data_consent(
  db: Database,
  *,
  user_id: UUID,
) -> dict[str, Any]:
  consent = await get_ai_data_consent(db, user_id=user_id)
  if not consent["accepted"]:
    raise AppError(
      403,
      "AI_DATA_CONSENT_REQUIRED",
      "외부 AI 분석을 시작하려면 얼굴 사진과 분석 데이터 전송에 먼저 동의해 주세요.",
      {
        "consentVersion": AI_DATA_CONSENT_VERSION,
        "settingsPath": "설정 > AI 데이터 관리",
      },
    )
  return consent
