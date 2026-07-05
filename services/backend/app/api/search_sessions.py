from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends

from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database
from app.services.auradin_agent.session_manager import (
  answer_session_persisted,
  create_session_persisted,
  get_session_persisted,
  to_search_turn,
)


router = APIRouter(prefix="/search/sessions", tags=["search"])


@router.post("")
async def create_search_session(
  payload: dict[str, Any] = Body(default_factory=dict),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  prompt = str(payload.get("prompt") or "").strip()
  if not prompt:
    raise AppError(400, "PROMPT_REQUIRED", "Search prompt is required.")

  context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
  state = await create_session_persisted(
    prompt=prompt,
    report_id=str(payload.get("reportId") or "").strip() or None,
    source=str(payload.get("source") or "").strip() or None,
    context=context,
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
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  state = await get_session_persisted(session_id, settings=settings, db=db)
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  return success(to_search_turn(state))


@router.post("/{session_id}/answer")
async def answer_search_session(
  session_id: str,
  payload: dict[str, Any] = Body(default_factory=dict),
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
