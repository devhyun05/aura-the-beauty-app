"""A9 — Auradin 검색 세션 요청 계약 (Stage 0).

`clientRequestId`는 optional로 1차 배포한다(구버전 앱 호환 — rollout: optional 수용 backend
→ 모바일 전송 → 최소 지원 버전 전환 확인 → required 승격 gate). 값이 있는 요청에만
create 멱등 계약이 적용된다.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

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
