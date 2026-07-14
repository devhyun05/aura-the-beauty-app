"""A5 (M3) — auradin_events 이벤트 로깅 계약 테스트.

정본: 종합보고서 §7.2(11종 enum·복합 멱등키·manifest 귀속·fail-open) +
익명식별 RFC(dev fallback subject 적재 금지, anon:v1/user:v1 owner 형식).
DB 없이 인메모리 fake로 (owner, clientEventId) 멱등 로직을 검증한다.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Iterator
from typing import Any, get_args

import anyio
import pytest
from fastapi.testclient import TestClient

from app.core.security import AuthContext
from app.core.settings import Settings
from app.db.check_schema import (
  EXPECTED_COLUMNS,
  EXPECTED_CONSTRAINT_CONTRACTS,
  EXPECTED_INDEX_CONTRACTS,
  EXPECTED_TABLES,
)
from app.db.init_db import POST_SCHEMA_MIGRATIONS
from app.db.session import get_database
from app.main import create_app
from app.schemas.auradin_search import AuradinEventType
from app.services.auradin_agent import event_logger
from app.services.auradin_agent.event_logger import (
  ANON_TOKEN_HEADER,
  EVENT_TYPES,
  build_search_turn_events,
  derive_event_owner,
  flush_search_turn_event_tasks,
  is_event_owner,
  record_events,
  reset_events_table_cache,
  sanitize_payload,
)
from app.services.auradin_agent.session_manager import clear_sessions


EXPECTED_EVENT_TYPES = (
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

ANON_OWNER = "anon:v1:test-digest"

# _INSERT_EVENT_SQL 인자 순서 (event_logger와 동기)
ARG_CLIENT_EVENT_ID = 0
ARG_OWNER_SUBJECT = 2
ARG_EVENT_TYPE = 6
ARG_DATA_MANIFEST_ID = 12
ARG_RELEASE_MANIFEST_ID = 13
ARG_PAYLOAD = 16


class FakeEventsDb:
  """asyncpg Database duck-type — (owner_subject, client_event_id) 유니크 + do nothing 에뮬레이션."""

  def __init__(self, *, fail: bool = False) -> None:
    self.rows: list[tuple[Any, ...]] = []
    self.fail = fail
    self.is_connected = True

  async def execute(self, query: str, *args: Any) -> str:
    if "insert into auradin_events" in query:
      if self.fail:
        raise RuntimeError("boom: simulated event insert failure")
      key = (args[ARG_OWNER_SUBJECT], args[ARG_CLIENT_EVENT_ID])
      existing = {(row[ARG_OWNER_SUBJECT], row[ARG_CLIENT_EVENT_ID]) for row in self.rows}
      if key in existing:
        return "INSERT 0 0"  # on conflict do nothing — 예외 없이 무시
      self.rows.append(args)
      return "INSERT 0 1"
    return "OK"  # create table/index 등 DDL은 no-op

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    return None

  async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
    return []


def _enabled_settings(**overrides: Any) -> Settings:
  values: dict[str, Any] = {
    "database_url": None,
    "auradin_session_store": "memory",
    "auradin_events_enabled": True,
    "auradin_anon_token_secret": "test-secret",
    "auradin_release_manifest_id": "commit-abc123",
  }
  values.update(overrides)
  return Settings(**values)


def _event(client_event_id: str = "evt-1", **overrides: Any) -> dict[str, Any]:
  base: dict[str, Any] = {
    "clientEventId": client_event_id,
    "eventType": "product_open",
    "occurredAt": "2026-07-15T09:00:00+09:00",
    "sessionId": "auradin-test",
    "productId": "prod-1",
  }
  base.update(overrides)
  return base


# _client가 요청 간 유지되는 이벤트 루프(portal)를 등록하는 per-test 스택.
_portal_stack: contextlib.ExitStack | None = None


@pytest.fixture(autouse=True)
def _reset_event_logger_state() -> Iterator[None]:
  global _portal_stack
  reset_events_table_cache()
  event_logger.reset_event_queue_state()
  clear_sessions()
  with contextlib.ExitStack() as stack:
    _portal_stack = stack
    yield
  _portal_stack = None


def _client(settings: Settings, db: FakeEventsDb) -> TestClient:
  app = create_app(settings)
  app.dependency_overrides[get_database] = lambda: db
  client = TestClient(app)
  # A5-3: 세션 API 이벤트 기록은 background task — 요청 간 살아있는 이벤트 루프가 필요하다.
  # lifespan 없이 영속 portal만 주입한다(starlette가 client.portal을 요청마다 재사용).
  assert _portal_stack is not None
  client.portal = _portal_stack.enter_context(anyio.from_thread.start_blocking_portal())
  return client


def _drain_background_events(client: TestClient) -> None:
  """세션 API 응답은 이벤트 insert를 기다리지 않는다 — 검증 전에 background 큐를 비운다."""
  assert client.portal is not None
  client.portal.call(flush_search_turn_event_tasks)


# ------------------------------------------------------------------ ① 11종 enum 정본


def test_event_type_enum_matches_section_7_2_contract() -> None:
  assert EVENT_TYPES == EXPECTED_EVENT_TYPES
  # Pydantic 요청 계약과 단일 정본 동기 — 알 수 없는 타입은 422로 거부된다.
  assert set(get_args(AuradinEventType)) == set(EVENT_TYPES)


def test_events_migration_is_registered_with_contract_fields() -> None:
  migration_sql = POST_SCHEMA_MIGRATIONS["schema.sql:auradin-events-v1"]

  assert "create table if not exists auradin_events" in migration_sql
  for event_type in EXPECTED_EVENT_TYPES:
    assert f"'{event_type}'" in migration_sql
  # MVP 필수 계약 — 소급 추가 불가 필드
  assert "unique (owner_subject, client_event_id)" in migration_sql
  assert "schema_version smallint not null default 1" in migration_sql
  assert "data_manifest_id text not null" in migration_sql
  assert "release_manifest_id text not null" in migration_sql
  assert "occurred_at timestamptz not null" in migration_sql
  assert "received_at timestamptz not null default now()" in migration_sql
  # §7.2 인덱스 4종
  assert "idx_auradin_events_owner_time" in migration_sql
  assert "idx_auradin_events_session" in migration_sql
  assert "idx_auradin_events_manifest" in migration_sql
  assert "idx_auradin_events_received" in migration_sql


def test_check_schema_covers_auradin_events_contract() -> None:
  # 기존 check_schema 스타일 — 테이블/컬럼/제약/인덱스 기대치가 동기 갱신됐는지.
  assert "auradin_events" in EXPECTED_TABLES
  assert {"client_event_id", "owner_subject", "event_type", "data_manifest_id",
          "release_manifest_id", "occurred_at", "received_at", "payload"} <= EXPECTED_COLUMNS["auradin_events"]
  assert "auradin_events_event_type_check" in EXPECTED_CONSTRAINT_CONTRACTS
  assert "auradin_events_owner_subject_client_event_id_key" in EXPECTED_CONSTRAINT_CONTRACTS
  for index_name in (
    "idx_auradin_events_owner_time",
    "idx_auradin_events_session",
    "idx_auradin_events_manifest",
    "idx_auradin_events_received",
  ):
    assert index_name in EXPECTED_INDEX_CONTRACTS


def test_unknown_event_type_is_rejected_with_422() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(), db)

  response = client.post(
    "/api/search/events",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"events": [_event(eventType="page_view")]},
  )

  assert response.status_code == 422
  assert db.rows == []


# ------------------------------------------------------------------ ② (owner, clientEventId) 멱등


@pytest.mark.asyncio
async def test_record_events_is_idempotent_per_owner_and_client_event_id() -> None:
  db = FakeEventsDb()
  settings = _enabled_settings()

  first = await record_events([_event("evt-dup")], owner_subject=ANON_OWNER, settings=settings, db=db)
  second = await record_events([_event("evt-dup")], owner_subject=ANON_OWNER, settings=settings, db=db)

  assert first == 1 and second == 1  # insert 시도는 되지만 충돌 없이 no-op
  assert len(db.rows) == 1

  # 유니크 범위는 전역 ID가 아니라 (owner, clientEventId) — 다른 owner의 같은 ID는 별개 행.
  await record_events([_event("evt-dup")], owner_subject="anon:v1:other", settings=settings, db=db)
  assert len(db.rows) == 2


def test_batch_endpoint_dedupes_retried_client_event_ids() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(), db)
  body = {"events": [_event("evt-retry"), _event("evt-retry")]}

  first = client.post("/api/search/events", headers={ANON_TOKEN_HEADER: "device-token-1"}, json=body)
  retry = client.post("/api/search/events", headers={ANON_TOKEN_HEADER: "device-token-1"}, json=body)

  assert first.status_code == 201
  assert retry.status_code == 201
  assert len(db.rows) == 1
  owner = db.rows[0][ARG_OWNER_SUBJECT]
  assert owner.startswith("anon:v1:")
  assert "device-token-1" not in owner  # 원문 token 미저장 (HMAC digest만)
  # manifest 귀속 — release는 settings 주입값, data는 active snapshot SHA(또는 unknown)
  assert db.rows[0][ARG_RELEASE_MANIFEST_ID] == "commit-abc123"
  assert db.rows[0][ARG_DATA_MANIFEST_ID]


# ------------------------------------------------------------------ ③ dev subject skip


def test_owner_contract_rejects_dev_fallback_subject() -> None:
  settings = _enabled_settings()
  dev_auth = AuthContext(
    subject=settings.dev_user_sub,
    provider="google",
    email=None,
    name=None,
    claims={"token_use": "dev", "sub": settings.dev_user_sub},
  )

  assert derive_event_owner(dev_auth, settings) is None
  assert not is_event_owner(settings.dev_user_sub)
  assert is_event_owner("anon:v1:digest")
  assert is_event_owner("user:v1:pool:sub")


@pytest.mark.asyncio
async def test_record_events_skips_dev_subject_without_error() -> None:
  db = FakeEventsDb()
  settings = _enabled_settings()

  recorded = await record_events(
    [_event()], owner_subject=settings.dev_user_sub, settings=settings, db=db,
  )

  assert recorded == 0
  assert db.rows == []


def test_batch_endpoint_returns_204_for_dev_subject() -> None:
  db = FakeEventsDb()
  # anon token 없음 → auth_required=False의 dev fallback subject뿐 → skip + 204 (RFC §2.2)
  client = _client(_enabled_settings(), db)

  response = client.post("/api/search/events", json={"events": [_event()]})

  assert response.status_code == 204
  assert db.rows == []


def test_authenticated_user_owner_is_normalized_to_user_v1() -> None:
  settings = _enabled_settings()
  auth = AuthContext(
    subject="cognito-sub-1",
    provider="google",
    email=None,
    name=None,
    claims={
      "token_use": "id",
      "sub": "cognito-sub-1",
      "iss": "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_POOL",
    },
  )

  assert derive_event_owner(auth, settings) == "user:v1:ap-northeast-2_POOL:cognito-sub-1"


# ------------------------------------------------------------------ ④ 플래그 off skip


@pytest.mark.asyncio
async def test_flag_off_skips_recording() -> None:
  db = FakeEventsDb()
  settings = _enabled_settings(auradin_events_enabled=False)

  recorded = await record_events([_event()], owner_subject=ANON_OWNER, settings=settings, db=db)

  assert recorded == 0
  assert db.rows == []


def test_batch_endpoint_returns_204_when_flag_off() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(auradin_events_enabled=False), db)

  response = client.post(
    "/api/search/events",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"events": [_event()]},
  )

  assert response.status_code == 204
  assert db.rows == []


# ------------------------------------------------------------------ ⑤ fail-open — DB 예외에도 응답 정상


@pytest.mark.asyncio
async def test_record_events_swallows_db_failures() -> None:
  db = FakeEventsDb(fail=True)

  recorded = await record_events(
    [_event()], owner_subject=ANON_OWNER, settings=_enabled_settings(), db=db,
  )

  assert recorded == 0  # 예외 전파 없음 — 로그/카운터만


def test_search_session_create_succeeds_when_event_write_fails() -> None:
  db = FakeEventsDb(fail=True)
  client = _client(_enabled_settings(), db)

  created = client.post(
    "/api/search/sessions",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"prompt": "쿨톤 매트 립 2만원 이하"},
  )

  # A5 계약: 이벤트 기록 실패는 어떤 경우에도 추천 응답을 막지 않는다.
  assert created.status_code == 200
  assert created.json()["data"]["sessionId"]


def test_batch_endpoint_stays_2xx_when_event_write_fails() -> None:
  db = FakeEventsDb(fail=True)
  client = _client(_enabled_settings(), db)

  response = client.post(
    "/api/search/events",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"events": [_event()]},
  )

  assert response.status_code == 201
  assert response.json()["data"]["accepted"] == 0


# ------------------------------------------------------------------ ⑥ raw query 원문 미저장


def test_payload_allowlist_drops_raw_query_text() -> None:
  payload = sanitize_payload(
    {
      "query": "쿨톤 매트 립",
      "prompt": "쿨톤 매트 립",
      "rawQuery": "쿨톤 매트 립",
      "text": "쿨톤 매트 립",
      "scoreSnapshot": {"score": 0.91},
      "dial": "more_similar",
    },
  )

  assert payload == {"scoreSnapshot": {"score": 0.91}, "dial": "more_similar"}


def test_refine_prompt_event_never_carries_prompt_text() -> None:
  prompt_text = "글로시한 코랄로 다시"
  state = {
    "sessionId": "auradin-raw",
    "version": 3,
    "phase": "results",
    "refinePrompt": prompt_text,
    "result": {"products": [{"id": "p1", "category": "lip", "role": "anchor", "matchRate": 88}]},
    "rankedCache": [{"id": "p1", "score": 0.88, "components": {"semantic": 0.7}}],
  }

  events = build_search_turn_events(state, trigger="refine", refined_with_prompt=True)

  assert [event["eventType"] for event in events] == ["refine_prompt", "impression"]
  assert prompt_text not in json.dumps(events, ensure_ascii=False)


def test_persisted_rows_never_contain_raw_prompt() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(), db)
  prompt_text = "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하"

  created = client.post(
    "/api/search/sessions",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"prompt": prompt_text},
  )

  assert created.status_code == 200
  _drain_background_events(client)
  assert db.rows  # session_start는 기록됐다
  serialized = json.dumps(
    [[str(value) for value in row] for row in db.rows], ensure_ascii=False,
  )
  assert prompt_text not in serialized
  assert "글로시" not in serialized  # 파싱 전 원문 조각도 남기지 않는다

  # 배치 payload로 원문이 들어와도 allowlist가 걸러낸다.
  db.rows.clear()
  response = client.post(
    "/api/search/events",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"events": [_event(payload={"query": prompt_text, "dial": "more_similar"})]},
  )
  assert response.status_code == 201
  stored_payload = db.rows[0][ARG_PAYLOAD]
  assert stored_payload is not None and prompt_text not in stored_payload
  assert json.loads(stored_payload) == {"dial": "more_similar"}


# ------------------------------------------------------------------ 서버사이드 수집 지점 통합


def test_server_side_capture_records_session_start_and_impressions() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(), db)

  created = client.post(
    "/api/search/sessions",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"prompt": "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하"},
  )
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]

  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  answered = 0
  while turn["phase"] == "question" and answered < 3:
    question = turn["question"]
    option = next(o for o in question["options"] if o["filterDelta"]["op"] != "noop")
    response = client.post(
      f"/api/search/sessions/{session_id}/answer",
      headers={ANON_TOKEN_HEADER: "device-token-1"},
      json={"questionId": question["id"], "optionId": option["id"]},
    )
    assert response.status_code == 200
    answered += 1
    turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]

  assert turn["phase"] == "results"
  _drain_background_events(client)
  types = [row[ARG_EVENT_TYPE] for row in db.rows]
  assert types.count("session_start") == 1
  assert types.count("question_answered") == answered
  assert types.count("impression") == len(turn["result"]["products"])

  impressions = [row for row in db.rows if row[ARG_EVENT_TYPE] == "impression"]
  for row in impressions:
    payload = json.loads(row[ARG_PAYLOAD]) if row[ARG_PAYLOAD] else {}
    assert "scoreSnapshot" in payload  # §16 수용 — LTR 대비 scoreSnapshot 동봉
  # rank/role/matchRate 컬럼 배선 (rank=$10, role=$11, match_rate=$12)
  assert impressions[0][9] == 1
  assert impressions[0][11] is not None


# ------------------------------------------------------------------ ⑦ 중첩 자유 텍스트 fail-closed (교차 리뷰 A5-1)


def test_nested_free_text_probe_payload_is_dropped() -> None:
  # Codex 실프로브 재사용 — allowlist 최상위 키 안쪽에 원문을 중첩해도 통과하지 못한다.
  probe = {"source": "쿨톤 매트 립", "scoreSnapshot": {"query": "쿨톤 매트 립"}}
  assert sanitize_payload(probe) is None

  deep = {
    "scoreSnapshot": {"score": 0.9, "components": {"semantic": 0.7, "note": "쿨톤 매트 립"}},
    "filterDelta": {"attribute": "colorFamily", "op": "in", "values": ["핑크 계열로 전부"]},
    "dial": "글로시하게 다시",
    "appVersion": "쿨톤 매트 립 1.0",
    "locale": "한국어",
    "platform": "아이폰",
    "lambda": "높게",
  }
  clean = sanitize_payload(deep)

  # 수치 성분만 살아남고, 자유 텍스트는 어떤 깊이에서도 drop된다.
  assert clean == {"scoreSnapshot": {"score": 0.9, "components": {"semantic": 0.7}}}
  assert "쿨톤" not in json.dumps(clean, ensure_ascii=False)


def test_filter_delta_free_text_label_is_stripped_but_typed_fields_survive() -> None:
  clean = sanitize_payload(
    {
      "filterDelta": {
        "attribute": "priceKrw",
        "op": "lte",
        "numberValue": 20000,
        "displayLabel": "2만원 이하",  # answer 경로가 붙이는 한국어 라벨 — 영속 금지
      },
    },
  )

  assert clean == {"filterDelta": {"attribute": "priceKrw", "op": "lte", "numberValue": 20000}}


def test_batch_probe_payload_never_persists_nested_free_text() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(), db)

  response = client.post(
    "/api/search/events",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={
      "events": [
        _event(payload={"source": "쿨톤 매트 립", "scoreSnapshot": {"query": "쿨톤 매트 립"}}),
      ],
    },
  )

  assert response.status_code == 201
  assert len(db.rows) == 1
  assert db.rows[0][ARG_PAYLOAD] is None  # 유효 성분이 하나도 없으면 payload 자체가 null
  serialized = json.dumps([[str(value) for value in row] for row in db.rows], ensure_ascii=False)
  assert "쿨톤" not in serialized


# ------------------------------------------------------------------ ⑧ manifest 귀속 불가 → drop (교차 리뷰 A5-2)


@pytest.mark.asyncio
async def test_missing_release_manifest_drops_events_without_unknown() -> None:
  db = FakeEventsDb()
  settings = _enabled_settings(auradin_release_manifest_id=None)
  drops = event_logger.EVENT_ATTRIBUTION_DROPS["count"]

  recorded = await record_events([_event()], owner_subject=ANON_OWNER, settings=settings, db=db)

  assert recorded == 0
  assert db.rows == []  # "unknown" 귀속 행은 영속되지 않는다
  assert event_logger.EVENT_ATTRIBUTION_DROPS["count"] == drops + 1


@pytest.mark.asyncio
async def test_missing_data_manifest_drops_events_without_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
  def _no_catalog() -> Any:
    raise RuntimeError("snapshot unavailable")

  monkeypatch.setattr(event_logger, "get_catalog", _no_catalog)
  db = FakeEventsDb()
  drops = event_logger.EVENT_ATTRIBUTION_DROPS["count"]

  recorded = await record_events([_event()], owner_subject=ANON_OWNER, settings=_enabled_settings(), db=db)

  assert recorded == 0
  assert db.rows == []
  assert event_logger.EVENT_ATTRIBUTION_DROPS["count"] == drops + 1


def test_settings_warn_when_events_enabled_without_release_manifest(caplog: pytest.LogCaptureFixture) -> None:
  with caplog.at_level(logging.WARNING, logger="app.core.settings"):
    _enabled_settings(auradin_release_manifest_id=None)

  assert any("auradin_release_manifest_id" in record.message for record in caplog.records)


# ------------------------------------------------------------------ ⑨ refine prompt+dial 동시 → 2건 (교차 리뷰 A5-4)


def test_refine_prompt_and_dial_together_build_two_events() -> None:
  state = {
    "sessionId": "auradin-dual",
    "version": 4,
    "phase": "results",
    "result": {"products": []},
  }

  events = build_search_turn_events(
    state, trigger="refine", dial="more_similar", refined_with_prompt=True,
  )

  by_type = {event["eventType"]: event for event in events}
  assert set(by_type) == {"refine_prompt", "refine_dial"}
  ids = {event["clientEventId"] for event in events}
  assert len(ids) == 2 and all(cid.startswith("srv:") for cid in ids)
  assert by_type["refine_prompt"]["payload"] is None  # raw prompt 원문 금지
  assert by_type["refine_dial"]["payload"] == {"dial": "more_similar"}

  # 같은 refine(CAS version)의 재시도는 같은 결정적 ID — (owner, clientEventId) dedup 대상.
  retry = build_search_turn_events(
    state, trigger="refine", dial="more_similar", refined_with_prompt=True,
  )
  assert {event["clientEventId"] for event in retry} == ids


@pytest.mark.asyncio
async def test_refine_dual_events_persist_as_two_rows() -> None:
  db = FakeEventsDb()
  state = {"sessionId": "auradin-dual", "version": 7, "phase": "results", "result": {"products": []}}
  events = build_search_turn_events(
    state, trigger="refine", dial="more_diverse", refined_with_prompt=True,
  )

  recorded = await record_events(events, owner_subject=ANON_OWNER, settings=_enabled_settings(), db=db)

  assert recorded == 2
  assert sorted(row[ARG_EVENT_TYPE] for row in db.rows) == ["refine_dial", "refine_prompt"]


def test_refine_endpoint_with_prompt_and_dial_records_both_events() -> None:
  db = FakeEventsDb()
  client = _client(_enabled_settings(), db)

  created = client.post(
    "/api/search/sessions",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"prompt": "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하"},
  )
  assert created.status_code == 200
  session_id = created.json()["data"]["sessionId"]

  turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  answered = 0
  while turn["phase"] == "question" and answered < 3:
    question = turn["question"]
    option = next(o for o in question["options"] if o["filterDelta"]["op"] != "noop")
    client.post(
      f"/api/search/sessions/{session_id}/answer",
      headers={ANON_TOKEN_HEADER: "device-token-1"},
      json={"questionId": question["id"], "optionId": option["id"]},
    )
    answered += 1
    turn = client.get(f"/api/search/sessions/{session_id}").json()["data"]
  assert turn["phase"] == "results"

  refined = client.post(
    f"/api/search/sessions/{session_id}/refine",
    headers={ANON_TOKEN_HEADER: "device-token-1"},
    json={"prompt": "글로시한 코랄로 다시", "dial": "more_similar"},
  )
  assert refined.status_code == 200

  _drain_background_events(client)
  types = [row[ARG_EVENT_TYPE] for row in db.rows]
  assert types.count("refine_prompt") == 1
  assert types.count("refine_dial") == 1
  serialized = json.dumps([[str(value) for value in row] for row in db.rows], ensure_ascii=False)
  assert "글로시한 코랄" not in serialized  # refine prompt 원문 미영속


# ------------------------------------------------------------------ ⑩ background 큐 상한 (교차 리뷰 A5-3)


class GatedEventsDb(FakeEventsDb):
  """execute가 gate를 기다리는 느린 DB — background 큐 상한 검증용."""

  def __init__(self, gate: asyncio.Event) -> None:
    super().__init__()
    self._gate = gate

  async def execute(self, query: str, *args: Any) -> str:
    await self._gate.wait()
    return await super().execute(query, *args)


@pytest.mark.asyncio
async def test_background_queue_drops_over_limit(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(event_logger, "EVENT_TASK_QUEUE_LIMIT", 2)
  gate = asyncio.Event()
  db = GatedEventsDb(gate)
  settings = _enabled_settings()
  state = {"sessionId": "auradin-queue", "phase": "searching", "context": {"source": "freePrompt"}}
  drops = event_logger.EVENT_QUEUE_DROPS["count"]

  tasks = [
    event_logger.schedule_search_turn_events(
      state, trigger="create", owner_subject=ANON_OWNER, settings=settings, db=db,
    )
    for _ in range(3)
  ]

  assert tasks[0] is not None and tasks[1] is not None
  assert tasks[2] is None  # 상한 초과 → drop + 카운터 (응답은 이미 나갔다 — fail-open)
  assert event_logger.EVENT_QUEUE_DROPS["count"] == drops + 1

  gate.set()
  await event_logger.flush_search_turn_event_tasks()
  # 상한 내 task는 기록 완료 — 같은 결정적 clientEventId라 (owner, id) dedup으로 1행.
  assert len(db.rows) == 1
  assert db.rows[0][ARG_EVENT_TYPE] == "session_start"
