"""A5 (§7.2) — POST /search/events: 모바일 fire-and-forget 이벤트 배치 수집.

계약:
- clientEventId 필수, 멱등성은 (owner_subject, client_event_id) — 중복은 DB가 무시.
- 알 수 없는 이벤트 타입·형식 위반은 Pydantic 422로 거부한다 (RFC §3.1).
- dev fallback subject 등 계약 owner가 없으면 이벤트를 skip하고 204 (fail-open).
- 기록 실패(DB 예외 포함)는 record_events가 삼킨다 — 서버 오류가 아닌 한 5xx를 내지 않는다.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database
from app.schemas.auradin_search import PostSearchEventsRequest
from app.services.auradin_agent.event_logger import (
  ANON_TOKEN_HEADER,
  derive_event_owner,
  record_events,
)


router = APIRouter(prefix="/search/events", tags=["search"])


@router.post("")
async def post_search_events(
  payload: Annotated[PostSearchEventsRequest, Body()],
  request: Request,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> Response:
  owner_subject = derive_event_owner(
    auth,
    settings,
    anon_token=request.headers.get(ANON_TOKEN_HEADER),
  )
  # flag off / dev subject / anon owner 부재 / DB 미설정 → skip하고 204 (추천·클라이언트에 영향 없음)
  if (
    not bool(settings.auradin_events_enabled)
    or owner_subject is None
    or db is None
    or not db.is_connected
  ):
    return Response(status_code=204)

  events = [event.model_dump() for event in payload.events]
  accepted = await record_events(events, owner_subject=owner_subject, settings=settings, db=db)
  # 기록 실패도 fail-open — 클라이언트 재시도는 (owner, clientEventId) 멱등이라 안전하다.
  return JSONResponse(status_code=201, content=success({"accepted": accepted}))
