from __future__ import annotations

import time
import uuid
import json
from typing import Any

from app.core.settings import Settings, get_settings
from app.db.session import Database

from .catalog_loader import get_catalog
from .enrichment import enrich_results
from .intent_parser import parse_intent
from .question_engine import propose_question
from .report_profile import personal_color_to_soft_preferences
from .ranking import build_slice_result
from .retrieval_service import retrieve_and_rank


SESSION_TTL_SECONDS = 15 * 60
MAX_RESULTS = 6
# §7 refine 다이얼 λ 안전 범위 — 0/1 극단은 MMR을 무력화하므로 클램프.
LAMBDA_MIN = 0.05
LAMBDA_MAX = 0.95
REFINE_DIALS = {"more_similar", "more_diverse"}
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
  # 질문 답변에서 온 delta는 선택지의 한국어 라벨을 그대로 쓴다 —
  # 아니면 finish/priceTier 등 미등록 속성이 "priceTier: under_15k"로 노출된다.
  display_label = str(filter_delta.get("displayLabel") or "").strip()
  if display_label:
    return display_label
  attribute = filter_delta.get("attribute")
  values = filter_delta.get("values") or []
  if attribute == "category" and values:
    return {"lip": "립", "cheek": "블러셔/치크", "shadow": "아이섀도우"}.get(values[0], values[0])
  if attribute == "priceKrw":
    return f"{int(filter_delta.get('numberValue') or 0):,}원 이하"
  if attribute == "channel" and values:
    return "올리브영" if values[0] == "oliveyoung" else "백화점/계열몰"
  return f"{attribute}: {', '.join(values)}"


_REPORT_TONE_LABELS = {"cool": "쿨톤 참고", "warm": "웜톤 참고", "neutral": "뉴트럴 참고"}


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
) -> dict[str, Any]:
  # §5/§6: floor → MMR → 3역할 → 구조화 근거. 단일 shape = Top3 (§4). 세트/비교는 이후 단계.
  slice_result = build_slice_result(
    ranked,
    lambda_=_session_lambda(state, settings),
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
  retrieval = retrieve_and_rank(
    catalog,
    intent,
    state.get("answers", []),
    settings=settings,
    extra_hard_filters=state.get("refineHardFilters") or [],
    extra_soft_preferences=state.get("refineSoftPreferences") or [],
    extra_query_text=state.get("refinePrompt"),
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
  report_context: dict[str, Any] | None = None,
  settings: Settings | None = None,
) -> dict[str, Any]:
  settings = settings or get_settings()
  session_id = f"auradin-{uuid.uuid4().hex[:16]}"
  now = _now()
  intent = parse_intent(prompt, report_id=report_id, source=source, context=context)
  # §3: 얼굴분석 리포트 → undertone 소프트 선호 병합 (§9: soft만, hard 금지).
  # report_context.personalColor(client-relay) 또는 API가 로드한 리포트에서 온다.
  personal_color = str((report_context or {}).get("personalColor") or "").strip()
  if personal_color:
    report_prefs = personal_color_to_soft_preferences(personal_color)
    if report_prefs:
      intent["softPreferences"] = [*intent.get("softPreferences", []), *report_prefs]
      intent["requiresQuestion"] = bool(intent.get("broad")) or bool(intent["softPreferences"])
  state = {
    "sessionId": session_id,
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


def _refine_header(prompt: str, dial: str | None) -> str:
  if prompt:
    return "추가 조건을 반영해 다시 골랐어요"
  if dial == "more_similar":
    return "1위와 더 비슷한 결로 다시 정렬했어요"
  return "더 다양한 결로 다시 정렬했어요"


def _refine_recovery(state: dict[str, Any], prompt: str) -> dict[str, Any]:
  # §7: 후보 0이어도 조용히 완화 금지 — 이전 결과 유지 + 복구 옵션 제시.
  return {
    "message": "요청한 조건을 지키면 보여줄 후보가 없어요. 조건을 조용히 풀지 않고 이전 결과를 유지할게요.",
    "rejectedPrompt": prompt or None,
    "recoveryOptions": [
      {"label": "조건 없이 다시 검색", "prompt": state.get("prompt", "")},
      {"label": "가격 조건 올려서 다시", "prompt": f"{state.get('prompt', '')} 3만원 이하"},
    ],
  }


def refine_session(
  session_id: str,
  *,
  prompt: str | None = None,
  dial: str | None = None,
  settings: Settings | None = None,
) -> dict[str, Any] | None:
  """§7 refine — dial은 캐시된 후보를 λ만 바꿔 재랭킹(재검색 X), prompt는 §3 파서로 hard/soft 병합.

  같은 attribute는 refine-출처 필터끼리만 교체한다. 원 프롬프트/질문 답변 출처는 불변(§9).
  후보 0이면 이전 결과를 유지하고 recoveryOptions를 싣는다 — 조용한 완화 금지.
  """
  settings = settings or get_settings()
  state = get_session(session_id)
  if not state or state.get("phase") == "expired":
    return state

  prompt = str(prompt or "").strip()
  dial = str(dial or "").strip() or None
  snapshot = {
    "result": state.get("result"),
    "phase": state.get("phase"),
    "mmrLambda": state.get("mmrLambda"),
    "refineHardFilters": list(state.get("refineHardFilters") or []),
    "refineSoftPreferences": list(state.get("refineSoftPreferences") or []),
    "refinePrompt": state.get("refinePrompt"),
    "hardFilters": state.get("hardFilters"),
    "softPreferences": state.get("softPreferences"),
  }

  if dial in REFINE_DIALS:
    step = float(settings.auradin_refine_lambda_step)
    current = _session_lambda(state, settings)
    adjusted = current + (step if dial == "more_similar" else -step)
    state["mmrLambda"] = round(min(LAMBDA_MAX, max(LAMBDA_MIN, adjusted)), 4)

  used_cache = False
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
    state["refinePrompt"] = prompt

    retrieval = retrieve_and_rank(
      get_catalog(),
      state["intent"],
      state.get("answers", []),
      settings=settings,
      extra_hard_filters=state["refineHardFilters"],
      extra_soft_preferences=state["refineSoftPreferences"],
      extra_query_text=prompt,
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
        extra_query_text=state.get("refinePrompt"),
      )
      ranked = retrieval["ranked"]

  state.setdefault("logs", []).append(
    {
      "refine": {
        "dial": dial,
        "prompt": prompt or None,
        "lambda": _session_lambda(state, settings),
        "usedCache": used_cache,
        "candidateCount": len(ranked),
      },
    },
  )

  result = _build_result(state, ranked, settings) if ranked else None
  if not result or not result["products"]:
    # 실패한 refine은 필터·λ까지 되돌린다 — 다음 refine이 오염된 조건 위에서 돌지 않게.
    for key, value in snapshot.items():
      state[key] = value
    if snapshot["result"]:
      state["result"] = {**snapshot["result"], "refineNotice": _refine_recovery(state, prompt)}
      state["phase"] = "results"
    state["updatedAt"] = _now()
    return state

  result["headerLabel"] = _refine_header(prompt, dial)
  state["rankedCache"] = _ranked_cache(ranked)
  state["currentCandidateIds"] = [row["item"]["id"] for row in ranked]
  state["rankedCandidateIds"] = [row["item"]["id"] for row in ranked]
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


async def _enrich_if_results(state: dict[str, Any] | None, settings: Settings) -> None:
  # §11 6/7단계: 랭킹(동기·순수) 뒤 비동기 enrich — 라이브 Naver 발견 + reasonCopy (가산).
  if state and state.get("phase") == "results":
    await enrich_results(state, settings=settings, extra_caveats=_interpretation_caveats(state))


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
  report_context: dict[str, Any] | None = None,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any]:
  settings = settings or get_settings()
  state = create_session(
    prompt=prompt,
    report_id=report_id,
    source=source,
    context=context,
    report_context=report_context,
    settings=settings,
  )
  await _enrich_if_results(state, settings)
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
  await _enrich_if_results(state, settings)
  if state and _postgres_enabled(settings, db):
    await _save_postgres_session(db, state)

  return state


async def refine_session_persisted(
  session_id: str,
  *,
  prompt: str | None = None,
  dial: str | None = None,
  settings: Settings | None = None,
  db: Database | None = None,
) -> dict[str, Any] | None:
  settings = settings or get_settings()
  state = await get_session_persisted(session_id, settings=settings, db=db)
  if not state:
    return None

  state = refine_session(session_id, prompt=prompt, dial=dial, settings=settings)
  await _enrich_if_results(state, settings)
  if state and _postgres_enabled(settings, db):
    await _save_postgres_session(db, state)

  return state
