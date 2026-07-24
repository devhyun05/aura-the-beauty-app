from datetime import datetime
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database
from app.services.users import ensure_user


router = APIRouter(prefix="/privacy", tags=["privacy"])

AI_DATA_CONSENT_VERSION = "ai-photo-processing-v1"
AI_DATA_CONSENT_PURPOSES = (
  "camera_analysis",
  "ai_processing",
  "third_party_ai",
)
AI_DATA_CATEGORIES = (
  "face_photos",
  "face_analysis_measurements",
  "survey_answers",
  "makeup_goals",
)
AI_DATA_RECIPIENTS = (
  "amazon_bedrock_anthropic_claude",
  "openai",
)


class AiDataConsentUpdate(BaseModel):
  accepted: bool


def _purpose_state(row: dict[str, Any] | None) -> dict[str, Any]:
  if row is None:
    return {
      "accepted": False,
      "accepted_at": None,
      "revoked_at": None,
      "version": None,
    }

  return {
    "accepted": bool(row.get("accepted")),
    "accepted_at": row.get("accepted_at"),
    "revoked_at": row.get("revoked_at"),
    "version": row.get("version"),
  }


def _consent_response(rows: list[dict[str, Any]]) -> dict[str, Any]:
  latest_by_purpose = {
    str(row["consent_type"]): row
    for row in rows
    if str(row.get("consent_type") or "") in AI_DATA_CONSENT_PURPOSES
  }
  purposes = {
    purpose: _purpose_state(latest_by_purpose.get(purpose))
    for purpose in AI_DATA_CONSENT_PURPOSES
  }
  accepted = all(
    state["accepted"] is True and state["version"] == AI_DATA_CONSENT_VERSION
    for state in purposes.values()
  )

  return {
    "accepted": accepted,
    "consent_ids": [
      str(latest_by_purpose[purpose]["id"])
      for purpose in AI_DATA_CONSENT_PURPOSES
      if purpose in latest_by_purpose
    ],
    "data_categories": list(AI_DATA_CATEGORIES),
    "purposes": purposes,
    "recipients": list(AI_DATA_RECIPIENTS),
    "version": AI_DATA_CONSENT_VERSION,
  }


async def _latest_ai_consent_rows(
  db: Database,
  user_id: Any,
) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select distinct on (consent_type)
      id,
      consent_type::text as consent_type,
      version,
      accepted,
      accepted_at,
      revoked_at,
      recorded_at
    from user_consents
    where user_id = $1
      and consent_type = any($2::consent_type[])
    order by consent_type, recorded_at desc, id desc
    """,
    user_id,
    list(AI_DATA_CONSENT_PURPOSES),
  )


@router.get("/ai-consent")
async def get_ai_data_consent(
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  rows = await _latest_ai_consent_rows(db, user["id"])
  return success({"consent": _consent_response(rows)})


@router.put("/ai-consent")
async def update_ai_data_consent(
  payload: AiDataConsentUpdate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  recorded_at = datetime.now().astimezone()

  async def record_consent(
    connection: asyncpg.Connection,
  ) -> list[dict[str, Any]]:
    rows = await connection.fetch(
      """
      insert into user_consents (
        user_id,
        consent_type,
        version,
        accepted,
        accepted_at,
        revoked_at,
        recorded_at,
        metadata
      )
      select
        $1,
        purpose::consent_type,
        $2,
        $3,
        case when $3 then $4 else null end,
        case when $3 then null else $4 end,
        $4,
        '{"source":"mobile_ai_consent"}'::jsonb
      from unnest($5::text[]) purpose
      returning
        id,
        consent_type::text as consent_type,
        version,
        accepted,
        accepted_at,
        revoked_at,
        recorded_at
      """,
      user["id"],
      AI_DATA_CONSENT_VERSION,
      payload.accepted,
      recorded_at,
      list(AI_DATA_CONSENT_PURPOSES),
    )
    return [dict(row) for row in rows]

  rows = await db.run_in_transaction(record_consent)
  return success({"consent": _consent_response(rows)})
