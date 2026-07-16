"""A9 — Auradin 검색 세션 요청 계약 (Stage 0).

`clientRequestId`는 optional로 1차 배포한다(구버전 앱 호환 — rollout: optional 수용 backend
→ 모바일 전송 → 최소 지원 버전 전환 확인 → required 승격 gate). 값이 있는 요청에만
create 멱등 계약이 적용된다.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, TypeAdapter, ValidationError, field_validator, model_validator

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


class SimilarSearchSessionRequest(CamelModel):
  # B6 §10.3-2 — 기준 제품 id + 사용자 의향(색 유지/더 저렴/다른 브랜드, optional).
  # clientRequestId는 재시도 멱등 키 — optional(구버전 앱 호환, create와 같은 rollout gate).
  # 값이 없으면 서버가 (productId, intent) fingerprint로 재전송을 dedup한다.
  productId: str
  intent: str | None = None
  clientRequestId: UUID | None = None


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


# ------------------------------------------------------------------ A5 payload typed 계약 (RFC §3.4)
# 교차 리뷰 A5-1: 최상위 키 allowlist만으로는 중첩 dict로 raw 원문이 우회된다.
# 키별 typed 모델로 재귀 검증하고, 자유 텍스트 문자열 값은 어떤 깊이에서도 fail-closed drop.

# 기계 토큰(slug)만 — 한글·공백·장문 자유 텍스트는 구조적으로 배제된다.
_EVENT_SLUG_RE = r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,63}$"
# scoreSnapshot.components 키 — rankedCache 내부 키는 "_scoreRaw"처럼 언더스코어로 시작할 수 있다.
_COMPONENT_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9._\-]{0,63}$")

EventSlug = Annotated[str, StringConstraints(pattern=_EVENT_SLUG_RE)]
EventDial = Literal["more_similar", "more_diverse"]
EventPlatform = Literal["ios", "android", "web"]
# session_start 진입점 — 서버 기본값 freePrompt + 알려진 클라이언트 진입점 enum.
EventSource = Literal["freePrompt", "home", "report", "deeplink", "push", "similar"]
EventLambda = Annotated[float, Field(ge=0.0, le=1.0)]
EventAppVersion = Annotated[str, StringConstraints(min_length=1, max_length=32, pattern=r"^[0-9A-Za-z][0-9A-Za-z.+_\-]*$")]
EventLocale = Annotated[str, StringConstraints(min_length=2, max_length=20, pattern=r"^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$")]

# retrieval_service._HARD_ATTRIBUTES / validate_filter_delta와 동기 (§3 filterDelta 계약).
FilterDeltaAttribute = Literal[
  "category", "priceKrw", "channel", "priceTier",
  "colorFamily", "finish", "texture", "intensity", "undertone", "occasion",
]
FilterDeltaOp = Literal["noop", "eq", "in", "lt", "lte", "gt", "gte", "between"]


def _finite_number(value: Any) -> float | None:
  """수치만 통과 — bool(True→1.0 강제변환 함정)·문자열·NaN/inf는 None."""
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    return None
  number = float(value)
  return number if number == number and abs(number) != float("inf") else None


class ScoreSnapshotPayload(CamelModel):
  """§16 scoreSnapshot — 수치 성분만 영속화. 문자열·불리언·중첩 구조 성분은 조용히 drop."""

  score: float | None = None
  components: dict[str, float] | None = None

  @field_validator("score", mode="before")
  @classmethod
  def _score_numeric_only(cls, value: Any) -> float | None:
    return _finite_number(value)

  @field_validator("components", mode="before")
  @classmethod
  def _components_numeric_only(cls, value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
      return None
    clean: dict[str, float] = {}
    for key, item in value.items():
      number = _finite_number(item)
      if number is not None and _COMPONENT_KEY_RE.match(str(key)):
        clean[str(key)] = number
    return clean or None


class FilterDeltaPriceRange(CamelModel):
  lowerKrw: int
  upperKrw: int
  lowerInclusive: bool = True
  upperInclusive: bool = True


class FilterDeltaPayload(CamelModel):
  """question_answered filterDelta — attribute/op enum + 값은 slug·수치만.

  displayLabel 등 자유 텍스트 부가 키는 extra="ignore"로 떨어져 나간다.
  """

  attribute: FilterDeltaAttribute | None = None
  op: FilterDeltaOp
  values: list[EventSlug] | None = Field(default=None, max_length=16)
  numberValue: int | None = None
  priceRange: FilterDeltaPriceRange | None = None

  @model_validator(mode="after")
  def _attribute_required_unless_noop(self) -> "FilterDeltaPayload":
    if self.op != "noop" and self.attribute is None:
      raise ValueError("attribute is required unless op is noop")
    return self


# 키별 typed 검증기 — allowlist 정본. 여기 없는 키는 존재 자체가 불가능하다.
_EVENT_PAYLOAD_ADAPTERS: dict[str, TypeAdapter[Any]] = {
  "scoreSnapshot": TypeAdapter(ScoreSnapshotPayload),
  "filterDelta": TypeAdapter(FilterDeltaPayload),
  "dial": TypeAdapter(EventDial),
  "lambda": TypeAdapter(EventLambda),
  "appVersion": TypeAdapter(EventAppVersion),
  "platform": TypeAdapter(EventPlatform),
  "locale": TypeAdapter(EventLocale),
  "consent": TypeAdapter(bool),
  "source": TypeAdapter(EventSource),
}

EVENT_PAYLOAD_ALLOWED_KEYS = frozenset(_EVENT_PAYLOAD_ADAPTERS)


def sanitize_event_payload(payload: Any) -> dict[str, Any] | None:
  """A5 payload fail-closed sanitizer — allowlist 키를 키별 typed 모델로 재귀 검증한다.

  검증 실패 값(한글/장문 자유 텍스트, 비계약 중첩 키 포함)은 422가 아니라 조용한 drop이다
  (fire-and-forget 계약 유지). 요청 스키마(AuradinEventIn)와 DB 삽입 직전
  (event_logger.sanitize_payload)이 같은 함수를 지나므로 raw 원문의 우회 경로가 없다.
  """
  if not isinstance(payload, dict):
    return None
  clean: dict[str, Any] = {}
  for key, adapter in _EVENT_PAYLOAD_ADAPTERS.items():
    value = payload.get(key)
    if value is None:
      continue
    try:
      validated = adapter.validate_python(value)
    except ValidationError:
      continue  # fail-closed — 계약 밖 값은 키째 drop
    if isinstance(validated, BaseModel):
      dumped = validated.model_dump(exclude_none=True)
      if not dumped:
        continue
      clean[key] = dumped
    else:
      clean[key] = validated
  return clean or None


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
  # 수용 시점에 typed allowlist로 무해화한다 — raw query 원문은 어떤 중첩 깊이로도 저장되지 않는다.
  payload: dict[str, Any] | None = None

  @field_validator("payload", mode="before")
  @classmethod
  def _sanitize_payload(cls, value: Any) -> dict[str, Any] | None:
    # 교차 리뷰 A5-1 — 자유 텍스트·비계약 키는 거부(422)가 아니라 fail-closed drop.
    return sanitize_event_payload(value)


class PostSearchEventsRequest(CamelModel):
  events: list[AuradinEventIn] = Field(min_length=1, max_length=50)


class AnonTokenResponse(CamelModel):
  """익명식별 RFC §2.1 — 서버 발급 opaque token 응답.

  서버는 token을 어디에도 저장하지 않는다(stateless) — 이벤트 수신 시
  ``auradin_anon_token_secret`` HMAC으로 ``anon:v1:<digest>`` owner만 만든다.
  """

  token: str = Field(min_length=22)  # base64url 22자 = 128-bit 최소 엔트로피 하한
