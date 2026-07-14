from __future__ import annotations

import asyncio
import copy
import hashlib
import logging
import time
import uuid
import json
from contextlib import asynccontextmanager
from typing import Any

from app.core.settings import Settings, get_settings
from app.db.session import Database

from .catalog_loader import get_catalog
from .enrichment import enrich_question, enrich_results
from .intent_parser import parse_intent
from .question_engine import propose_question
from .report_profile import personal_color_to_soft_preferences
from .ranking import attribute_similarity, build_slice_result, normalized_brand, price_filter_label
from .retrieval_service import FilterDeltaContractViolation, retrieve_and_rank


logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 15 * 60
MAX_RESULTS = 6
# §7 refine 다이얼 λ 안전 범위 — 0/1 극단은 MMR을 무력화하므로 클램프.
LAMBDA_MIN = 0.05
LAMBDA_MAX = 0.95
REFINE_DIALS = {"more_similar", "more_diverse"}
# B6 §10.3-2 similar 액션 — 기준 제품 시그니처를 임시 soft preference로 한 고정 λ 재랭킹.
# 세션 mmrLambda는 건드리지 않는다(일회성 뷰). 부스트 스케일은 R2 preference 축과 동급.
SIMILAR_INTENTS = {"keep_color", "cheaper", "other_brand"}
SIMILAR_LAMBDA = 0.9
SIMILAR_PREF_WEIGHT = 0.35
_SIMILAR_INTENT_LABELS = {
  "keep_color": "색 유지",
  "cheaper": "더 저렴하게",
  "other_brand": "다른 브랜드",
}
# 종료 상태 — answer/refine을 조용히 무시하고(사용자 이탈/만료 후 늦은 요청), 에러를 노출한다.
INACTIVE_PHASES = {"expired", "cancelled"}
# '글리터'는 카탈로그에 없는 마감 → 아이섀도우·쉬머로 해석했음을 근거에 투명 노출 (§6/§9).
GLITTER_TERMS = ("글리터", "반짝", "스파클", "glitter", "sparkle")

_SESSIONS: dict[str, dict[str, Any]] = {}
_POSTGRES_TABLE_READY = False

# A9 동시성: 단일 워커에서도 asyncio 인터리빙으로 load→수정→save가 경합한다.
# 세션별 Lock으로 mutator(create/answer/refine/cancel/lazy-expiry) 원자 구간을 직렬화하고,
# postgres에는 version CAS를 병행한다. 레지스트리는 세션 제거 시 함께 정리해 누수를 막는다.
_SESSION_LOCKS: dict[str, asyncio.Lock] = {}
# lock을 기다리는 coroutine까지 세어 마지막 사용자가 빠진 뒤에만 registry에서 제거한다.
# 단순 ``if not lock.locked(): pop``은 unlock 직후 대기자가 깨어나기 전에 새 lock을 만들 수 있어
# 동일 세션 mutator 두 개가 동시에 진입하는 ABA 경합을 만든다.
_SESSION_LOCK_USERS: dict[str, int] = {}
# A9 create 멱등성: (ownerSubject, clientRequestId) → reservation/tombstone.
# reservation Future는 동시 create의 single-flight, tombstone은 retention 동안 원 세션 귀속.
_CREATE_RESERVATIONS: dict[tuple[str, str], asyncio.Future] = {}
_IDEMPOTENCY_TOMBSTONES: dict[tuple[str, str], dict[str, Any]] = {}

# answer/refine 판정 결과 (API 상태코드 매핑은 api/search_sessions.py 담당)
ANSWER_ACCEPTED = "accepted"
ANSWER_DUPLICATE = "duplicate"
ANSWER_EXPIRED = "expired"
ANSWER_CONFLICT = "conflict"
ANSWER_STALE = "stale_question"
ANSWER_INVALID_OPTION = "invalid_option"
ANSWER_NOT_ANSWERABLE = "session_not_answerable"
REFINE_ACCEPTED = "accepted"
REFINE_NOT_REFINABLE = "not_refinable"
SIMILAR_ACCEPTED = "accepted"
SIMILAR_NOT_AVAILABLE = "not_similarable"
SIMILAR_UNKNOWN_PRODUCT = "unknown_product"
MUTATION_VERSION_CONFLICT = "version_conflict"
FILTER_DELTA_CONTRACT_VIOLATION = "filter_delta_contract_violation"
CANCEL_ACCEPTED = "cancelled"
CANCEL_ALREADY_CANCELLED = "already_cancelled"
CANCEL_EXPIRED = "expired"


class IdempotencyKeyReuseError(Exception):
  """같은 clientRequestId를 다른 요청 내용(fingerprint)으로 재사용."""


class IdempotentSessionExpiredError(Exception):
  """retention 안의 같은 clientRequestId지만 원 세션이 이미 만료됨 (410)."""


class SessionVersionConflictError(Exception):
  """Lazy-expiry CAS가 계속 경합해 authoritative terminal 전이를 확정하지 못함."""


def _session_lock(session_id: str) -> asyncio.Lock:
  lock = _SESSION_LOCKS.get(session_id)
  if lock is None:
    lock = asyncio.Lock()
    _SESSION_LOCKS[session_id] = lock
  return lock


def _discard_session_lock(session_id: str) -> None:
  lock = _SESSION_LOCKS.get(session_id)
  if lock is not None and not lock.locked() and _SESSION_LOCK_USERS.get(session_id, 0) == 0:
    _SESSION_LOCKS.pop(session_id, None)


@asynccontextmanager
async def _session_guard(session_id: str):
  """세션별 lock의 대기자 수명까지 추적하는 원자 구간."""
  lock = _session_lock(session_id)
  _SESSION_LOCK_USERS[session_id] = _SESSION_LOCK_USERS.get(session_id, 0) + 1
  try:
    async with lock:
      yield
  finally:
    remaining = _SESSION_LOCK_USERS.get(session_id, 1) - 1
    if remaining > 0:
      _SESSION_LOCK_USERS[session_id] = remaining
    else:
      _SESSION_LOCK_USERS.pop(session_id, None)
      _discard_session_lock(session_id)


def _leave_question_phase(state: dict[str, Any]) -> None:
  """질문 phase 이탈(results/failed/expired/cancelled 진입) 시 lastQuestion을 반드시 비운다.

  잔존 lastQuestion은 늦은 재전송이 세션을 되살리는 F13 경로의 뿌리다.
  stale/invalid/conflict 같은 전송 거절은 phase 이탈이 아니므로 이 helper를 쓰지 않는다.
  """
  state["lastQuestion"] = None


def _bump_version(state: dict[str, Any]) -> int:
  previous = int(state.get("version") or 0)
  state["version"] = previous + 1
  return previous


def _expire_if_due(state: dict[str, Any], *, bump_version: bool = True) -> bool:
  """TTL 전이를 한 곳에서 수행한다. 전이 1회당 updatedAt/version도 정확히 한 번 갱신."""
  now = _now()
  if now <= float(state.get("expiresAt") or 0) or state.get("phase") == "expired":
    return False
  state["phase"] = "expired"
  state["error"] = {
    "code": "expired",
    "message": "검색 세션이 만료됐어요. 같은 조건으로 다시 시작해 주세요.",
    "recoverable": True,
  }
  _leave_question_phase(state)
  state["updatedAt"] = now
  if bump_version:
    _bump_version(state)
  return True


def request_fingerprint(
  prompt: str,
  report_id: str | None,
  source: str | None,
  context: dict[str, Any] | None,
) -> str:
  """create 멱등성 fingerprint — 모든 의미 입력의 canonical JSON SHA-256.

  서버가 정규화(trim·기본값 통일·키 정렬)를 담당한다: 같은 의미 입력이면 같은 fingerprint.
  """
  canonical = {
    "schemaVersion": 1,
    "prompt": str(prompt or "").strip(),
    "reportId": str(report_id or "").strip() or None,
    "source": str(source or "").strip() or "freePrompt",
    "context": {str(k): context[k] for k in sorted(context)} if context else {},
  }
  payload = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
  return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _now() -> float:
  return time.time()


def _thinking(phase: str) -> list[dict[str, str]]:
  if phase == "question":
    return [
      {"id": "intent", "label": "조건 정리", "status": "done"},
      {"id": "candidates", "label": "후보 분포 확인", "status": "done"},
      {"id": "question", "label": "가장 많이 갈라지는 질문 선택", "status": "done"},
    ]
  if phase == "results":
    return [
      {"id": "intent", "label": "조건 정리", "status": "done"},
      {"id": "candidates", "label": "후보 좁히기", "status": "done"},
      {"id": "offers", "label": "구매 가능한 카드 확인", "status": "done"},
    ]
  if phase == "failed":
    return [
      {"id": "intent", "label": "조건 정리", "status": "done"},
      {"id": "candidates", "label": "후보 확인", "status": "done"},
      {"id": "recovery", "label": "복구 옵션 준비", "status": "done"},
    ]
  return [
    {"id": "intent", "label": "조건 정리", "status": "done"},
    {"id": "candidates", "label": "후보 좁히는 중", "status": "active"},
    {"id": "offers", "label": "구매 링크 확인", "status": "pending"},
  ]


def _filter_label(filter_delta: dict[str, Any]) -> str:
  # 질문 답변에서 온 delta는 선택지의 한국어 라벨을 그대로 쓴다 —
  # 아니면 finish/priceTier 등 미등록 속성이 "priceTier: under_15k"로 노출된다.
  display_label = str(filter_delta.get("displayLabel") or "").strip()
  if display_label:
    return display_label
  attribute = filter_delta.get("attribute")
  values = filter_delta.get("values") or []
  if attribute == "category" and values:
    return {
      "lip": "립",
      "cheek": "블러셔/치크",
      "shadow": "아이섀도우",
      "base": "베이스",
      "brow": "브로우",
      "liner": "라이너",
    }.get(values[0], values[0])
  if attribute == "priceKrw":
    return price_filter_label(filter_delta)
  if attribute == "channel" and values:
    return "올리브영" if values[0] == "oliveyoung" else "백화점/계열몰"
  return f"{attribute}: {', '.join(values)}"


_REPORT_TONE_LABELS = {"cool": "쿨톤 참고", "warm": "웜톤 참고", "neutral": "뉴트럴 참고"}


def _applied_filters(state: dict[str, Any]) -> list[dict[str, Any]]:
  filters = []
  for filter_delta in state.get("hardFilters", []):
    if filter_delta.get("op") == "noop":
      continue
    applied_filter = {
      "label": _filter_label(filter_delta),
      "source": filter_delta.get("source", "prompt"),
      "confidence": filter_delta.get("confidence"),
    }
    coverage = str(filter_delta.get("coverage") or "").strip()
    if coverage:
      applied_filter["coverage"] = coverage
    coverage_caveat = str(filter_delta.get("coverageCaveat") or "").strip()
    if coverage_caveat:
      applied_filter["coverageCaveat"] = coverage_caveat
    filters.append(applied_filter)
  # §3/§9: 리포트에서 온 undertone 소프트 선호를 "참고" 칩으로 노출 (하드 조건 아님을 source로 구분).
  for preference in state.get("softPreferences", []):
    if preference.get("source") != "report" or str(preference.get("attribute") or "").strip() != "undertone":
      continue
    values = preference.get("values") or []
    tone = str(values[0] or "").strip() if values else ""
    label = _REPORT_TONE_LABELS.get(tone)
    if label:
      filters.append({"label": label, "source": "report", "confidence": preference.get("confidence")})
  return filters


def _unsupported_error(category: str | None) -> dict[str, Any]:
  label = {"nail": "네일", "perfume": "향수", "skincare": "스킨케어", "hair": "헤어"}.get(
    category or "", category or "해당"
  )
  return {
    "code": "unsupported_category",
    "message": f"AURADIN은 지금 립·치크·아이섀도우·베이스·브로우·라이너 색조 메이크업만 다뤄요. {label} 제품은 아직 범위 밖이에요.",
    "recoverable": True,
    "recoveryOptions": [
      {"label": "데일리 립으로 찾기", "prompt": "데일리로 쓸 만한 립 추천해줘"},
      {"label": "커버 좋은 쿠션", "prompt": "커버 잘 되는 쿠션 추천해줘"},
      {"label": "자연스러운 브로우", "prompt": "자연스러운 브로우 펜슬 추천해줘"},
    ],
  }


def _no_results_error(state: dict[str, Any]) -> dict[str, Any]:
  return {
    "code": "no_results",
    "message": "명시한 가격이나 구매처 조건을 지키면 구매 가능한 후보가 충분하지 않아요. 조건을 조용히 풀지 않고 다시 물어볼게요.",
    "recoverable": True,
    "recoveryOptions": [
      {"label": "가격 조건 빼고 다시", "prompt": _canonical_recovery_prompt(state, omit_price=True)},
      {"label": "전체 카테고리에서 보기", "prompt": "데일리로 쓸 만한 제품 추천해줘"},
    ],
  }


def _canonical_recovery_prompt(state: dict[str, Any], *, omit_price: bool) -> str:
  """raw 문자열 치환 없이 현재 canonical state에서 사용자용 복구 질의를 재생성한다."""
  parts: list[str] = []
  for filter_delta in state.get("hardFilters") or state.get("intent", {}).get("lockedFilters", []):
    if filter_delta.get("op") == "noop":
      continue
    if omit_price and filter_delta.get("attribute") == "priceKrw":
      continue
    label = _filter_label(filter_delta).strip()
    if label and label not in parts:
      parts.append(label)
  residual = " ".join(str(state.get("intent", {}).get("positiveResidual") or "").split())
  if residual and residual not in parts:
    parts.append(residual)
  for entry in state.get("refineResiduals") or []:
    text = " ".join(str(entry.get("text") or "").split()) if isinstance(entry, dict) else ""
    if text and text not in parts:
      parts.append(text)
  return " ".join(parts).strip() or "데일리로 쓸 만한 제품 추천해줘"


def _contract_violation_hash(state: dict[str, Any], error: Exception) -> str:
  payload = {
    "answerDeltas": [answer.get("filterDelta") for answer in state.get("answers", [])],
    "intentHard": state.get("intent", {}).get("lockedFilters", []),
    "intentSoft": state.get("intent", {}).get("softPreferences", []),
    "refineHard": state.get("refineHardFilters", []),
    "refineSoft": state.get("refineSoftPreferences", []),
    "errorType": type(error).__name__,
  }
  canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
  return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _log_contract_violation(state: dict[str, Any], error: FilterDeltaContractViolation) -> None:
  logger.error(
    "[aura:auradin-session] filter delta contract violation session=%s deltaHash=%s",
    state.get("sessionId"),
    _contract_violation_hash(state, error),
  )


def _interpretation_caveats(state: dict[str, Any]) -> list[str] | None:
  prompt = str(state.get("prompt") or "").lower()
  if any(term.lower() in prompt for term in GLITTER_TERMS):
    return ["'글리터'는 카탈로그 기준 아이섀도우·쉬머 계열로 해석했어요"]
  return None


def _session_lambda(state: dict[str, Any], settings: Settings) -> float:
  # §7: refine 다이얼이 세션별 λ를 누적 조절 — 없으면 settings 기본값.
  value = state.get("mmrLambda")
  if value is None:
    return float(settings.auradin_mmr_lambda)
  return float(value)


def _ranked_cache(ranked: list[dict[str, Any]]) -> list[dict[str, Any]]:
  # §7 dial refine이 재검색 없이 재랭킹하도록 점수·성분만 담는 컴팩트 캐시 (item은 카탈로그 join).
  return [
    {
      "id": row["item"]["id"],
      "score": row["score"],
      "components": row.get("components") or {},
      "matchedLabels": row.get("matchedLabels") or [],
    }
    for row in ranked
  ]


def _ranked_from_cache(state: dict[str, Any]) -> list[dict[str, Any]]:
  catalog = get_catalog()
  rows: list[dict[str, Any]] = []
  for cached in state.get("rankedCache") or []:
    item = catalog.get(str(cached.get("id") or ""))
    if item:
      rows.append(
        {
          "item": item,
          "score": cached.get("score"),
          "components": cached.get("components") or {},
          "matchedLabels": cached.get("matchedLabels") or [],
        },
      )
  return rows


def _build_result(
  state: dict[str, Any],
  ranked: list[dict[str, Any]],
  settings: Settings,
  *,
  lambda_override: float | None = None,
  extra_caveats: list[str] | None = None,
) -> dict[str, Any]:
  # §5/§6: floor → MMR → 3역할 → 구조화 근거. 단일 shape = Top3 (§4). 세트/비교는 이후 단계.
  # lambda_override는 B6 similar의 일회성 λ=0.9 — 세션 mmrLambda 누적과 분리한다.
  merged_caveats = [*(_interpretation_caveats(state) or []), *(extra_caveats or [])]
  slice_result = build_slice_result(
    ranked,
    lambda_=lambda_override if lambda_override is not None else _session_lambda(state, settings),
    s_floor=float(settings.auradin_floor_semantic),
    hard_filters=state.get("hardFilters", []),
    extra_caveats=merged_caveats or None,
    top_n=3,
  )
  products = [
    product
    for product in slice_result["products"]
    if product.get("imageUrl") and product.get("purchaseUrl") and int(product.get("priceKrw") or 0) > 0
  ]
  return {
    "headerLabel": "답변 기준으로 후보를 좁혔어요" if state.get("answers") else "조건에 가까운 제품을 골랐어요",
    "contextSummary": "현재 립·치크·아이섀도우·베이스·브로우·라이너 구매 가능 상품을 검색해요.",
    "products": products,
    "diagnostics": {
      "rankedCount": slice_result["rankedCount"],
      "floorCount": slice_result["floorCount"],
      "topScoreGap": slice_result["topScoreGap"],
      "lambda": slice_result["lambda"],
    },
    "logs": state.get("logs", []),
  }


def _last_answer_was_noop(state: dict[str, Any]) -> bool:
  answers = state.get("answers", [])
  if not answers:
    return False
  return answers[-1].get("filterDelta", {}).get("op") == "noop"


def _advance(
  state: dict[str, Any],
  *,
  answer_delta: dict[str, Any] | None = None,
  settings: Settings | None = None,
) -> None:
  settings = settings or get_settings()
  intent = state["intent"]
  if intent.get("unsupportedCategory"):
    state["phase"] = "failed"
    state["error"] = _unsupported_error(intent.get("unsupportedCategory"))
    _leave_question_phase(state)
    state["updatedAt"] = _now()
    return

  catalog = get_catalog()
  retrieval = retrieve_and_rank(
    catalog,
    intent,
    state.get("answers", []),
    settings=settings,
    extra_hard_filters=state.get("refineHardFilters") or [],
    extra_soft_preferences=state.get("refineSoftPreferences") or [],
    extra_query_text=[
      str(entry.get("text") or "")
      for entry in state.get("refineResiduals") or []
      if isinstance(entry, dict)
    ],
  )
  ranked = retrieval["ranked"]
  state["hardFilters"] = retrieval["hardFilters"]
  state["softPreferences"] = retrieval["softPreferences"]
  state["currentCandidateIds"] = [row["item"]["id"] for row in ranked]
  state["rankedCandidateIds"] = [row["item"]["id"] for row in ranked]
  state["rankedCache"] = _ranked_cache(ranked)

  if answer_delta and state.get("logs"):
    state["logs"][-1]["answer"] = answer_delta
    state["logs"][-1]["candidateCountAfter"] = len(ranked)
    state["logs"][-1]["topScoresAfter"] = [round(float(row["score"]), 6) for row in ranked[:3]]
    state["logs"][-1]["retrievalBackendAfter"] = retrieval.get("retrievalBackend")
    state["logs"][-1]["retrievalStatusAfter"] = retrieval.get("retrievalStatus")
    state["logs"][-1]["retrievalDegradedReasonAfter"] = retrieval.get("retrievalDegradedReason")

  if not ranked:
    state["phase"] = "failed"
    state["error"] = _no_results_error(state)
    _leave_question_phase(state)
    state["updatedAt"] = _now()
    return

  question, decision_log = propose_question(
    ranked,
    asked_attributes=state.get("askedAttributes", []),
    intent=intent,
    question_count=int(state.get("questionCount") or 0),
    last_answer_was_noop=_last_answer_was_noop(state),
    score_gap_threshold=float(settings.auradin_score_gap_threshold),
  )
  state["logs"].append(decision_log)
  state["logs"][-1]["retrievalBackend"] = retrieval.get("retrievalBackend")
  state["logs"][-1]["retrievalStatus"] = retrieval.get("retrievalStatus")
  state["logs"][-1]["retrievalDegradedReason"] = retrieval.get("retrievalDegradedReason")

  if question:
    state["phase"] = "question"
    state["lastQuestion"] = question
    state["askedAttributes"].append(question["attribute"])
    state["updatedAt"] = _now()
    return

  result = _build_result(state, ranked, settings)
  if not result["products"]:
    state["phase"] = "failed"
    state["error"] = _no_results_error(state)
  else:
    state["phase"] = "results"
    state["result"] = result
  _leave_question_phase(state)
  state["updatedAt"] = _now()


def create_session(
  *,
  prompt: str,
  owner_subject: str,
  report_id: str | None = None,
  source: str | None = None,
  context: dict[str, Any] | None = None,
  report_context: dict[str, Any] | None = None,
  settings: Settings | None = None,
) -> dict[str, Any]:
  settings = settings or get_settings()
  owner_subject = owner_subject.strip()
  if not owner_subject:
    raise ValueError("owner_subject is required")
  session_id = f"auradin-{uuid.uuid4().hex[:16]}"
  now = _now()
  intent = parse_intent(prompt, report_id=report_id, source=source, context=context)
  # §3: 얼굴분석 리포트 → undertone 소프트 선호 병합 (§9: soft만, hard 금지).
  # report_context.personalColor(client-relay) 또는 API가 로드한 리포트에서 온다.
  personal_color = str((report_context or {}).get("personalColor") or "").strip()
  if personal_color:
    report_prefs = personal_color_to_soft_preferences(personal_color)
    if report_prefs:
      # 리포트 선호는 재랭킹에만 참여한다 — requiresQuestion 등 질문 동작은 프롬프트가
      # 정한 그대로 둔다. 구체 프롬프트에 리포트를 얹었다고 질문을 강제하면 안 됨.
      intent["softPreferences"] = [*intent.get("softPreferences", []), *report_prefs]
  state = {
    "sessionId": session_id,
    "ownerSubject": owner_subject,
    "phase": "searching",
    "prompt": prompt,
    "context": {
      "reportId": report_id,
      "source": source or "freePrompt",
      "personalColor": personal_color or None,
      **(context or {}),
    },
    "intent": intent,
    "answers": [],
    "askedAttributes": [],
    "questionCount": 0,
    "currentCandidateIds": [],
    "rankedCandidateIds": [],
    "refineResiduals": [],
    "logs": [],
    "createdAt": now,
    "updatedAt": now,
    "expiresAt": now + max(60, int(settings.auradin_session_ttl_seconds or SESSION_TTL_SECONDS)),
    "version": 0,
  }
  _SESSIONS[session_id] = state
  try:
    _advance(state, settings=settings)
  except FilterDeltaContractViolation as error:
    # 내부 생성 계약 오류는 broad fallback하지 않는다. 세션은 failed로 고정하고 API에는
    # 예외를 전파해 500으로 드러낸다(사용자 입력 오류 4xx로 오인 금지).
    state["phase"] = "failed"
    state["error"] = {
      "code": "filter_delta_contract_violation",
      "message": "검색 조건 처리 계약을 확인해야 해요.",
      "recoverable": False,
    }
    _leave_question_phase(state)
    state["updatedAt"] = _now()
    _log_contract_violation(state, error)
    # Direct callers can inspect the failed state; the persisted create boundary
    # reads this attribute and removes it because its API response exposes no id.
    error.session_state = state
    raise
  return state


def get_session(session_id: str, *, owner_subject: str) -> dict[str, Any] | None:
  state = _SESSIONS.get(session_id)
  if not state or state.get("ownerSubject") != owner_subject:
    return None
  if _expire_if_due(state):
    _discard_session_lock(session_id)
  return state


def answer_session_judged(
  session_id: str,
  *,
  owner_subject: str,
  question_id: str,
  option_id: str,
  settings: Settings | None = None,
) -> tuple[str, dict[str, Any] | None]:
  """A9 answer 판정 — 만료 → 중복 → 충돌 → stale → 옵션 유효성 → phase 순서 (계획 Stage 0-2).

  중복 검사가 phase 검사보다 먼저다: 다음 질문·results로 넘어간 뒤 도착한 늦은 재전송도
  duplicate(no-op)여야 한다. 거절 판정(conflict/stale/invalid/not_answerable)은 세션을
  파괴하지 않고 state/version/lastQuestion을 바꾸지 않는다 — 의도된 계약 변경(구현은
  failed 전이였음). 전송 오류는 state에 저장하지 않는다.
  """
  settings = settings or get_settings()
  state = get_session(session_id, owner_subject=owner_subject)
  if not state:
    return ANSWER_NOT_ANSWERABLE, None
  # ① 만료 — get_session이 lazy 전이를 이미 수행. 이후 재전송도 expired로 고정.
  if state.get("phase") == "expired":
    return ANSWER_EXPIRED, state
  if state.get("phase") == "cancelled":
    return ANSWER_NOT_ANSWERABLE, state

  # ② 동일 (questionId, optionId) 기처리 = 멱등 재시도 (전 phase에서 no-op)
  answered = [a for a in state.get("answers", []) if a.get("questionId") == question_id]
  if any(a.get("optionId") == option_id for a in answered):
    return ANSWER_DUPLICATE, state
  # ③ 기처리 동일 questionId·상이 optionId = 클라이언트 충돌
  if answered:
    return ANSWER_CONFLICT, state

  # ⑥(선행 배치) 신규 답변은 question phase에서만
  if state.get("phase") != "question":
    return ANSWER_NOT_ANSWERABLE, state
  question = state.get("lastQuestion") if isinstance(state.get("lastQuestion"), dict) else None
  # ④ 활성 질문과 다른 questionId = stale
  if not question or question.get("id") != question_id:
    return ANSWER_STALE, state
  # ⑤ 옵션 유효성
  option = next((option for option in question.get("options", []) if option.get("id") == option_id), None)
  if not option:
    return ANSWER_INVALID_OPTION, state

  mutation_snapshot = copy.deepcopy(state)
  filter_delta = dict(option.get("filterDelta") or {})
  option_label = str(option.get("label") or "").strip()
  if option_label and filter_delta.get("op") != "noop":
    filter_delta.setdefault("displayLabel", option_label)
  state["answers"].append(
    {
      "questionId": question_id,
      "optionId": option_id,
      "label": option.get("label"),
      "filterDelta": filter_delta,
    },
  )
  state["questionCount"] = int(state.get("questionCount") or 0) + 1
  state["phase"] = "searching"
  try:
    _advance(
      state,
      answer_delta={
        "questionId": question_id,
        "optionId": option_id,
        "filterDelta": filter_delta,
      },
      settings=settings,
    )
  except FilterDeltaContractViolation as error:
    _log_contract_violation(state, error)
    state.clear()
    state.update(mutation_snapshot)
    return FILTER_DELTA_CONTRACT_VIOLATION, state
  return ANSWER_ACCEPTED, state


def answer_session(
  session_id: str,
  *,
  owner_subject: str,
  question_id: str,
  option_id: str,
  settings: Settings | None = None,
) -> dict[str, Any] | None:
  """하위 호환 래퍼 — 판정 outcome이 필요 없는 호출부(기존 테스트·프로브)용."""
  _, state = answer_session_judged(
    session_id,
    owner_subject=owner_subject,
    question_id=question_id,
    option_id=option_id,
    settings=settings,
  )
  return state


def _refine_header(prompt: str, dial: str | None, *, lambda_moved: bool = True) -> str:
  if prompt:
    return "추가 조건을 반영해 다시 골랐어요"
  # §7 정직화: λ가 클램프 포화로 안 움직였으면 "다시 정렬했어요"는 거짓 — 사실대로 알린다.
  if not lambda_moved:
    return "이미 가장 비슷한 순서예요" if dial == "more_similar" else "이미 가장 다양한 순서예요"
  if dial == "more_similar":
    return "1위와 더 비슷한 결로 다시 정렬했어요"
  return "더 다양한 결로 다시 정렬했어요"


def _refine_saturation_notice(dial: str | None) -> dict[str, Any]:
  # dial이 λ 범위 끝에 닿아 순서가 그대로일 때 — 모바일이 토스트/배너로 구분 렌더.
  axis = "비슷한" if dial == "more_similar" else "다양한"
  return {
    "kind": "dial_saturated",
    "dial": dial,
    "message": f"이미 가장 {axis} 순서로 정렬돼 있어요.",
  }


def _refine_recovery(state: dict[str, Any], prompt: str) -> dict[str, Any]:
  # §7: 후보 0이어도 조용히 완화 금지 — 이전 결과 유지 + 복구 옵션 제시.
  return {
    "kind": "recovery",
    "message": "요청한 조건을 지키면 보여줄 후보가 없어요. 조건을 조용히 풀지 않고 이전 결과를 유지할게요.",
    "rejectedPrompt": prompt or None,
    "recoveryOptions": [
      {"label": "조건 없이 다시 검색", "prompt": state.get("prompt", "")},
      {"label": "가격 조건 빼고 다시", "prompt": _canonical_recovery_prompt(state, omit_price=True)},
    ],
  }


def refine_session(
  session_id: str,
  *,
  owner_subject: str,
  prompt: str | None = None,
  dial: str | None = None,
  settings: Settings | None = None,
) -> dict[str, Any] | None:
  """§7 refine — dial은 캐시된 후보를 λ만 바꿔 재랭킹(재검색 X), prompt는 §3 파서로 hard/soft 병합.

  같은 attribute는 refine-출처 필터끼리만 교체한다. 원 프롬프트/질문 답변 출처는 불변(§9).
  후보 0이면 이전 결과를 유지하고 recoveryOptions를 싣는다 — 조용한 완화 금지.
  """
  settings = settings or get_settings()
  state = get_session(session_id, owner_subject=owner_subject)
  if not state or state.get("phase") in INACTIVE_PHASES:
    return state

  # A9 refine 가드 — 질문 단계 refine의 퍼널 스킵(F13) 차단. 거절은 state 불변, 로그는 logger로만.
  if state.get("phase") != "results":
    logger.info(
      "[aura:auradin-session] refine rejected session=%s phase=%s", session_id, state.get("phase"),
    )
    return state

  prompt = str(prompt or "").strip()
  dial = str(dial or "").strip() or None
  snapshot = copy.deepcopy(state)

  lambda_moved = True
  if dial in REFINE_DIALS:
    step = float(settings.auradin_refine_lambda_step)
    current = round(_session_lambda(state, settings), 4)
    adjusted = current + (step if dial == "more_similar" else -step)
    new_lambda = round(min(LAMBDA_MAX, max(LAMBDA_MIN, adjusted)), 4)
    lambda_moved = new_lambda != current  # 클램프 포화면 순서가 그대로 → no-op
    state["mmrLambda"] = new_lambda

  used_cache = False
  retrieval: dict[str, Any] | None = None
  if prompt:
    parsed = parse_intent(prompt)
    refined_hard = [{**f, "source": "refine"} for f in parsed["lockedFilters"]]
    refined_soft = [{**p, "source": "refine"} for p in parsed["softPreferences"]]
    hard_attrs = {f.get("attribute") for f in refined_hard}
    soft_attrs = {p.get("attribute") for p in refined_soft}
    state["refineHardFilters"] = [
      f for f in state.get("refineHardFilters") or [] if f.get("attribute") not in hard_attrs
    ] + refined_hard
    state["refineSoftPreferences"] = [
      p for p in state.get("refineSoftPreferences") or [] if p.get("attribute") not in soft_attrs
    ] + refined_soft
    residual = " ".join(str(parsed.get("positiveResidual") or "").split())
    residuals = state.setdefault("refineResiduals", [])
    existing_residuals = {
      " ".join(str(entry.get("text") or "").split())
      for entry in residuals
      if isinstance(entry, dict)
    }
    if residual and residual not in existing_residuals:
      residuals.append(
        {
          "sequence": max(
            (int(entry.get("sequence") or 0) for entry in residuals if isinstance(entry, dict)),
            default=0,
          ) + 1,
          "source": "refine",
          "text": residual,
        },
      )
    state["refinePrompt"] = prompt

    retrieval = retrieve_and_rank(
      get_catalog(),
      state["intent"],
      state.get("answers", []),
      settings=settings,
      extra_hard_filters=state["refineHardFilters"],
      extra_soft_preferences=state["refineSoftPreferences"],
      extra_query_text=[
        str(entry.get("text") or "")
        for entry in state.get("refineResiduals") or []
        if isinstance(entry, dict)
      ],
    )
    ranked = retrieval["ranked"]
    state["hardFilters"] = retrieval["hardFilters"]
    state["softPreferences"] = retrieval["softPreferences"]
  else:
    ranked = _ranked_from_cache(state)
    used_cache = bool(ranked)
    if not used_cache:
      # 캐시 소실(프로세스 재시작 등) → 동일 조건 재랭킹 폴백. 조건은 그대로라 완화 아님.
      retrieval = retrieve_and_rank(
        get_catalog(),
        state["intent"],
        state.get("answers", []),
        settings=settings,
        extra_hard_filters=state.get("refineHardFilters") or [],
        extra_soft_preferences=state.get("refineSoftPreferences") or [],
        extra_query_text=[
          str(entry.get("text") or "")
          for entry in state.get("refineResiduals") or []
          if isinstance(entry, dict)
        ],
      )
      ranked = retrieval["ranked"]

  state.setdefault("logs", []).append(
    {
      "refine": {
        "dial": dial,
        "prompt": prompt or None,
        "lambda": _session_lambda(state, settings),
        "lambdaMoved": lambda_moved,
        "usedCache": used_cache,
        "candidateCount": len(ranked),
        "retrievalBackend": retrieval.get("retrievalBackend") if retrieval else "ranked_cache",
        "retrievalStatus": retrieval.get("retrievalStatus") if retrieval else "cached",
        "retrievalDegradedReason": retrieval.get("retrievalDegradedReason") if retrieval else None,
      },
    },
  )

  result = _build_result(state, ranked, settings) if ranked else None
  if not result or not result["products"]:
    # 실패한 refine은 residual·provenance·cache·logs까지 전체 원복한다.
    state.clear()
    state.update(copy.deepcopy(snapshot))
    if snapshot.get("result"):
      state["result"] = {**snapshot["result"], "refineNotice": _refine_recovery(state, prompt)}
      state["phase"] = "results"
    state["updatedAt"] = _now()
    return state

  result["headerLabel"] = _refine_header(prompt, dial, lambda_moved=lambda_moved)
  if dial and not prompt and not lambda_moved:
    result["refineNotice"] = _refine_saturation_notice(dial)
  state["rankedCache"] = _ranked_cache(ranked)
  state["currentCandidateIds"] = [row["item"]["id"] for row in ranked]
  state["rankedCandidateIds"] = [row["item"]["id"] for row in ranked]
  state["result"] = result
  state["phase"] = "results"
  state["lastQuestion"] = None
  state["updatedAt"] = _now()
  return state


def _similar_recovery(intent: str | None) -> dict[str, Any]:
  # §9: 비슷한 후보가 없으면 조용한 완화 금지 — 이전 결과 유지 + 정직한 고지.
  messages = {
    "cheaper": "이 제품보다 저렴한 비슷한 후보가 지금 후보 중엔 없어요. 이전 결과를 유지할게요.",
    "other_brand": "다른 브랜드의 비슷한 후보가 지금 후보 중엔 없어요. 이전 결과를 유지할게요.",
    "keep_color": "같은 색 계열의 비슷한 후보가 지금 후보 중엔 없어요. 이전 결과를 유지할게요.",
  }
  return {
    "kind": "similar_no_match",
    "intent": intent,
    "message": messages.get(intent or "", "비슷한 후보를 더 찾지 못했어요. 이전 결과를 유지할게요."),
  }


def similar_session(
  session_id: str,
  *,
  owner_subject: str,
  product_id: str,
  intent: str | None = None,
  settings: Settings | None = None,
) -> dict[str, Any] | None:
  """B6 §10.3-2 similar — 기준 제품 속성 시그니처를 임시 soft preference로 한 λ=0.9 재랭킹.

  신규 검색이 아니라 현행 rankedCache 내 재랭킹(재검색 0, refine 인프라 재사용).
  세션의 mmrLambda·필터·rankedCache는 불변 — 같은 후보셋의 일회성 정렬 뷰다.
  의향(색 유지/더 저렴/다른 브랜드)은 캐시 내 필터로 반영하고, 결과 0이면
  이전 결과를 유지하며 notice로 고지한다(조용한 완화 금지 §9).
  """
  settings = settings or get_settings()
  state = get_session(session_id, owner_subject=owner_subject)
  if not state or state.get("phase") in INACTIVE_PHASES:
    return state
  if state.get("phase") != "results":
    logger.info(
      "[aura:auradin-session] similar rejected session=%s phase=%s", session_id, state.get("phase"),
    )
    return state

  product_id = str(product_id or "").strip()
  intent = str(intent or "").strip() or None
  base_item = get_catalog().get(product_id)
  if not base_item:
    return state  # judged wrapper가 SIMILAR_UNKNOWN_PRODUCT로 판정 — 방어적 no-op

  snapshot = copy.deepcopy(state)

  ranked = _ranked_from_cache(state)
  used_cache = bool(ranked)
  if not ranked:
    # 캐시 소실(프로세스 재시작 등) → 동일 조건 재랭킹 폴백. 조건은 그대로라 완화 아님.
    retrieval = retrieve_and_rank(
      get_catalog(),
      state["intent"],
      state.get("answers", []),
      settings=settings,
      extra_hard_filters=state.get("refineHardFilters") or [],
      extra_soft_preferences=state.get("refineSoftPreferences") or [],
      extra_query_text=[
        str(entry.get("text") or "")
        for entry in state.get("refineResiduals") or []
        if isinstance(entry, dict)
      ],
    )
    ranked = retrieval["ranked"]

  base_brand = normalized_brand(base_item.get("brandName"))
  base_price = int((base_item.get("liveOffer") or {}).get("priceKrw") or 0)
  base_color = str((base_item.get("attributes") or {}).get("colorFamily") or "").strip()

  # 기준 제품 자신은 후보에서 제외 — '이 제품과 비슷한 다른 것'이 계약이다.
  candidates = [row for row in ranked if str(row["item"].get("id") or "") != product_id]
  extra_caveats: list[str] = []
  if intent == "cheaper" and base_price > 0:
    candidates = [
      row
      for row in candidates
      if 0 < int((row["item"].get("liveOffer") or {}).get("priceKrw") or 0) < base_price
    ]
  elif intent == "other_brand" and base_brand:
    candidates = [
      row for row in candidates if normalized_brand(row["item"].get("brandName")) != base_brand
    ]
  elif intent == "keep_color":
    if base_color:
      candidates = [
        row
        for row in candidates
        if str((row["item"].get("attributes") or {}).get("colorFamily") or "").strip() == base_color
      ]
    else:
      # §9 정직성: 기준 제품에 색 정보가 없으면 '색 유지'는 보장 불가 — 숨기지 않고 고지.
      extra_caveats.append("기준 제품의 색 정보가 없어 색 유지는 참고로만 반영했어요")

  # 기준 제품 시그니처 유사도(§10.3-3 확장분 포함)를 임시 부스트로 relevance에 가산.
  # 원본 score·components는 rankedCache에 그대로 남는다 — 이 부스트는 저장하지 않는다.
  boosted = [
    {
      **row,
      "_scoreRaw": float(row.get("score") or 0.0)
      + SIMILAR_PREF_WEIGHT * attribute_similarity(base_item, row["item"]),
      "components": {
        **(row.get("components") or {}),
        "similarToBase": round(attribute_similarity(base_item, row["item"]), 6),
      },
    }
    for row in candidates
  ]
  boosted.sort(key=lambda row: float(row["_scoreRaw"]), reverse=True)

  state.setdefault("logs", []).append(
    {
      "similar": {
        "productId": product_id,
        "intent": intent,
        "lambda": SIMILAR_LAMBDA,
        "usedCache": used_cache,
        "candidateCount": len(boosted),
      },
    },
  )

  result = (
    _build_result(
      state,
      boosted,
      settings,
      lambda_override=SIMILAR_LAMBDA,
      extra_caveats=extra_caveats,
    )
    if boosted
    else None
  )
  if not result or not result["products"]:
    # 후보 0 — refine과 같은 계약: 상태 전체 원복 + 이전 결과 유지 + notice.
    state.clear()
    state.update(copy.deepcopy(snapshot))
    if snapshot.get("result"):
      state["result"] = {**snapshot["result"], "refineNotice": _similar_recovery(intent)}
      state["phase"] = "results"
    state["updatedAt"] = _now()
    return state

  base_name = " ".join(
    part
    for part in [
      str(base_item.get("brandName") or "").strip(),
      str(base_item.get("productName") or "").strip(),
    ]
    if part
  )
  intent_label = _SIMILAR_INTENT_LABELS.get(intent or "")
  result["headerLabel"] = f"'{base_name}'와 비슷한 결로 다시 골랐어요" + (
    f" · {intent_label}" if intent_label else ""
  )
  state["result"] = result
  state["phase"] = "results"
  state["lastQuestion"] = None
  state["updatedAt"] = _now()
  return state


def to_search_turn(state: dict[str, Any]) -> dict[str, Any]:
  phase = state.get("phase", "failed")
  return {
    "sessionId": state.get("sessionId"),
    "phase": phase,
    "thinking": _thinking(phase),
    "contextSummary": state.get("result", {}).get("contextSummary") or "립·치크·아이섀도우·베이스·브로우·라이너 catalog 기준",
    "appliedFilters": _applied_filters(state),
    "question": state.get("lastQuestion") if phase == "question" else None,
    "result": state.get("result") if phase == "results" else None,
    "error": state.get("error") if phase in {"failed", "expired", "cancelled"} else None,
    "retryAfterMs": 350 if phase == "searching" else None,
    "logs": state.get("logs", []),
  }


def refine_session_judged(
  session_id: str,
  *,
  owner_subject: str,
  prompt: str | None = None,
  dial: str | None = None,
  settings: Settings | None = None,
) -> tuple[str, dict[str, Any] | None]:
  state = get_session(session_id, owner_subject=owner_subject)
  if not state:
    return REFINE_NOT_REFINABLE, None
  if state.get("phase") in INACTIVE_PHASES or state.get("phase") != "results":
    return REFINE_NOT_REFINABLE, state
  mutation_snapshot = copy.deepcopy(state)
  try:
    return REFINE_ACCEPTED, refine_session(
      session_id, owner_subject=owner_subject, prompt=prompt, dial=dial, settings=settings,
    )
  except FilterDeltaContractViolation as error:
    _log_contract_violation(state, error)
    state.clear()
    state.update(mutation_snapshot)
    return FILTER_DELTA_CONTRACT_VIOLATION, state


def similar_session_judged(
  session_id: str,
  *,
  owner_subject: str,
  product_id: str,
  intent: str | None = None,
  settings: Settings | None = None,
) -> tuple[str, dict[str, Any] | None]:
  state = get_session(session_id, owner_subject=owner_subject)
  if not state:
    return SIMILAR_NOT_AVAILABLE, None
  # B6 phase 가드 — refine과 동일한 M1 계약: results에서만 (질문 단계 퍼널 스킵 차단).
  if state.get("phase") in INACTIVE_PHASES or state.get("phase") != "results":
    return SIMILAR_NOT_AVAILABLE, state
  if not get_catalog().get(str(product_id or "").strip()):
    # 라이브 발견 픽 등 카탈로그 밖 제품 — rankedCache 재랭킹 계약 밖이라 비파괴 거절.
    return SIMILAR_UNKNOWN_PRODUCT, state
  mutation_snapshot = copy.deepcopy(state)
  try:
    return SIMILAR_ACCEPTED, similar_session(
      session_id,
      owner_subject=owner_subject,
      product_id=product_id,
      intent=intent,
      settings=settings,
    )
  except FilterDeltaContractViolation as error:
    _log_contract_violation(state, error)
    state.clear()
    state.update(mutation_snapshot)
    return FILTER_DELTA_CONTRACT_VIOLATION, state


def clear_sessions() -> None:
  _SESSIONS.clear()
  _SESSION_LOCKS.clear()
  _SESSION_LOCK_USERS.clear()
  _CREATE_RESERVATIONS.clear()
  _IDEMPOTENCY_TOMBSTONES.clear()


def cancel_session(session_id: str, *, owner_subject: str) -> dict[str, Any] | None:
  """§ 사용자가 검색 도중 이탈 → 세션을 종료 상태로 표시한다.

  enrich는 요청 내에서 await되므로 취소가 태스크를 죽이는 게 아니라, 세션을 'cancelled'로
  전이시켜 이후 answer/refine을 조용히 무시(INACTIVE_PHASES)하고 늦은 poll에 명시적 상태를
  돌려준다. expired와 같은 lazy-mark 패턴 — 행은 TTL로 정리된다.
  """
  state = _SESSIONS.get(session_id)
  if not state or state.get("ownerSubject") != owner_subject:
    return None
  if state.get("phase") not in INACTIVE_PHASES:
    state["phase"] = "cancelled"
    state["error"] = {
      "code": "cancelled",
      "message": "검색을 중단했어요. 언제든 다시 시작할 수 있어요.",
      "recoverable": True,
    }
    _leave_question_phase(state)
    state["updatedAt"] = _now()
  _discard_session_lock(session_id)
  return state


async def _enrich_if_results(state: dict[str, Any] | None, settings: Settings) -> None:
  # §11 6/7단계: 랭킹(동기·순수) 뒤 비동기 enrich — 라이브 Naver 발견 + reasonCopy (가산).
  if state and state.get("phase") == "results":
    await enrich_results(state, settings=settings, extra_caveats=_interpretation_caveats(state))


async def _enrich_if_question(state: dict[str, Any] | None, settings: Settings) -> None:
  # §11 3-2단계: 되묻기 질문의 표시 텍스트를 실시간 LLM으로 다듬는다 — 구조(id/filterDelta)는 불변(§9).
  # to_search_turn이 phase=="question"일 때 state["lastQuestion"]를 그대로 서빙하므로 in-place 재작성이면 충분.
  if state and state.get("phase") == "question":
    await enrich_question(state, settings=settings)


def _postgres_enabled(settings: Settings, db: Database | None) -> bool:
  return bool(settings.auradin_session_store == "postgres" and db and db.is_connected)


async def ensure_postgres_session_table(db: Database) -> None:
  global _POSTGRES_TABLE_READY
  if _POSTGRES_TABLE_READY:
    return

  await db.execute(
    """
    create table if not exists auradin_search_sessions (
      session_id text primary key,
      state jsonb not null,
      expires_at timestamptz not null,
      updated_at timestamptz not null,
      owner_subject text,
      version integer not null default 0,
      client_request_id text,
      request_fingerprint text,
      idempotency_expires_at timestamptz
    )
    """,
  )
  await db.execute(
    """
    create index if not exists idx_auradin_search_sessions_expires_at
      on auradin_search_sessions (expires_at)
    """,
  )
  # A9 v2 — runtime ensure는 신규 설치 안전망일 뿐, 기존 설치의 정식 경로는
  # init_db의 "schema.sql:auradin-sessions-v2" 마이그레이션이다.
  for statement in (
    "alter table auradin_search_sessions add column if not exists owner_subject text",
    "alter table auradin_search_sessions add column if not exists version integer not null default 0",
    "alter table auradin_search_sessions add column if not exists client_request_id text",
    "alter table auradin_search_sessions add column if not exists request_fingerprint text",
    "alter table auradin_search_sessions add column if not exists idempotency_expires_at timestamptz",
    "update auradin_search_sessions set owner_subject = state->>'ownerSubject' where owner_subject is null",
    "update auradin_search_sessions set version = 0 where version is null",
    "alter table auradin_search_sessions alter column owner_subject set not null",
    "alter table auradin_search_sessions alter column version set not null",
    "alter table auradin_search_sessions alter column version set default 0",
    """
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'chk_auradin_sessions_idempotency_fields'
          and conrelid = 'public.auradin_search_sessions'::regclass
      ) then
        alter table auradin_search_sessions
          add constraint chk_auradin_sessions_idempotency_fields
          check (
            ((client_request_id is null) = (request_fingerprint is null))
            and ((client_request_id is null) = (idempotency_expires_at is null))
          );
      end if;
    end $$
    """,
    """
    create unique index if not exists uq_auradin_sessions_owner_client_request
      on auradin_search_sessions (owner_subject, client_request_id)
      where client_request_id is not null
    """,
    """
    create index if not exists idx_auradin_sessions_idempotency_expires
      on auradin_search_sessions (idempotency_expires_at)
      where idempotency_expires_at is not null
    """,
  ):
    await db.execute(statement)
  _POSTGRES_TABLE_READY = True


def _session_row_args(state: dict[str, Any]) -> tuple[Any, ...]:
  return (
    state["sessionId"],
    json.dumps(state, ensure_ascii=False),
    float(state.get("expiresAt") or _now()),
    float(state.get("updatedAt") or _now()),
    str(state.get("ownerSubject") or ""),
    int(state.get("version") or 0),
    state.get("clientRequestId"),
    state.get("requestFingerprint"),
    float(state["idempotencyExpiresAt"]) if state.get("idempotencyExpiresAt") else None,
  )


async def _save_postgres_session(db: Database, state: dict[str, Any]) -> None:
  """무조건 upsert — create 최초 저장·lazy 전이 폴백 전용. mutator는 CAS 버전을 사용."""
  await ensure_postgres_session_table(db)
  await db.execute(
    """
    insert into auradin_search_sessions
      (session_id, state, expires_at, updated_at,
       owner_subject, version, client_request_id, request_fingerprint, idempotency_expires_at)
    values ($1, $2::jsonb, to_timestamp($3), to_timestamp($4), $5, $6, $7, $8, to_timestamp($9))
    on conflict (session_id) do update set
      state = excluded.state,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at,
      owner_subject = excluded.owner_subject,
      version = excluded.version,
      client_request_id = excluded.client_request_id,
      request_fingerprint = excluded.request_fingerprint,
      idempotency_expires_at = excluded.idempotency_expires_at
    """,
    *_session_row_args(state),
  )


async def _cas_update_postgres_session(
  db: Database,
  state: dict[str, Any],
  expected_version: int,
) -> bool:
  """version CAS 저장 — 다른 요청이 먼저 썼으면 False (호출부가 재로드·재판정)."""
  await ensure_postgres_session_table(db)
  row = await db.fetchrow(
    """
    update auradin_search_sessions set
      state = $2::jsonb,
      expires_at = to_timestamp($3),
      updated_at = to_timestamp($4),
      owner_subject = $5,
      version = $6,
      client_request_id = $7,
      request_fingerprint = $8,
      idempotency_expires_at = to_timestamp($9)
    where session_id = $1 and version = $10
    returning version
    """,
    *_session_row_args(state),
    int(expected_version),
  )
  return row is not None


async def _insert_session_idempotent(db: Database, state: dict[str, Any]) -> bool:
  """(owner, clientRequestId) unique 하에 원자 삽입 — 경쟁 패배 시 False."""
  await ensure_postgres_session_table(db)
  delete_sql = """
  delete from auradin_search_sessions
  where owner_subject = $1 and client_request_id = $2
    and idempotency_expires_at is not null and idempotency_expires_at <= to_timestamp($3)
  """
  insert_sql = """
  insert into auradin_search_sessions
    (session_id, state, expires_at, updated_at,
     owner_subject, version, client_request_id, request_fingerprint, idempotency_expires_at)
  values ($1, $2::jsonb, to_timestamp($3), to_timestamp($4), $5, $6, $7, $8, to_timestamp($9))
  on conflict (owner_subject, client_request_id) where client_request_id is not null
    do nothing
  returning session_id
  """
  delete_args = (
    str(state.get("ownerSubject") or ""),
    state.get("clientRequestId"),
    _now(),
  )

  async def _transaction(connection):
    await connection.execute(delete_sql, *delete_args)
    row = await connection.fetchrow(insert_sql, *_session_row_args(state))
    if row:
      # create 트래픽에 기대는 bounded opportunistic cleanup. retention이 살아 있는 tombstone은
      # 건드리지 않고, SKIP LOCKED로 다중 worker가 같은 batch를 기다리지 않는다.
      await connection.execute(
        """
        with expired as (
          select session_id
          from auradin_search_sessions
          where expires_at < now()
            and (idempotency_expires_at is null or idempotency_expires_at < now())
          order by expires_at
          limit $1
          for update skip locked
        )
        delete from auradin_search_sessions as sessions
        using expired
        where sessions.session_id = expired.session_id
        """,
        25,
      )
    return dict(row) if row else None

  transaction_runner = getattr(db, "run_in_transaction", None)
  if callable(transaction_runner):
    row = await transaction_runner(_transaction)
  else:
    # 테스트용 duck-typed DB 호환. 실제 Database 경로는 위 transaction을 반드시 사용한다.
    await db.execute(delete_sql, *delete_args)
    row = await db.fetchrow(
      insert_sql,
      *_session_row_args(state),
    )
  return row is not None


async def _fetch_idempotency_row(
  db: Database,
  owner_subject: str,
  client_request_id: str,
) -> dict[str, Any] | None:
  await ensure_postgres_session_table(db)
  return await db.fetchrow(
    """
    select session_id, state, request_fingerprint,
           extract(epoch from idempotency_expires_at) as idempotency_expires_at
    from auradin_search_sessions
    where owner_subject = $1 and client_request_id = $2
    limit 1
    """,
    owner_subject,
    client_request_id,
  )


async def _load_postgres_session(db: Database, session_id: str) -> dict[str, Any] | None:
  await ensure_postgres_session_table(db)
  row = await db.fetchrow(
    """
    select state
    from auradin_search_sessions
    where session_id = $1
    limit 1
    """,
    session_id,
  )
  if not row:
    return None

  state = row.get("state")
  if isinstance(state, str):
    return json.loads(state)
  if isinstance(state, dict):
    return state

  return None


def _validate_idempotent_hit(
  state: dict[str, Any],
  fingerprint: str,
) -> dict[str, Any]:
  if str(state.get("requestFingerprint") or "") != fingerprint:
    raise IdempotencyKeyReuseError(state.get("clientRequestId") or "")
  if state.get("phase") == "expired" or _now() > float(state.get("expiresAt") or 0):
    raise IdempotentSessionExpiredError(state.get("sessionId") or "")
  return state


def _idempotent_lookup_memory(
  key: tuple[str, str],
  fingerprint: str,
) -> dict[str, Any] | None:
  tomb = _IDEMPOTENCY_TOMBSTONES.get(key)
  if not tomb:
    return None
  if _now() >= float(tomb.get("idempotencyExpiresAt") or 0):
    # retention 종료 — tombstone 제거 후 같은 키의 새 create 허용
    _IDEMPOTENCY_TOMBSTONES.pop(key, None)
    session_id = str(tomb.get("sessionId") or "")
    if session_id:
      _SESSIONS.pop(session_id, None)
      _discard_session_lock(session_id)
    return None
  if str(tomb.get("fingerprint") or "") != fingerprint:
    raise IdempotencyKeyReuseError(key[1])
  state = get_session(str(tomb.get("sessionId") or ""), owner_subject=key[0])
  if state is None:
    raise IdempotentSessionExpiredError(str(tomb.get("sessionId") or ""))
  return _validate_idempotent_hit(state, fingerprint)


def _sweep_expired_memory_idempotency(*, now: float | None = None, limit: int = 32) -> int:
  """Bounded rotating sweep for DB-off retention tombstones and sessions."""
  current = _now() if now is None else now
  removed = 0
  for key in list(_IDEMPOTENCY_TOMBSTONES)[:max(1, int(limit))]:
    tomb = _IDEMPOTENCY_TOMBSTONES.get(key)
    if tomb is None:
      continue
    session_id = str(tomb.get("sessionId") or "")
    lock = _SESSION_LOCKS.get(session_id)
    in_use = bool(lock and lock.locked()) or _SESSION_LOCK_USERS.get(session_id, 0) > 0
    if current >= float(tomb.get("idempotencyExpiresAt") or 0) and not in_use:
      _IDEMPOTENCY_TOMBSTONES.pop(key, None)
      if session_id:
        _SESSIONS.pop(session_id, None)
        _discard_session_lock(session_id)
      removed += 1
    else:
      # Rotate so an old active prefix cannot starve expired entries behind it.
      _IDEMPOTENCY_TOMBSTONES.pop(key, None)
      _IDEMPOTENCY_TOMBSTONES[key] = tomb
  return removed


async def _idempotent_lookup_db(
  db: Database,
  key: tuple[str, str],
  fingerprint: str,
  settings: Settings,
) -> dict[str, Any] | None:
  row = await _fetch_idempotency_row(db, key[0], key[1])
  if not row:
    return None
  expires = float(row.get("idempotency_expires_at") or 0)
  if _now() >= expires:
    return None  # retention 종료 행은 insert 경로의 조건부 삭제가 정리
  if str(row.get("request_fingerprint") or "") != fingerprint:
    raise IdempotencyKeyReuseError(key[1])
  raw_state = row.get("state")
  state = json.loads(raw_state) if isinstance(raw_state, str) else raw_state
  if not isinstance(state, dict):
    return None
  _IDEMPOTENCY_TOMBSTONES[key] = {
    "sessionId": state["sessionId"],
    "fingerprint": fingerprint,
    "idempotencyExpiresAt": expires,
  }
  # DB 조회 중 TTL이 지났다면 일반 GET과 같은 lazy-expiry CAS 경로를 탄다.
  refreshed = await get_session_persisted(
    state["sessionId"],
    owner_subject=key[0],
    settings=settings,
    db=db,
  )
  if refreshed is None:
    raise IdempotentSessionExpiredError(state["sessionId"])
  return _validate_idempotent_hit(refreshed, fingerprint)


async def create_session_persisted(
  *,
  prompt: str,
  owner_subject: str,
  report_id: str | None = None,
  source: str | None = None,
  context: dict[str, Any] | None = None,
  report_context: dict[str, Any] | None = None,
  settings: Settings | None = None,
  db: Database | None = None,
  client_request_id: str | None = None,
) -> dict[str, Any]:
  settings = settings or get_settings()

  async def _create_and_persist() -> dict[str, Any]:
    state: dict[str, Any] | None = None
    try:
      state = create_session(
        prompt=prompt,
        owner_subject=owner_subject,
        report_id=report_id,
        source=source,
        context=context,
        report_context=report_context,
        settings=settings,
      )
      await _enrich_if_results(state, settings)
      await _enrich_if_question(state, settings)
      return state
    except BaseException as error:
      # create_session installs memory state before async enrichment. A failed
      # enrich must not leave an unreachable session or lock behind.
      failed_state = state or getattr(error, "session_state", None)
      if isinstance(failed_state, dict):
        session_id = str(failed_state.get("sessionId") or "")
        if session_id:
          _SESSIONS.pop(session_id, None)
          _discard_session_lock(session_id)
      raise

  if not client_request_id:
    state: dict[str, Any] | None = None
    try:
      state = await _create_and_persist()
      if _postgres_enabled(settings, db):
        await _save_postgres_session(db, state)
      return state
    except BaseException:
      # DB write failure is also a non-commit. Keep memory and DB visibility
      # aligned for legacy clients without clientRequestId.
      if state is not None:
        session_id = str(state.get("sessionId") or "")
        if session_id:
          _SESSIONS.pop(session_id, None)
          _discard_session_lock(session_id)
      raise

  key = (owner_subject.strip(), str(client_request_id))
  _sweep_expired_memory_idempotency()
  fingerprint = request_fingerprint(prompt, report_id, source, context)

  # single-flight: 기존 reservation이 있으면 같은 Future 결과에 편승 (동시 중복 create 1세션 보장).
  existing = _CREATE_RESERVATIONS.get(key)
  if existing is not None:
    # A disconnected duplicate request must not cancel the creator's shared
    # Future (or every other waiter) through asyncio cancellation propagation.
    winner = await asyncio.shield(existing)
    return _validate_idempotent_hit(winner, fingerprint)

  future: asyncio.Future = asyncio.get_event_loop().create_future()
  _CREATE_RESERVATIONS[key] = future  # 첫 await 전에 등록 — 이 지점까지 sync
  created_session_id: str | None = None
  try:
    hit = _idempotent_lookup_memory(key, fingerprint)
    if hit is None and _postgres_enabled(settings, db):
      hit = await _idempotent_lookup_db(db, key, fingerprint, settings)
    if hit is not None:
      future.set_result(hit)
      return hit

    state = await _create_and_persist()
    created_session_id = state["sessionId"]
    retention = float(getattr(settings, "auradin_idempotency_retention_seconds", 86400) or 86400)
    state["clientRequestId"] = key[1]
    state["requestFingerprint"] = fingerprint
    state["idempotencyExpiresAt"] = _now() + max(retention, 60.0)

    if _postgres_enabled(settings, db):
      inserted = await _insert_session_idempotent(db, state)
      if not inserted:
        # DB 경쟁 패배 — 먼저 만든 메모리 orphan 제거 후 winner 설치
        _SESSIONS.pop(created_session_id, None)
        _discard_session_lock(created_session_id)
        winner = await _idempotent_lookup_db(db, key, fingerprint, settings)
        if winner is None:
          raise IdempotentSessionExpiredError(created_session_id)
        state = winner
    _IDEMPOTENCY_TOMBSTONES[key] = {
      "sessionId": state["sessionId"],
      "fingerprint": fingerprint,
      "idempotencyExpiresAt": float(state.get("idempotencyExpiresAt") or (_now() + 86400)),
    }
    future.set_result(state)
    return state
  except BaseException as exc:
    # 예외·취소 시 reservation과 미완성 state를 제거해 retry를 허용 (계획 Stage 0-7)
    if created_session_id and _SESSIONS.get(created_session_id) is not None and not future.done():
      _SESSIONS.pop(created_session_id, None)
      _discard_session_lock(created_session_id)
    if not future.done():
      future.set_exception(exc)
      future.exception()  # retrieved 처리 — un-retrieved exception 경고 방지
    raise
  finally:
    _CREATE_RESERVATIONS.pop(key, None)


async def _get_session_persisted_unlocked(
  session_id: str,
  *,
  owner_subject: str,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any] | None:
  settings = settings or get_settings()
  if not _postgres_enabled(settings, db):
    return get_session(session_id, owner_subject=owner_subject)

  # GET도 TTL 전이를 쓰는 mutator다. 다른 워커의 answer/refine과 경합할 수 있으므로
  # load→expire→CAS를 bounded retry하고, 실패한 로컬 사본을 authoritative처럼 반환하지 않는다.
  for _attempt in range(3):
    state = await _load_postgres_session(db, session_id)
    if not state:
      _SESSIONS.pop(session_id, None)
      return None
    if state.get("ownerSubject") != owner_subject:
      return None

    _SESSIONS[session_id] = state
    expected = int(state.get("version") or 0)
    if not _expire_if_due(state):
      return state
    if await _cas_update_postgres_session(db, state, expected):
      return state
    logger.info("[aura:auradin-session] expiry CAS retry session=%s", session_id)
    _SESSIONS.pop(session_id, None)

  # 지속 경합 시 마지막 DB 상태를 다시 본다. 이미 terminal이면 반환할 수 있지만,
  # TTL이 지난 active row를 정상 GET으로 잠깐 재노출하면 안 된다.
  latest = await _load_and_install(db, session_id, owner_subject, expire=False)
  if (
    latest
    and latest.get("phase") not in INACTIVE_PHASES
    and _now() > float(latest.get("expiresAt") or 0)
  ):
    raise SessionVersionConflictError(session_id)
  return latest


async def get_session_persisted(
  session_id: str,
  *,
  owner_subject: str,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any] | None:
  """Public GET/lazy-expiry path serialized with every other session mutator."""
  settings = settings or get_settings()
  async with _session_guard(session_id):
    return await _get_session_persisted_unlocked(
      session_id,
      owner_subject=owner_subject,
      settings=settings,
      db=db,
    )


async def _load_and_install(
  db: Database,
  session_id: str,
  owner_subject: str,
  *,
  expire: bool = True,
) -> dict[str, Any] | None:
  state = await _load_postgres_session(db, session_id)
  if not state or state.get("ownerSubject") != owner_subject:
    return None
  _SESSIONS[session_id] = state
  return get_session(session_id, owner_subject=owner_subject) if expire else state


async def _run_session_mutation(
  session_id: str,
  *,
  owner_subject: str,
  settings: Settings,
  db: Database | None,
  judge_and_mutate,
  accepted_outcomes: frozenset[str],
) -> tuple[str, dict[str, Any] | None]:
  """A9 mutator 공통 원자 구간 — lock(load→판정→enrich→CAS save→메모리 교체) + bounded retry.

  단일 워커의 asyncio 인터리빙 경합은 세션별 Lock이, 멀티 워커는 version CAS가 막는다.
  거절 판정은 저장하지 않는다(state/version 불변). CAS 2회 실패 시 version_conflict를
  반환하고 authoritative state를 다시 로드해 준다.
  """
  async with _session_guard(session_id):
    for _attempt in range(2):
      state = await _get_session_persisted_unlocked(
        session_id, owner_subject=owner_subject, settings=settings, db=db,
      )
      if not state:
        return ANSWER_NOT_ANSWERABLE, None
      expected = int(state.get("version") or 0)

      mutation_snapshot = copy.deepcopy(state)
      try:
        outcome, state = judge_and_mutate(state)
        if outcome not in accepted_outcomes:
          return outcome, state  # 비파괴 거절 — 저장 없음

        await _enrich_if_results(state, settings)
        await _enrich_if_question(state, settings)

        if not _postgres_enabled(settings, db):
          _bump_version(state)
          return outcome, state

        _bump_version(state)
        if await _cas_update_postgres_session(db, state, expected):
          return outcome, state
      except FilterDeltaContractViolation as error:
        _log_contract_violation(state, error)
        state.clear()
        state.update(mutation_snapshot)
        return FILTER_DELTA_CONTRACT_VIOLATION, state
      except BaseException:
        # judge/enrich/CAS is one transaction from the in-process caller's
        # perspective. Any non-commit restores the exact pre-mutation state.
        state.clear()
        state.update(mutation_snapshot)
        _SESSIONS[session_id] = state
        raise
      # CAS 실패 — 낡은 메모리 폐기 후 authoritative 재로드·재판정 (bounded)
      logger.info("[aura:auradin-session] CAS retry session=%s", session_id)
      _SESSIONS.pop(session_id, None)

    try:
      latest = await _get_session_persisted_unlocked(
        session_id, owner_subject=owner_subject, settings=settings, db=db,
      )
    except SessionVersionConflictError:
      latest = await _load_and_install(db, session_id, owner_subject, expire=False)
    return MUTATION_VERSION_CONFLICT, latest


async def answer_session_persisted(
  session_id: str,
  *,
  owner_subject: str,
  question_id: str,
  option_id: str,
  settings: Settings | None = None,
  db: Database | None = None,
) -> tuple[str, dict[str, Any] | None]:
  settings = settings or get_settings()

  def _judge(state: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    return answer_session_judged(
      session_id,
      owner_subject=owner_subject,
      question_id=question_id,
      option_id=option_id,
      settings=settings,
    )

  return await _run_session_mutation(
    session_id,
    owner_subject=owner_subject,
    settings=settings,
    db=db,
    judge_and_mutate=_judge,
    accepted_outcomes=frozenset({ANSWER_ACCEPTED}),
  )


async def refine_session_persisted(
  session_id: str,
  *,
  owner_subject: str,
  prompt: str | None = None,
  dial: str | None = None,
  settings: Settings | None = None,
  db: Database | None = None,
) -> tuple[str, dict[str, Any] | None]:
  settings = settings or get_settings()

  def _judge(state: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    return refine_session_judged(
      session_id,
      owner_subject=owner_subject,
      prompt=prompt,
      dial=dial,
      settings=settings,
    )

  return await _run_session_mutation(
    session_id,
    owner_subject=owner_subject,
    settings=settings,
    db=db,
    judge_and_mutate=_judge,
    accepted_outcomes=frozenset({REFINE_ACCEPTED}),
  )


async def similar_session_persisted(
  session_id: str,
  *,
  owner_subject: str,
  product_id: str,
  intent: str | None = None,
  settings: Settings | None = None,
  db: Database | None = None,
) -> tuple[str, dict[str, Any] | None]:
  settings = settings or get_settings()

  def _judge(state: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    return similar_session_judged(
      session_id,
      owner_subject=owner_subject,
      product_id=product_id,
      intent=intent,
      settings=settings,
    )

  return await _run_session_mutation(
    session_id,
    owner_subject=owner_subject,
    settings=settings,
    db=db,
    judge_and_mutate=_judge,
    accepted_outcomes=frozenset({SIMILAR_ACCEPTED}),
  )


async def cancel_session_persisted(
  session_id: str,
  *,
  owner_subject: str,
  settings: Settings | None = None,
  db: Database | None = None,
) -> tuple[str, dict[str, Any] | None]:
  settings = settings or get_settings()

  def _judge(state: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    # cancel은 멱등 — 이미 종료면 무저장 판정으로 처리
    if state.get("phase") == "expired":
      return CANCEL_EXPIRED, state
    if state.get("phase") == "cancelled":
      return CANCEL_ALREADY_CANCELLED, state
    return CANCEL_ACCEPTED, cancel_session(session_id, owner_subject=owner_subject)

  outcome, state = await _run_session_mutation(
    session_id,
    owner_subject=owner_subject,
    settings=settings,
    db=db,
    judge_and_mutate=_judge,
    accepted_outcomes=frozenset({CANCEL_ACCEPTED}),
  )
  return outcome, state
