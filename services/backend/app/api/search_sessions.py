from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request

from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, get_database
from app.schemas.auradin_search import (
  AnswerSearchSessionRequest,
  CreateSearchSessionRequest,
  RefineSearchSessionRequest,
  SimilarSearchSessionRequest,
)
from app.services.auradin_agent.session_manager import (
  ANSWER_ACCEPTED,
  ANSWER_CONFLICT,
  ANSWER_DUPLICATE,
  ANSWER_EXPIRED,
  ANSWER_INVALID_OPTION,
  ANSWER_NOT_ANSWERABLE,
  ANSWER_STALE,
  CANCEL_ACCEPTED,
  CANCEL_ALREADY_CANCELLED,
  CANCEL_EXPIRED,
  FILTER_DELTA_CONTRACT_VIOLATION,
  MUTATION_VERSION_CONFLICT,
  REFINE_ACCEPTED,
  REFINE_DIALS,
  SIMILAR_ACCEPTED,
  SIMILAR_INTENTS,
  SIMILAR_UNKNOWN_PRODUCT,
  SessionVersionConflictError,
  IdempotencyKeyReuseError,
  IdempotentSessionExpiredError,
  answer_session_persisted,
  cancel_session_persisted,
  create_session_persisted,
  get_session_persisted,
  refine_session_persisted,
  similar_session_persisted,
  to_search_turn,
)
from app.services.auradin_agent.event_logger import (
  ANON_TOKEN_HEADER,
  derive_event_owner,
  record_search_turn_events,
)
from app.services.auradin_agent.retrieval_service import FilterDeltaContractViolation


router = APIRouter(prefix="/search/sessions", tags=["search"])


def _event_owner(request: Request, auth: AuthContext, settings: Settings) -> str | None:
  # A5 서버사이드 수집 — dev fallback subject면 None이 되어 기록을 fail-open으로 건너뛴다.
  return derive_event_owner(auth, settings, anon_token=request.headers.get(ANON_TOKEN_HEADER))

# A9 판정 → HTTP 매핑 (계획 Stage 0-3). 전송 오류는 세션 state에 저장하지 않는다.
_ANSWER_ERROR_MAP = {
  ANSWER_EXPIRED: (410, "SESSION_EXPIRED", "검색 세션이 만료됐어요. 새 검색으로 다시 시작해 주세요."),
  ANSWER_CONFLICT: (409, "ANSWER_CONFLICT", "같은 질문에 다른 답변이 이미 반영됐어요. 세션을 다시 조회해 주세요."),
  ANSWER_STALE: (409, "STALE_QUESTION", "지금 질문과 다른 답변이에요. 세션을 다시 조회해 주세요."),
  ANSWER_NOT_ANSWERABLE: (409, "SESSION_NOT_ANSWERABLE", "지금은 답변을 받을 수 없는 상태예요."),
  ANSWER_INVALID_OPTION: (422, "INVALID_OPTION", "선택한 답변을 찾을 수 없어요."),
  MUTATION_VERSION_CONFLICT: (409, "CONCURRENT_UPDATE", "다른 요청이 먼저 처리됐어요. 세션을 다시 조회해 주세요."),
}


@router.post("")
async def create_search_session(
  payload: Annotated[CreateSearchSessionRequest, Body()],
  request: Request,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  prompt = str(payload.prompt or "").strip()
  if not prompt:
    raise AppError(400, "PROMPT_REQUIRED", "Search prompt is required.")

  context = payload.context if isinstance(payload.context, dict) else {}
  # §3: 리포트 톤은 client-relay context.personalColor로 받는다 (로컬/무DB에서도 동작).
  report_context = (
    {"personalColor": str(context.get("personalColor") or "").strip()}
    if context.get("personalColor")
    else None
  )
  try:
    state = await create_session_persisted(
      prompt=prompt,
      report_id=str(payload.reportId or "").strip() or None,
      source=str(payload.source or "").strip() or None,
      context=context,
      report_context=report_context,
      owner_subject=auth.subject,
      settings=settings,
      db=db,
      client_request_id=str(payload.clientRequestId) if payload.clientRequestId else None,
    )
  except IdempotencyKeyReuseError:
    raise AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "같은 clientRequestId를 다른 요청 내용으로 재사용할 수 없어요. 새 요청 ID로 다시 시도해 주세요.",
    )
  except IdempotentSessionExpiredError:
    raise AppError(
      410,
      "SESSION_EXPIRED",
      "이전 요청의 검색 세션이 만료됐어요. 새 요청 ID로 다시 시작해 주세요.",
    )
  except FilterDeltaContractViolation:
    raise AppError(
      500,
      "FILTER_DELTA_CONTRACT_VIOLATION",
      "검색 조건 처리 계약을 확인해야 해요.",
    )
  # A5 §7.2 수집 지점 — state["logs"]에 이미 있는 결정의 영속화(session_start + 즉답 시 impression).
  # 기록은 부수 작업: state/version을 바꾸지 않고, 실패해도 응답을 막지 않는다(fail-open).
  await record_search_turn_events(
    state,
    trigger="create",
    owner_subject=_event_owner(request, auth, settings),
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
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  try:
    state = await get_session_persisted(
      session_id,
      owner_subject=auth.subject,
      settings=settings,
      db=db,
    )
  except SessionVersionConflictError:
    raise AppError(409, "CONCURRENT_UPDATE", "세션 상태가 갱신 중이에요. 잠시 후 다시 조회해 주세요.")
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  return success(to_search_turn(state))


@router.post("/{session_id}/answer")
async def answer_search_session(
  session_id: str,
  payload: Annotated[AnswerSearchSessionRequest, Body()],
  request: Request,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  question_id = str(payload.questionId or "").strip()
  option_id = str(payload.optionId or "").strip()
  if not question_id or not option_id:
    raise AppError(400, "ANSWER_REQUIRED", "questionId and optionId are required.")

  outcome, state = await answer_session_persisted(
    session_id,
    question_id=question_id,
    option_id=option_id,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if state is None:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")
  if outcome == FILTER_DELTA_CONTRACT_VIOLATION:
    raise AppError(500, "FILTER_DELTA_CONTRACT_VIOLATION", "검색 조건 처리 계약을 확인해야 해요.")

  # duplicate = 멱등 재시도 no-op — 최초 accepted와 같은 200 ack (클라이언트는 폴링 지속)
  if outcome in {ANSWER_ACCEPTED, ANSWER_DUPLICATE}:
    if outcome == ANSWER_ACCEPTED:
      # A5 수집 지점 — question_answered(+결과 도달 시 impression). duplicate는 기록하지 않지만,
      # 기록해도 결정론적 client_event_id가 (owner, client_event_id) 유니크에서 dedup된다.
      await record_search_turn_events(
        state,
        trigger="answer",
        owner_subject=_event_owner(request, auth, settings),
        settings=settings,
        db=db,
        question_id=question_id,
        option_id=option_id,
      )
    return success(
      {
        "sessionId": session_id,
        "phase": "searching",
        "retryAfterMs": 350,
      },
    )

  status, code, message = _ANSWER_ERROR_MAP.get(
    outcome, (409, "SESSION_NOT_ANSWERABLE", "지금은 답변을 받을 수 없는 상태예요."),
  )
  raise AppError(status, code, message)


@router.post("/{session_id}/cancel")
async def cancel_search_session(
  session_id: str,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  # 사용자가 검색 도중 이탈 → 세션 종료. 모바일이 홈 복귀 시 fire-and-forget으로 호출한다.
  outcome, state = await cancel_session_persisted(
    session_id,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if not state:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")

  if outcome == MUTATION_VERSION_CONFLICT:
    raise AppError(409, "CONCURRENT_UPDATE", "다른 요청이 먼저 처리됐어요. 세션을 다시 조회해 주세요.")
  if outcome == CANCEL_EXPIRED:
    raise AppError(410, "SESSION_EXPIRED", "검색 세션이 만료됐어요. 새 검색으로 다시 시작해 주세요.")
  if outcome not in {CANCEL_ACCEPTED, CANCEL_ALREADY_CANCELLED}:
    raise AppError(409, "SESSION_NOT_CANCELLABLE", "지금은 검색 세션을 취소할 수 없는 상태예요.")

  return success({"sessionId": session_id, "phase": "cancelled"})


@router.post("/{session_id}/refine")
async def refine_search_session(
  session_id: str,
  payload: Annotated[RefineSearchSessionRequest, Body()],
  request: Request,
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  # §7: dial은 기존 후보 재랭킹(λ 조절)만, prompt는 §3 파서로 hard/soft 병합.
  prompt = str(payload.prompt or "").strip()
  dial = str(payload.dial or "").strip() or None
  if dial and dial not in REFINE_DIALS:
    raise AppError(400, "INVALID_DIAL", "dial must be 'more_similar' or 'more_diverse'.")
  if not prompt and not dial:
    raise AppError(400, "REFINE_REQUIRED", "prompt or dial is required.")

  outcome, state = await refine_session_persisted(
    session_id,
    prompt=prompt or None,
    dial=dial,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if state is None:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")
  if outcome != REFINE_ACCEPTED:
    if outcome == FILTER_DELTA_CONTRACT_VIOLATION:
      raise AppError(500, "FILTER_DELTA_CONTRACT_VIOLATION", "검색 조건 처리 계약을 확인해야 해요.")
    if outcome == MUTATION_VERSION_CONFLICT:
      raise AppError(409, "CONCURRENT_UPDATE", "다른 요청이 먼저 처리됐어요. 세션을 다시 조회해 주세요.")
    raise AppError(
      409,
      "SESSION_NOT_REFINABLE",
      "지금은 조건을 다듬을 수 없는 상태예요. 결과 화면에서 다시 시도해 주세요.",
    )

  # A5 수집 지점 — refine_dial/refine_prompt(+새 결과 impression). raw prompt 원문은 싣지 않는다.
  await record_search_turn_events(
    state,
    trigger="refine",
    owner_subject=_event_owner(request, auth, settings),
    settings=settings,
    db=db,
    dial=dial,
    refined_with_prompt=bool(prompt),
  )
  return success(
    {
      "sessionId": session_id,
      "phase": "searching",
      "retryAfterMs": 350,
    },
  )


@router.post("/{session_id}/similar")
async def similar_search_session(
  session_id: str,
  payload: Annotated[SimilarSearchSessionRequest, Body()],
  auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
  db: Database = Depends(get_database),
) -> dict:
  # B6 §10.3-2: 신규 검색이 아니라 rankedCache 내 λ=0.9 재랭킹 — refine과 같은
  # ack/poll 계약(200 + searching + retryAfterMs)이며, M1 phase 계약(results에서만)을 따른다.
  product_id = str(payload.productId or "").strip()
  if not product_id:
    raise AppError(400, "PRODUCT_REQUIRED", "productId is required.")
  intent = str(payload.intent or "").strip() or None
  if intent and intent not in SIMILAR_INTENTS:
    raise AppError(
      400,
      "INVALID_SIMILAR_INTENT",
      "intent must be 'keep_color', 'cheaper' or 'other_brand'.",
    )

  outcome, state = await similar_session_persisted(
    session_id,
    product_id=product_id,
    intent=intent,
    owner_subject=auth.subject,
    settings=settings,
    db=db,
  )
  if state is None:
    raise AppError(404, "SESSION_NOT_FOUND", "Search session was not found.")
  if outcome != SIMILAR_ACCEPTED:
    if outcome == SIMILAR_UNKNOWN_PRODUCT:
      raise AppError(422, "UNKNOWN_PRODUCT", "기준 제품을 후보 카탈로그에서 찾을 수 없어요.")
    if outcome == FILTER_DELTA_CONTRACT_VIOLATION:
      raise AppError(500, "FILTER_DELTA_CONTRACT_VIOLATION", "검색 조건 처리 계약을 확인해야 해요.")
    if outcome == MUTATION_VERSION_CONFLICT:
      raise AppError(409, "CONCURRENT_UPDATE", "다른 요청이 먼저 처리됐어요. 세션을 다시 조회해 주세요.")
    raise AppError(
      409,
      "SESSION_NOT_SIMILARABLE",
      "지금은 비슷한 제품을 찾을 수 없는 상태예요. 결과 화면에서 다시 시도해 주세요.",
    )

  return success(
    {
      "sessionId": session_id,
      "phase": "searching",
      "retryAfterMs": 350,
    },
  )
