from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Response

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database
from app.services.auradin_agent.session_manager import (
  REFINE_DIALS,
  answer_session_persisted,
  cancel_session_persisted,
  create_session_persisted,
  get_session_persisted,
  refine_session_persisted,
  to_search_turn,
)


router = APIRouter(prefix="/search/sessions", tags=["search"])
MAX_SEARCH_PROMPT_LENGTH = 500
MAX_SEARCH_CONTEXT_VALUE_LENGTH = 80


def _validated_search_context(value: Any) -> dict[str, str]:
  if value is None:
    return {}
  if not isinstance(value, dict) or any(key != "personalColor" for key in value):
    raise AppError(422, "INVALID_SEARCH_CONTEXT", "Search context only accepts personalColor.")
  if "personalColor" not in value:
    return {}
  personal_color = value["personalColor"]
  if not isinstance(personal_color, str) or len(personal_color.strip()) > MAX_SEARCH_CONTEXT_VALUE_LENGTH:
    raise AppError(422, "INVALID_SEARCH_CONTEXT", "personalColor must be a short string.")
  return {"personalColor": personal_color.strip()} if personal_color.strip() else {}


def _bounded_optional_text(value: Any, *, field: str, max_length: int) -> str | None:
  if value is None:
    return None
  if not isinstance(value, str) or len(value.strip()) > max_length:
    raise AppError(422, "INVALID_SEARCH_REQUEST", f"{field} must be a short string.")
  return value.strip() or None


@router.post("")
async def create_search_session(
  payload: dict[str, Any] = Body(default_factory=dict),
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  prompt = str(payload.get("prompt") or "").strip()
  if not prompt:
    raise AppError(400, "PROMPT_REQUIRED", "Search prompt is required.")
  if len(prompt) > MAX_SEARCH_PROMPT_LENGTH:
    raise AppError(422, "SEARCH_PROMPT_TOO_LONG", "Search prompt is too long.")

  context = _validated_search_context(payload.get("context"))
  # §3: 리포트 톤은 client-relay context.personalColor로 받는다 (로컬/무DB에서도 동작).
  # 서버 로드(db+auth+reportId) 경로는 배포 환경에서 추가 배선 — 지금은 relay만.
  report_context = {"personalColor": str(context.get("personalColor") or "").strip()} if context.get("personalColor") else None
  state = await create_session_persisted(
    prompt=prompt,
    report_id=_bounded_optional_text(payload.get("reportId"), field="reportId", max_length=100),
    source=_bounded_optional_text(payload.get("source"), field="source", max_length=40),
    context=context,
    report_context=report_context,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  return success(
    {
      "sessionId": state["sessionId"],
      "phase": "searching",
      "retryAfterMs": 350,
    },
  )


@router.get("/{session_id}")
async def get_search_session(
  session_id: str,
  response: Response,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  state = await get_session_persisted(
    session_id,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  response.headers["Cache-Control"] = "private, no-store"
  return success(to_search_turn(state))


@router.post("/{session_id}/answer")
async def answer_search_session(
  session_id: str,
  payload: dict[str, Any] = Body(default_factory=dict),
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  question_id = str(payload.get("questionId") or "").strip()
  option_id = str(payload.get("optionId") or "").strip()
  if not question_id or not option_id:
    raise AppError(400, "ANSWER_REQUIRED", "questionId and optionId are required.")

  state = await answer_session_persisted(
    session_id,
    question_id=question_id,
    option_id=option_id,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  return success(
    {
      "sessionId": session_id,
      "phase": "searching",
      "retryAfterMs": 350,
    },
  )


@router.post("/{session_id}/cancel")
async def cancel_search_session(
  session_id: str,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  # 사용자가 검색 도중 이탈 → 세션 종료. 모바일이 홈 복귀 시 fire-and-forget으로 호출한다.
  state = await cancel_session_persisted(
    session_id,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  return success({"sessionId": session_id, "phase": "cancelled"})


@router.post("/{session_id}/refine")
async def refine_search_session(
  session_id: str,
  payload: dict[str, Any] = Body(default_factory=dict),
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  # §7: dial은 기존 후보 재랭킹(λ 조절)만, prompt는 §3 파서로 hard/soft 병합.
  prompt = str(payload.get("prompt") or "").strip()
  dial = str(payload.get("dial") or "").strip() or None
  if len(prompt) > MAX_SEARCH_PROMPT_LENGTH:
    raise AppError(422, "SEARCH_PROMPT_TOO_LONG", "Search prompt is too long.")
  if dial and dial not in REFINE_DIALS:
    raise AppError(400, "INVALID_DIAL", "dial must be 'more_similar' or 'more_diverse'.")
  if not prompt and not dial:
    raise AppError(400, "REFINE_REQUIRED", "prompt or dial is required.")

  state = await refine_session_persisted(
    session_id,
    prompt=prompt or None,
    dial=dial,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  return success(
    {
      "sessionId": session_id,
      "phase": "searching",
      "retryAfterMs": 350,
    },
  )
