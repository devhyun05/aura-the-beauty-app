"""A5 이벤트 로깅 (M3) — §7.2 auradin_events 영속화.

계약(종합보고서 §7.2 + 익명식별 RFC):
- 기록 실패는 어떤 경우에도 추천 응답을 막지 않는다(fail-open). 실패는 로그 + 카운터로만 남긴다.
- write feature flag ``auradin_events_enabled``(기본 False) 뒤에서만 기록한다.
- owner_subject는 ``anon:v1:<HMAC-digest>`` 또는 ``user:v1:<issuer-scope>:<sub>`` 형식만.
  dev fallback subject(``settings.dev_user_sub``)에는 적재 금지 — owner가 없으면 조용히 skip.
- 멱등성은 전역 ID가 아니라 (owner_subject, client_event_id) 복합 — insert는 on conflict do nothing.
- payload는 schema-versioned allowlist 구조화 값만. **raw query/prompt 원문은 저장하지 않는다.**
- manifest 귀속: data_manifest_id = active snapshot manifest SHA(정본), release_manifest_id =
  settings.auradin_release_manifest_id 또는 "unknown". catalog_run_date는 조회 편의용 중복.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.core.settings import Settings, get_settings
from app.db.session import Database

from .catalog_loader import get_catalog


logger = logging.getLogger(__name__)

EVENT_SCHEMA_VERSION = 1
MAX_EVENTS_PER_BATCH = 50

# §7.2 SQL enum이 정본 — 11종 (세션 2 + 탐색 5 + refine 2 + 부정 신호 2)
EVENT_TYPES: tuple[str, ...] = (
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
)

# RFC §3.4 — payload allowlist. raw query/prompt/리포트 원문/연락처류는 키 자체가 없어 구조적으로 배제된다.
PAYLOAD_ALLOWED_KEYS = frozenset(
  {"scoreSnapshot", "filterDelta", "dial", "lambda", "appVersion", "platform", "locale", "consent", "source"},
)

ANON_OWNER_PREFIX = "anon:v1:"
USER_OWNER_PREFIX = "user:v1:"
# 익명식별 RFC §2.1 — 모바일 device token 전달용 헤더 (원문 token은 저장·로그 금지)
ANON_TOKEN_HEADER = "x-auradin-anon-token"

# RFC §3.1 — 기록 실패율 운영 지표(로그 외 카운터). 프로세스 로컬 best-effort.
EVENT_WRITE_FAILURES = {"count": 0}

_EVENTS_TABLE_READY = False

_INSERT_EVENT_SQL = """
insert into auradin_events (
  client_event_id, schema_version, owner_subject,
  session_id, turn_id, result_set_id, event_type,
  product_id, category, rank, role, match_rate,
  data_manifest_id, release_manifest_id, catalog_run_date, ranker_version,
  payload, occurred_at, experiment_id, variant
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20
)
on conflict (owner_subject, client_event_id) do nothing
"""

# init_db "schema.sql:auradin-events-v1"이 정식 경로 — runtime ensure는 신규 설치 안전망 (세션 테이블과 동일 관례).
_ENSURE_EVENTS_TABLE_SQL = (
  """
  create table if not exists auradin_events (
    id bigserial primary key,
    client_event_id text not null,
    schema_version smallint not null default 1,
    owner_subject text not null,
    session_id text, turn_id text, result_set_id text,
    event_type text not null check (event_type in (
      'session_start','question_answered','impression','product_open',
      'save','unsave','purchase_click','refine_dial','refine_prompt','hide','unhide')),
    product_id text, category text, rank int, role text, match_rate int,
    data_manifest_id text not null,
    release_manifest_id text not null,
    catalog_run_date text, ranker_version text,
    payload jsonb,
    occurred_at timestamptz not null,
    received_at timestamptz not null default now(),
    experiment_id text, variant text,
    unique (owner_subject, client_event_id)
  )
  """,
  "create index if not exists idx_auradin_events_owner_time on auradin_events (owner_subject, occurred_at desc)",
  "create index if not exists idx_auradin_events_session on auradin_events (session_id)",
  "create index if not exists idx_auradin_events_manifest on auradin_events (data_manifest_id)",
  "create index if not exists idx_auradin_events_received on auradin_events (received_at)",
)


def is_event_owner(owner_subject: str | None) -> bool:
  """익명식별 계약을 만족하는 owner 형식인지 — anon:v1:*/user:v1:* 외에는 적재 금지."""
  subject = str(owner_subject or "")
  return (
    (subject.startswith(ANON_OWNER_PREFIX) and len(subject) > len(ANON_OWNER_PREFIX))
    or (subject.startswith(USER_OWNER_PREFIX) and len(subject) > len(USER_OWNER_PREFIX))
  )


def derive_event_owner(
  auth: Any,
  settings: Settings | None = None,
  *,
  anon_token: str | None = None,
) -> str | None:
  """AuthContext(+선택적 anon token) → 이벤트 owner_subject. 만들 수 없으면 None(=skip).

  - anon token + 서버 비밀키 → ``anon:v1:<HMAC-SHA256 base64url>`` (원문 token은 저장하지 않는다).
  - 검증된 Cognito subject → ``user:v1:<issuer-scope>:<sub>`` (RFC §2.2 정규화).
  - dev fallback(``settings.dev_user_sub``)·형식 불명은 None — 이벤트는 fail-open으로 건너뛴다.
  """
  settings = settings or get_settings()

  # ① 검증된 인증 사용자 → canonical user owner (RFC §2.2 — anon token보다 우선).
  #    dev fallback(token_use == "dev" / dev_user_sub)은 여기 해당하지 않는다.
  if auth is not None:
    claims = getattr(auth, "claims", None) or {}
    token_use = str(claims.get("token_use") or "")
    subject = str(getattr(auth, "subject", "") or "").strip()
    if subject and token_use in {"id", "access"} and subject != settings.dev_user_sub:
      issuer = str(claims.get("iss") or "").strip()
      issuer_scope = issuer.rstrip("/").rsplit("/", 1)[-1] if issuer else "cognito"
      return f"{USER_OWNER_PREFIX}{issuer_scope}:{subject}"

  # ② anon token + 서버 비밀키 → anon owner (원문 token은 어디에도 남기지 않는다).
  token = str(anon_token or "").strip()
  secret = str(getattr(settings, "auradin_anon_token_secret", "") or "")
  if token and secret:
    digest = hmac.new(secret.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).digest()
    return ANON_OWNER_PREFIX + base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

  # ③ 그 외(dev fallback 포함) — RFC §1: 공용 dev subject를 이벤트 owner로 사용 금지 → skip.
  return None


def sanitize_payload(payload: Any) -> dict[str, Any] | None:
  """allowlist 밖 키 제거 — raw query 원문(query/prompt/text 등)은 여기서 구조적으로 걸러진다."""
  if not isinstance(payload, dict):
    return None
  clean = {key: value for key, value in payload.items() if key in PAYLOAD_ALLOWED_KEYS}
  return clean or None


def manifest_attribution(settings: Settings | None = None) -> dict[str, Any]:
  """§7.2 귀속 정본 — active snapshot manifest SHA + release manifest id(미설정 시 "unknown")."""
  settings = settings or get_settings()
  data_manifest_id = "unknown"
  catalog_run_date = None
  try:
    snapshot = getattr(get_catalog(), "snapshot", None)
    if snapshot is not None:
      data_manifest_id = str(snapshot.manifest_sha256)
      catalog_run_date = str(snapshot.run_date)
  except Exception:
    # 귀속 실패도 fail-open — 이벤트를 버리기보다 "unknown"으로 남기고 로그로 드러낸다.
    logger.warning("[aura:auradin-events] snapshot attribution unavailable", exc_info=True)
  release_manifest_id = str(getattr(settings, "auradin_release_manifest_id", "") or "").strip() or "unknown"
  return {
    "dataManifestId": data_manifest_id,
    "catalogRunDate": catalog_run_date,
    "releaseManifestId": release_manifest_id,
  }


def _coerce_occurred_at(value: Any) -> datetime:
  if isinstance(value, datetime):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
  if isinstance(value, (int, float)):
    return datetime.fromtimestamp(float(value), tz=timezone.utc)
  if isinstance(value, str) and value.strip():
    try:
      parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
      return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
      pass
  return datetime.now(tz=timezone.utc)


def _coerce_int(value: Any) -> int | None:
  try:
    return int(value) if value is not None else None
  except (TypeError, ValueError):
    return None


def _coerce_text(value: Any) -> str | None:
  text = str(value or "").strip()
  return text or None


def _event_row_args(event: dict[str, Any], owner_subject: str, attribution: dict[str, Any]) -> tuple | None:
  """camelCase 이벤트 dict → insert 인자. 계약 위반(타입·멱등키 결손)은 행 단위로 드롭한다."""
  client_event_id = _coerce_text(event.get("clientEventId"))
  event_type = _coerce_text(event.get("eventType"))
  if not client_event_id:
    logger.warning("[aura:auradin-events] drop event without clientEventId type=%s", event_type)
    return None
  if event_type not in EVENT_TYPES:
    logger.warning("[aura:auradin-events] drop unknown event_type=%s", event_type)
    return None
  payload = sanitize_payload(event.get("payload"))
  return (
    client_event_id,
    _coerce_int(event.get("schemaVersion")) or EVENT_SCHEMA_VERSION,
    owner_subject,
    _coerce_text(event.get("sessionId")),
    _coerce_text(event.get("turnId")),
    _coerce_text(event.get("resultSetId")),
    event_type,
    _coerce_text(event.get("productId")),
    _coerce_text(event.get("category")),
    _coerce_int(event.get("rank")),
    _coerce_text(event.get("role")),
    _coerce_int(event.get("matchRate")),
    str(attribution["dataManifestId"]),
    str(attribution["releaseManifestId"]),
    attribution.get("catalogRunDate"),
    attribution.get("rankerVersion"),
    json.dumps(payload, ensure_ascii=False) if payload is not None else None,
    _coerce_occurred_at(event.get("occurredAt")),
    None,  # experiment_id — Future Extension (B7)
    None,  # variant — Future Extension (B7)
  )


async def _ensure_events_table(db: Database) -> None:
  global _EVENTS_TABLE_READY
  if _EVENTS_TABLE_READY:
    return
  for statement in _ENSURE_EVENTS_TABLE_SQL:
    await db.execute(statement)
  _EVENTS_TABLE_READY = True


def reset_events_table_cache() -> None:
  """테스트 격리용 — runtime ensure 플래그 초기화."""
  global _EVENTS_TABLE_READY
  _EVENTS_TABLE_READY = False


async def record_events(
  events: list[dict[str, Any]],
  *,
  owner_subject: str | None,
  settings: Settings | None = None,
  db: Database | None = None,
) -> int:
  """이벤트 배치를 fail-open으로 기록한다. 반환값은 insert를 시도한 행 수(중복은 DB가 무시).

  skip 조건(모두 조용히 — 로그만): flag off / owner 계약 위반(dev subject 포함) / DB 미설정.
  DB 예외도 삼킨다 — 어떤 실패도 호출부(추천 응답)로 전파하지 않는다.
  """
  settings = settings or get_settings()
  if not events:
    return 0
  if not bool(getattr(settings, "auradin_events_enabled", False)):
    logger.debug("[aura:auradin-events] skip: feature flag off")
    return 0
  if not is_event_owner(owner_subject) or owner_subject == settings.dev_user_sub:
    logger.info("[aura:auradin-events] skip: no contract-compliant owner (fail-open)")
    return 0
  if db is None or not bool(getattr(db, "is_connected", False)):
    logger.info("[aura:auradin-events] skip: database not configured (fail-open)")
    return 0

  attribution = manifest_attribution(settings)
  rows = []
  for event in events[:MAX_EVENTS_PER_BATCH]:
    args = _event_row_args(event, str(owner_subject), attribution)
    if args is not None:
      rows.append(args)
  if not rows:
    return 0

  try:
    await _ensure_events_table(db)
    for args in rows:
      await db.execute(_INSERT_EVENT_SQL, *args)
    return len(rows)
  except Exception:
    EVENT_WRITE_FAILURES["count"] += 1
    logger.warning(
      "[aura:auradin-events] write failed (fail-open) events=%d failures=%d",
      len(rows),
      EVENT_WRITE_FAILURES["count"],
      exc_info=True,
    )
    return 0


# ------------------------------------------------------------------ 서버사이드 수집 (§7.2 수집 지점)


def result_set_id_for(state: dict[str, Any]) -> str | None:
  """결과셋 식별자 — 세션 + 정렬된 제품 ID의 해시. 동일 결과 재노출은 같은 ID로 dedup된다."""
  products = ((state.get("result") or {}).get("products")) or []
  ids = [str(product.get("id") or "") for product in products if product.get("id")]
  if not ids:
    return None
  digest = hashlib.sha256("|".join([str(state.get("sessionId") or ""), *ids]).encode("utf-8")).hexdigest()
  return f"rs-{digest[:16]}"


def _now_iso() -> str:
  return datetime.now(tz=timezone.utc).isoformat()


def _impression_events(state: dict[str, Any]) -> list[dict[str, Any]]:
  if state.get("phase") != "results":
    return []
  result_set_id = result_set_id_for(state)
  session_id = str(state.get("sessionId") or "")
  score_by_id = {
    str(cached.get("id") or ""): cached
    for cached in state.get("rankedCache") or []
    if isinstance(cached, dict)
  }
  events: list[dict[str, Any]] = []
  products = ((state.get("result") or {}).get("products")) or []
  for index, product in enumerate(products):
    product_id = str(product.get("id") or "")
    if not product_id:
      continue
    cached = score_by_id.get(product_id) or {}
    # §16 수용 — scoreSnapshot(components) 동봉: LTR 전환 시 재로깅이 필요 없는 유일한 시점.
    snapshot = {
      key: value
      for key, value in (("score", cached.get("score")), ("components", cached.get("components")))
      if value is not None
    }
    events.append(
      {
        "clientEventId": f"srv:{session_id}:imp:{result_set_id}:{product_id}",
        "eventType": "impression",
        "occurredAt": _now_iso(),
        "sessionId": session_id,
        "resultSetId": result_set_id,
        "productId": product_id,
        "category": product.get("category"),
        "rank": index + 1,
        "role": product.get("role"),
        "matchRate": product.get("matchRate"),
        "payload": {"scoreSnapshot": snapshot} if snapshot else None,
      },
    )
  return events


def build_search_turn_events(
  state: dict[str, Any],
  *,
  trigger: str,
  question_id: str | None = None,
  option_id: str | None = None,
  dial: str | None = None,
  refined_with_prompt: bool = False,
) -> list[dict[str, Any]]:
  """세션 mutator 완료 시점의 서버사이드 이벤트 — state["logs"]에 이미 있는 값의 영속화.

  client_event_id는 결정론적(srv:*)이라 재시도·중복 answer는 (owner, client_event_id)
  유니크에서 자연 dedup된다. raw prompt 원문은 어떤 이벤트에도 싣지 않는다.
  """
  if not isinstance(state, dict):
    return []
  session_id = str(state.get("sessionId") or "")
  if not session_id:
    return []
  events: list[dict[str, Any]] = []

  if trigger == "create":
    context = state.get("context") if isinstance(state.get("context"), dict) else {}
    events.append(
      {
        "clientEventId": f"srv:{session_id}:session_start",
        "eventType": "session_start",
        "occurredAt": _now_iso(),
        "sessionId": session_id,
        "payload": {"source": context.get("source")} if context.get("source") else None,
      },
    )
  elif trigger == "answer" and question_id and option_id:
    filter_delta = next(
      (
        answer.get("filterDelta")
        for answer in state.get("answers") or []
        if answer.get("questionId") == question_id and answer.get("optionId") == option_id
      ),
      None,
    )
    events.append(
      {
        "clientEventId": f"srv:{session_id}:qa:{question_id}:{option_id}",
        "eventType": "question_answered",
        "occurredAt": _now_iso(),
        "sessionId": session_id,
        "turnId": question_id,
        "payload": {"filterDelta": filter_delta} if filter_delta else None,
      },
    )
  elif trigger == "refine":
    # 멱등 키에 mutator CAS version을 태워 같은 refine의 CAS 재시도는 1행, 새 refine은 새 행.
    version = int(state.get("version") or 0)
    event_type = "refine_prompt" if refined_with_prompt else "refine_dial"
    events.append(
      {
        "clientEventId": f"srv:{session_id}:refine:{version}",
        "eventType": event_type,
        "occurredAt": _now_iso(),
        "sessionId": session_id,
        "turnId": f"refine-{version}",
        # raw prompt 원문 저장 금지 — dial 값만 구조화 payload로.
        "payload": {"dial": dial} if dial else None,
      },
    )

  events.extend(_impression_events(state))
  return events


async def record_search_turn_events(
  state: dict[str, Any] | None,
  *,
  trigger: str,
  owner_subject: str | None,
  settings: Settings | None = None,
  db: Database | None = None,
  question_id: str | None = None,
  option_id: str | None = None,
  dial: str | None = None,
  refined_with_prompt: bool = False,
) -> None:
  """API 수집 지점용 최종 방벽 — 빌더 오류까지 포함해 어떤 예외도 응답으로 전파하지 않는다."""
  try:
    if not state:
      return
    events = build_search_turn_events(
      state,
      trigger=trigger,
      question_id=question_id,
      option_id=option_id,
      dial=dial,
      refined_with_prompt=refined_with_prompt,
    )
    await record_events(events, owner_subject=owner_subject, settings=settings, db=db)
  except Exception:
    EVENT_WRITE_FAILURES["count"] += 1
    logger.warning("[aura:auradin-events] turn event capture failed (fail-open)", exc_info=True)
