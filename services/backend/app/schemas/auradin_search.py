"""A9 — Auradin 검색 세션 요청 계약 (Stage 0).

`clientRequestId`는 optional로 1차 배포한다(구버전 앱 호환 — rollout: optional 수용 backend
→ 모바일 전송 → 최소 지원 버전 전환 확인 → required 승격 gate). 값이 있는 요청에만
create 멱등 계약이 적용된다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class CreateSearchSessionRequest(CamelModel):
  prompt: str
  reportId: str | None = None
  source: str | None = None
  context: dict[str, Any] | None = None
  clientRequestId: UUID | None = None


class AnswerSearchSessionRequest(CamelModel):
  questionId: str
  optionId: str


class RefineSearchSessionRequest(CamelModel):
  prompt: str | None = None
  dial: str | None = None


# A5 (§7.2) — 이벤트 타입 정본 11종. SQL enum과 1:1 (test_auradin_events가 동기화를 검증).
AuradinEventType = Literal[
  "session_start",
  "question_answered",
  "impression",
  "product_open",
  "save",
  "unsave",
  "purchase_click",
  "refine_dial",
  "refine_prompt",
  "hide",
  "unhide",
]


class AuradinEventIn(CamelModel):
  """모바일 fire-and-forget 배치 이벤트 1건 — clientEventId는 재시도 멱등 키(필수)."""

  clientEventId: str = Field(min_length=1, max_length=200)
  eventType: AuradinEventType
  occurredAt: datetime
  schemaVersion: int = 1
  sessionId: str | None = None
  turnId: str | None = None
  resultSetId: str | None = None
  productId: str | None = None
  category: str | None = None
  rank: int | None = None
  role: str | None = None
  matchRate: int | None = None
  # 서버가 allowlist로 다시 거른다 — raw query 원문은 어떤 키로도 저장되지 않는다.
  payload: dict[str, Any] | None = None


class PostSearchEventsRequest(CamelModel):
  events: list[AuradinEventIn] = Field(min_length=1, max_length=50)
