from __future__ import annotations

import time
import uuid
import json
from typing import Any

from app.core.settings import Settings, get_settings
from app.db.session import Database

from .catalog_loader import get_catalog
from .intent_parser import parse_intent
from .question_engine import propose_question
from .ranking import build_slice_result
from .retrieval_service import retrieve_and_rank


SESSION_TTL_SECONDS = 15 * 60
MAX_RESULTS = 6
# '글리터'는 카탈로그에 없는 마감 → 아이섀도우·쉬머로 해석했음을 근거에 투명 노출 (§6/§9).
GLITTER_TERMS = ("글리터", "반짝", "스파클", "glitter", "sparkle")

_SESSIONS: dict[str, dict[str, Any]] = {}
_POSTGRES_TABLE_READY = False


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
  attribute = filter_delta.get("attribute")
  values = filter_delta.get("values") or []
  if attribute == "category" and values:
    return {"lip": "립", "cheek": "블러셔/치크", "shadow": "아이섀도우"}.get(values[0], values[0])
  if attribute == "priceKrw":
    return f"{int(filter_delta.get('numberValue') or 0):,}원 이하"
  if attribute == "channel" and values:
    return "올리브영" if values[0] == "oliveyoung" else "백화점/계열몰"
  return f"{attribute}: {', '.join(values)}"


def _applied_filters(state: dict[str, Any]) -> list[dict[str, Any]]:
  filters = []
  for filter_delta in state.get("hardFilters", []):
    if filter_delta.get("op") == "noop":
      continue
    filters.append(
      {
        "label": _filter_label(filter_delta),
        "source": filter_delta.get("source", "prompt"),
        "confidence": filter_delta.get("confidence"),
      },
    )
  return filters


def _unsupported_error(category: str | None) -> dict[str, Any]:
  label = {"brow": "브로우", "base": "베이스", "liner": "라이너"}.get(category or "", category or "해당")
  return {
    "code": "unsupported_category",
    "message": f"지금 MVP seed는 립·치크·아이섀도우 중심이라 {label} 제품은 아직 충분하지 않아요.",
    "recoverable": True,
    "recoveryOptions": [
      {"label": "데일리 립으로 찾기", "prompt": "데일리로 쓸 만한 립 추천해줘"},
      {"label": "자연스러운 블러셔", "prompt": "면접용 자연스러운 블러셔, 너무 붉지 않게"},
      {"label": "은은한 쉬머 섀도우", "prompt": "글리터 강한 아이섀도우 말고 은은한 쉬머"},
    ],
  }


def _no_results_error(state: dict[str, Any]) -> dict[str, Any]:
  return {
    "code": "no_results",
    "message": "명시한 가격이나 구매처 조건을 지키면 구매 가능한 후보가 충분하지 않아요. 조건을 조용히 풀지 않고 다시 물어볼게요.",
    "recoverable": True,
    "recoveryOptions": [
      {"label": "가격 조건 빼고 다시", "prompt": state.get("prompt", "").replace("2만원 이하", "").strip()},
      {"label": "립·치크·섀도우 전체에서 보기", "prompt": "데일리로 쓸 만한 제품 추천해줘"},
    ],
  }


def _interpretation_caveats(state: dict[str, Any]) -> list[str] | None:
  prompt = str(state.get("prompt") or "").lower()
  if any(term.lower() in prompt for term in GLITTER_TERMS):
    return ["'글리터'는 카탈로그 기준 아이섀도우·쉬머 계열로 해석했어요"]
  return None


def _build_result(
  state: dict[str, Any],
  ranked: list[dict[str, Any]],
  settings: Settings,
) -> dict[str, Any]:
  # §5/§6: floor → MMR → 3역할 → 구조화 근거. 단일 shape = Top3 (§4). 세트/비교는 이후 단계.
  slice_result = build_slice_result(
    ranked,
    lambda_=float(settings.auradin_mmr_lambda),
    s_floor=float(settings.auradin_floor_semantic),
    hard_filters=state.get("hardFilters", []),
    extra_caveats=_interpretation_caveats(state),
    top_n=3,
  )
  products = [
    product
    for product in slice_result["products"]
    if product.get("imageUrl") and product.get("purchaseUrl") and int(product.get("priceKrw") or 0) > 0
  ]
  return {
    "headerLabel": "답변 기준으로 후보를 좁혔어요" if state.get("answers") else "조건에 가까운 제품을 골랐어요",
    "contextSummary": "현재 MVP는 립·치크·아이섀도우 구매 가능 상품을 우선 검색해요.",
    "appliedFilters": _applied_filters(state),
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
    state["updatedAt"] = _now()
    return

  catalog = get_catalog()
  retrieval = retrieve_and_rank(catalog, intent, state.get("answers", []), settings=settings)
  ranked = retrieval["ranked"]
  state["hardFilters"] = retrieval["hardFilters"]
  state["softPreferences"] = retrieval["softPreferences"]
  state["currentCandidateIds"] = [row["item"]["id"] for row in ranked]
  state["rankedCandidateIds"] = [row["item"]["id"] for row in ranked]

  if answer_delta and state.get("logs"):
    state["logs"][-1]["answer"] = answer_delta
    state["logs"][-1]["candidateCountAfter"] = len(ranked)
    state["logs"][-1]["topScoresAfter"] = [round(float(row["score"]), 6) for row in ranked[:3]]
    state["logs"][-1]["retrievalBackendAfter"] = retrieval.get("retrievalBackend")

  if not ranked:
    state["phase"] = "failed"
    state["error"] = _no_results_error(state)
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
  state["updatedAt"] = _now()


def create_session(
  *,
  prompt: str,
  report_id: str | None = None,
  source: str | None = None,
  context: dict[str, Any] | None = None,
  settings: Settings | None = None,
) -> dict[str, Any]:
  settings = settings or get_settings()
  session_id = f"auradin-{uuid.uuid4().hex[:16]}"
  now = _now()
  state = {
    "sessionId": session_id,
    "phase": "searching",
    "prompt": prompt,
    "context": {
      "reportId": report_id,
      "source": source or "freePrompt",
      **(context or {}),
    },
    "intent": parse_intent(prompt, report_id=report_id, source=source, context=context),
    "answers": [],
    "askedAttributes": [],
    "questionCount": 0,
    "currentCandidateIds": [],
    "rankedCandidateIds": [],
    "logs": [],
    "createdAt": now,
    "updatedAt": now,
    "expiresAt": now + max(60, int(settings.auradin_session_ttl_seconds or SESSION_TTL_SECONDS)),
  }
  _SESSIONS[session_id] = state
  _advance(state, settings=settings)
  return state


def get_session(session_id: str) -> dict[str, Any] | None:
  state = _SESSIONS.get(session_id)
  if not state:
    return None
  if _now() > float(state.get("expiresAt") or 0):
    state["phase"] = "expired"
    state["error"] = {
      "code": "expired",
      "message": "검색 세션이 만료됐어요. 같은 조건으로 다시 시작해 주세요.",
      "recoverable": True,
    }
  return state


def answer_session(
  session_id: str,
  *,
  question_id: str,
  option_id: str,
  settings: Settings | None = None,
) -> dict[str, Any] | None:
  settings = settings or get_settings()
  state = get_session(session_id)
  if not state or state.get("phase") == "expired":
    return state

  question = state.get("lastQuestion") if isinstance(state.get("lastQuestion"), dict) else None
  if not question or question.get("id") != question_id:
    state["phase"] = "failed"
    state["error"] = {
      "code": "invalid_question",
      "message": "현재 질문과 맞지 않는 답변이에요. 검색을 다시 시작해 주세요.",
      "recoverable": True,
    }
    return state

  option = next((option for option in question.get("options", []) if option.get("id") == option_id), None)
  if not option:
    state["phase"] = "failed"
    state["error"] = {
      "code": "invalid_option",
      "message": "선택한 답변을 찾을 수 없어요. 검색을 다시 시작해 주세요.",
      "recoverable": True,
    }
    return state

  filter_delta = option.get("filterDelta") or {}
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
  _advance(
    state,
    answer_delta={
      "questionId": question_id,
      "optionId": option_id,
      "filterDelta": filter_delta,
    },
    settings=settings,
  )
  return state


def to_search_turn(state: dict[str, Any]) -> dict[str, Any]:
  phase = state.get("phase", "failed")
  return {
    "sessionId": state.get("sessionId"),
    "phase": phase,
    "thinking": _thinking(phase),
    "contextSummary": state.get("result", {}).get("contextSummary") or "립·치크·아이섀도우 MVP catalog 기준",
    "appliedFilters": _applied_filters(state),
    "question": state.get("lastQuestion") if phase == "question" else None,
    "result": state.get("result") if phase == "results" else None,
    "error": state.get("error") if phase in {"failed", "expired"} else None,
    "retryAfterMs": 350 if phase == "searching" else None,
    "logs": state.get("logs", []),
  }


def clear_sessions() -> None:
  _SESSIONS.clear()


def _postgres_enabled(settings: Settings, db: Database | None) -> bool:
  return bool(settings.auradin_session_store == "postgres" and db and db.is_connected)


async def _ensure_postgres_table(db: Database) -> None:
  global _POSTGRES_TABLE_READY
  if _POSTGRES_TABLE_READY:
    return

  await db.execute(
    """
    create table if not exists auradin_search_sessions (
      session_id text primary key,
      state jsonb not null,
      expires_at timestamptz not null,
      updated_at timestamptz not null
    )
    """,
  )
  _POSTGRES_TABLE_READY = True


async def _save_postgres_session(db: Database, state: dict[str, Any]) -> None:
  await _ensure_postgres_table(db)
  await db.execute(
    """
    insert into auradin_search_sessions (session_id, state, expires_at, updated_at)
    values ($1, $2::jsonb, to_timestamp($3), to_timestamp($4))
    on conflict (session_id) do update set
      state = excluded.state,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    """,
    state["sessionId"],
    json.dumps(state, ensure_ascii=False),
    float(state.get("expiresAt") or _now()),
    float(state.get("updatedAt") or _now()),
  )


async def _load_postgres_session(db: Database, session_id: str) -> dict[str, Any] | None:
  await _ensure_postgres_table(db)
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


async def create_session_persisted(
  *,
  prompt: str,
  report_id: str | None = None,
  source: str | None = None,
  context: dict[str, Any] | None = None,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any]:
  settings = settings or get_settings()
  state = create_session(
    prompt=prompt,
    report_id=report_id,
    source=source,
    context=context,
    settings=settings,
  )
  if _postgres_enabled(settings, db):
    await _save_postgres_session(db, state)

  return state


async def get_session_persisted(
  session_id: str,
  *,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any] | None:
  settings = settings or get_settings()
  state = get_session(session_id)
  if not state and _postgres_enabled(settings, db):
    state = await _load_postgres_session(db, session_id)
    if state:
      _SESSIONS[session_id] = state
      state = get_session(session_id)

  if state and _postgres_enabled(settings, db):
    await _save_postgres_session(db, state)

  return state


async def answer_session_persisted(
  session_id: str,
  *,
  question_id: str,
  option_id: str,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any] | None:
  settings = settings or get_settings()
  state = await get_session_persisted(session_id, settings=settings, db=db)
  if not state:
    return None

  state = answer_session(session_id, question_id=question_id, option_id=option_id, settings=settings)
  if state and _postgres_enabled(settings, db):
    await _save_postgres_session(db, state)

  return state
