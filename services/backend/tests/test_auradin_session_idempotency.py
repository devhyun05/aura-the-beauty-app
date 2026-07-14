"""A9(F13) — 세션 멱등화·동시성 회귀 (M1 Stage 0).

계약: ① 거절 판정(duplicate/conflict/stale/invalid/not_answerable)은 세션을 파괴하지 않고
state/version/lastQuestion 불변, ② 같은 (owner, clientRequestId) create는 retention 내
1세션, ③ postgres 저장은 version CAS. invalid 답변의 구 동작(failed 전이)은 의도된
계약 변경으로 폐기됐다(종합보고서 §14 Stage 0).
"""

from __future__ import annotations

import asyncio
import copy
import json

import pytest

from app.core.settings import Settings
from app.db.init_db import POST_SCHEMA_MIGRATIONS
from app.services.auradin_agent import session_manager as sm


def _settings(store: str = "memory") -> Settings:
  return Settings(database_url=None, auradin_session_store=store)


@pytest.fixture(autouse=True)
def _fresh_sessions():
  sm.clear_sessions()
  yield
  sm.clear_sessions()


def _drive_to_results(prompt: str = "립 추천해줘") -> tuple[dict, list[tuple[str, str]]]:
  settings = _settings()
  state = sm.create_session(prompt=prompt, owner_subject="idem-user", settings=settings)
  answered: list[tuple[str, str]] = []
  while state["phase"] == "question":
    question = state["lastQuestion"]
    option = question["options"][0]
    answered.append((question["id"], option["id"]))
    outcome, state = sm.answer_session_judged(
      state["sessionId"],
      owner_subject="idem-user",
      question_id=question["id"],
      option_id=option["id"],
      settings=settings,
    )
    assert outcome == sm.ANSWER_ACCEPTED
  return state, answered


# ---------------------------------------------------------------- answer 판정


def test_duplicate_resend_after_results_is_noop():
  state, answered = _drive_to_results()
  assert state["phase"] == "results"
  assert state["lastQuestion"] is None  # results 진입 시 잔존 질문 제거 (F13 뿌리)
  before_answers = len(state["answers"])
  before_count = state["questionCount"]

  qid, oid = answered[-1]
  outcome, after = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user", question_id=qid, option_id=oid,
    settings=_settings(),
  )
  assert outcome == sm.ANSWER_DUPLICATE
  assert after["phase"] == "results"
  assert len(after["answers"]) == before_answers
  assert after["questionCount"] == before_count


def test_same_question_different_option_is_conflict_and_nondestructive():
  state, answered = _drive_to_results()
  qid, chosen = answered[-1]
  other = f"{chosen}-other"
  outcome, after = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user", question_id=qid, option_id=other,
    settings=_settings(),
  )
  assert outcome == sm.ANSWER_CONFLICT
  assert after["phase"] == "results"  # 세션 비파괴 — failed 전이 금지
  assert all(a["optionId"] != other for a in after["answers"])


def test_unknown_question_while_questioning_is_stale_not_failure():
  settings = _settings()
  state = sm.create_session(prompt="추천해줘", owner_subject="idem-user", settings=settings)
  assert state["phase"] == "question"
  outcome, after = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user",
    question_id="q-999-ghost", option_id="ghost-option", settings=settings,
  )
  assert outcome == sm.ANSWER_STALE
  assert after["phase"] == "question"
  assert after["lastQuestion"] is not None


def test_invalid_option_is_422_class_rejection_not_session_destruction():
  settings = _settings()
  state = sm.create_session(prompt="추천해줘", owner_subject="idem-user", settings=settings)
  question = state["lastQuestion"]
  outcome, after = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user",
    question_id=question["id"], option_id="no-such-option", settings=settings,
  )
  assert outcome == sm.ANSWER_INVALID_OPTION
  assert after["phase"] == "question"


def test_failed_session_rejects_new_answers():
  settings = _settings()
  state = sm.create_session(prompt="향수 추천해줘", owner_subject="idem-user", settings=settings)
  assert state["phase"] == "failed"
  assert state["lastQuestion"] is None
  outcome, _ = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user",
    question_id="q-1-any", option_id="any", settings=settings,
  )
  assert outcome == sm.ANSWER_NOT_ANSWERABLE


def test_cancel_then_answer_is_not_answerable():
  settings = _settings()
  state = sm.create_session(prompt="추천해줘", owner_subject="idem-user", settings=settings)
  question = state["lastQuestion"]
  sm.cancel_session(state["sessionId"], owner_subject="idem-user")
  outcome, _ = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user",
    question_id=question["id"], option_id=question["options"][0]["id"], settings=settings,
  )
  assert outcome == sm.ANSWER_NOT_ANSWERABLE


def test_expired_answer_is_expired_even_for_duplicate():
  state, answered = _drive_to_results()
  state["expiresAt"] = 0.0  # 강제 만료 — 만료 검사가 중복 검사보다 먼저다
  qid, oid = answered[-1]
  outcome, after = sm.answer_session_judged(
    state["sessionId"], owner_subject="idem-user", question_id=qid, option_id=oid,
    settings=_settings(),
  )
  assert outcome == sm.ANSWER_EXPIRED
  assert after["phase"] == "expired"
  assert after["lastQuestion"] is None


# ---------------------------------------------------------------- refine 가드


def test_refine_during_question_is_rejected_without_mutation():
  settings = _settings()
  state = sm.create_session(prompt="추천해줘", owner_subject="idem-user", settings=settings)
  assert state["phase"] == "question"
  before_lambda = state.get("mmrLambda")
  outcome, after = sm.refine_session_judged(
    state["sessionId"], owner_subject="idem-user", dial="more_diverse", settings=settings,
  )
  assert outcome == sm.REFINE_NOT_REFINABLE
  assert after["phase"] == "question"
  assert after.get("mmrLambda") == before_lambda


# ---------------------------------------------------------------- create 멱등성 (메모리)


@pytest.mark.asyncio
async def test_create_idempotent_same_key_returns_same_session():
  settings = _settings()
  first = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user",
    settings=settings, db=None, client_request_id="req-1",
  )
  second = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user",
    settings=settings, db=None, client_request_id="req-1",
  )
  assert first["sessionId"] == second["sessionId"]


@pytest.mark.asyncio
async def test_create_same_key_different_payload_is_key_reuse_error():
  settings = _settings()
  await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user",
    settings=settings, db=None, client_request_id="req-2",
  )
  with pytest.raises(sm.IdempotencyKeyReuseError):
    await sm.create_session_persisted(
      prompt="블러셔 추천해줘", owner_subject="idem-user",
      settings=settings, db=None, client_request_id="req-2",
    )
  # reportId/source/context 차이도 각각 fingerprint에 반영된다
  assert sm.request_fingerprint("립", None, None, None) != sm.request_fingerprint("립", "r1", None, None)
  assert sm.request_fingerprint("립", None, None, None) != sm.request_fingerprint("립", None, "report", None)
  assert sm.request_fingerprint("립", None, None, {"personalColor": "봄웜"}) != sm.request_fingerprint(
    "립", None, None, None,
  )


@pytest.mark.asyncio
async def test_concurrent_creates_share_single_session_db_off():
  settings = _settings()
  results = await asyncio.gather(
    *(
      sm.create_session_persisted(
        prompt="립 추천해줘", owner_subject="idem-user",
        settings=settings, db=None, client_request_id="req-3",
      )
      for _ in range(4)
    ),
  )
  assert len({state["sessionId"] for state in results}) == 1


@pytest.mark.asyncio
async def test_create_without_client_request_id_stays_legacy():
  settings = _settings()
  first = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user", settings=settings, db=None,
  )
  second = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user", settings=settings, db=None,
  )
  assert first["sessionId"] != second["sessionId"]


@pytest.mark.asyncio
@pytest.mark.parametrize("client_request_id", [None, "req-enrich-failure"])
async def test_create_enrich_failure_leaves_no_orphan(monkeypatch, client_request_id):
  async def fail_enrich(_state, _settings, **_kwargs):
    # enrichment_policy 등 정책 키워드는 무시 — 실패 주입만 담당한다.
    raise RuntimeError("injected enrich failure")

  monkeypatch.setattr(sm, "_enrich_if_results", fail_enrich)
  with pytest.raises(RuntimeError, match="injected enrich failure"):
    await sm.create_session_persisted(
      prompt="립 추천해줘",
      owner_subject="idem-user",
      settings=_settings(),
      db=None,
      client_request_id=client_request_id,
    )

  assert sm._SESSIONS == {}
  assert sm._SESSION_LOCKS == {}
  assert sm._CREATE_RESERVATIONS == {}
  assert sm._IDEMPOTENCY_TOMBSTONES == {}


@pytest.mark.asyncio
async def test_cancelled_create_waiter_does_not_cancel_creator(monkeypatch):
  entered = asyncio.Event()
  release = asyncio.Event()

  async def pause_enrich(_state, _settings):
    entered.set()
    await release.wait()

  monkeypatch.setattr(sm, "_enrich_if_results", pause_enrich)
  kwargs = {
    "prompt": "립 추천해줘",
    "owner_subject": "idem-user",
    "settings": _settings(),
    "db": None,
    "client_request_id": "req-shielded-waiter",
  }
  creator = asyncio.create_task(sm.create_session_persisted(**kwargs))
  await entered.wait()
  waiter = asyncio.create_task(sm.create_session_persisted(**kwargs))
  await asyncio.sleep(0)
  waiter.cancel()
  with pytest.raises(asyncio.CancelledError):
    await waiter

  reservation = sm._CREATE_RESERVATIONS[("idem-user", "req-shielded-waiter")]
  assert not reservation.cancelled()
  release.set()
  created = await creator
  assert created["sessionId"] in sm._SESSIONS
  assert sm._CREATE_RESERVATIONS == {}


@pytest.mark.asyncio
async def test_create_retry_after_session_ttl_is_expired_then_new_after_retention():
  settings = _settings()
  first = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user",
    settings=settings, db=None, client_request_id="req-4",
  )
  # 세션 TTL 경과 (retention은 유지) → 410 계열
  first["expiresAt"] = 0.0
  with pytest.raises(sm.IdempotentSessionExpiredError):
    await sm.create_session_persisted(
      prompt="립 추천해줘", owner_subject="idem-user",
      settings=settings, db=None, client_request_id="req-4",
    )
  # retention 경과 → tombstone 제거 후 같은 키로 새 세션 허용
  sm._IDEMPOTENCY_TOMBSTONES[("idem-user", "req-4")]["idempotencyExpiresAt"] = 0.0
  fresh = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user",
    settings=settings, db=None, client_request_id="req-4",
  )
  assert fresh["sessionId"] != first["sessionId"]


def test_bounded_memory_tombstone_sweep_rotates_and_removes_expired_sessions():
  for index in range(40):
    key = ("idem-user", f"active-{index}")
    sm._IDEMPOTENCY_TOMBSTONES[key] = {
      "sessionId": f"active-session-{index}",
      "fingerprint": "fp",
      "idempotencyExpiresAt": 999.0,
    }
  for index in range(4):
    session_id = f"expired-session-{index}"
    sm._SESSIONS[session_id] = {"sessionId": session_id}
    sm._IDEMPOTENCY_TOMBSTONES[("idem-user", f"expired-{index}")] = {
      "sessionId": session_id,
      "fingerprint": "fp",
      "idempotencyExpiresAt": 1.0,
    }

  # First pass rotates an active prefix; the second reaches expired entries.
  sm._sweep_expired_memory_idempotency(now=2.0, limit=32)
  removed = sm._sweep_expired_memory_idempotency(now=2.0, limit=32)

  assert removed == 4
  assert all(("idem-user", f"expired-{index}") not in sm._IDEMPOTENCY_TOMBSTONES for index in range(4))
  assert all(f"expired-session-{index}" not in sm._SESSIONS for index in range(4))


# ---------------------------------------------------------------- postgres CAS (Fake)


class FakeSessionDB:
  """auradin_search_sessions 행 저장을 흉내내는 CAS-aware fake (asyncpg 아님)."""

  is_connected = True

  def __init__(self) -> None:
    self.rows: dict[str, dict] = {}

  @staticmethod
  def _norm(query: str) -> str:
    return " ".join(query.split()).lower()

  async def execute(self, query: str, *args):
    q = self._norm(query)
    if q.startswith(("create", "alter", "do $$", "update auradin_search_sessions set owner_subject", "update auradin_search_sessions set version")):
      return "OK"
    if q.startswith("delete from auradin_search_sessions where owner_subject"):
      owner, key, now_ts = args
      for sid, row in list(self.rows.items()):
        if (
          row["owner_subject"] == owner
          and row["client_request_id"] == key
          and row["idempotency_expires_at"] is not None
          and row["idempotency_expires_at"] <= now_ts
        ):
          del self.rows[sid]
      return "OK"
    if q.startswith("insert into auradin_search_sessions") and "on conflict (session_id)" in q:
      self._store(args)
      return "OK"
    raise AssertionError(f"unexpected execute: {q[:80]}")

  def _store(self, args) -> None:
    (sid, state, expires, updated, owner, version, crid, fp, idem) = args
    self.rows[sid] = {
      "session_id": sid, "state": state, "expires_at": expires, "updated_at": updated,
      "owner_subject": owner, "version": version,
      "client_request_id": crid, "request_fingerprint": fp, "idempotency_expires_at": idem,
    }

  async def fetchrow(self, query: str, *args):
    q = self._norm(query)
    if "on conflict (owner_subject, client_request_id)" in q:
      (_sid, _state, _e, _u, owner, _v, crid, _fp, _idem) = args
      for row in self.rows.values():
        if row["owner_subject"] == owner and row["client_request_id"] == crid:
          return None  # 경쟁 패배
      self._store(args)
      return {"session_id": args[0]}
    if q.startswith("update auradin_search_sessions set"):
      *row_args, expected = args
      sid = row_args[0]
      row = self.rows.get(sid)
      if row is None or int(row["version"]) != int(expected):
        return None
      self._store(tuple(row_args))
      return {"version": row_args[5]}
    if q.startswith("select session_id, state, request_fingerprint"):
      owner, crid = args
      for row in self.rows.values():
        if row["owner_subject"] == owner and row["client_request_id"] == crid:
          return {
            "session_id": row["session_id"],
            "state": row["state"],
            "request_fingerprint": row["request_fingerprint"],
            "idempotency_expires_at": row["idempotency_expires_at"],
          }
      return None
    if q.startswith("select state from auradin_search_sessions"):
      row = self.rows.get(args[0])
      return {"state": row["state"]} if row else None
    raise AssertionError(f"unexpected fetchrow: {q[:80]}")


@pytest.mark.asyncio
async def test_postgres_cas_rejects_stale_version_and_answer_persists():
  settings = _settings("postgres")
  db = FakeSessionDB()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user",
    settings=settings, db=db, client_request_id="req-pg-1",
  )
  assert state["sessionId"] in db.rows

  # 직접 CAS: 잘못된 expected는 거부
  stale = json.loads(db.rows[state["sessionId"]]["state"])
  stale["version"] = 7
  assert not await sm._cas_update_postgres_session(db, stale, expected_version=99)

  # answer 수락 → CAS 저장으로 version 증가
  question = state["lastQuestion"]
  outcome, after = await sm.answer_session_persisted(
    state["sessionId"], owner_subject="idem-user",
    question_id=question["id"], option_id=question["options"][0]["id"],
    settings=settings, db=db,
  )
  assert outcome == sm.ANSWER_ACCEPTED
  assert int(db.rows[state["sessionId"]]["version"]) == int(after["version"]) >= 1


@pytest.mark.asyncio
async def test_postgres_concurrent_answers_apply_exactly_once():
  settings = _settings("postgres")
  db = FakeSessionDB()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user",
    settings=settings, db=db, client_request_id="req-pg-2",
  )
  question = state["lastQuestion"]
  options = [o["id"] for o in question["options"][:3]]
  outcomes = await asyncio.gather(
    *(
      sm.answer_session_persisted(
        state["sessionId"], owner_subject="idem-user",
        question_id=question["id"], option_id=option_id,
        settings=settings, db=db,
      )
      for option_id in options
    ),
  )
  accepted = [o for o, _ in outcomes if o == sm.ANSWER_ACCEPTED]
  rejected = [o for o, _ in outcomes if o in {sm.ANSWER_CONFLICT, sm.ANSWER_DUPLICATE}]
  assert len(accepted) == 1
  assert len(rejected) == len(options) - 1
  stored = json.loads(db.rows[state["sessionId"]]["state"])
  assert sum(1 for a in stored["answers"] if a["questionId"] == question["id"]) == 1


@pytest.mark.asyncio
async def test_postgres_restart_resend_is_duplicate(monkeypatch):
  settings = _settings("postgres")
  db = FakeSessionDB()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user",
    settings=settings, db=db, client_request_id="req-pg-3",
  )
  question = state["lastQuestion"]
  option_id = question["options"][0]["id"]
  outcome, _ = await sm.answer_session_persisted(
    state["sessionId"], owner_subject="idem-user",
    question_id=question["id"], option_id=option_id, settings=settings, db=db,
  )
  assert outcome == sm.ANSWER_ACCEPTED

  # 프로세스 재시작 시뮬레이션 — 메모리 소실, DB에서 재수화
  sm.clear_sessions()
  outcome, after = await sm.answer_session_persisted(
    state["sessionId"], owner_subject="idem-user",
    question_id=question["id"], option_id=option_id, settings=settings, db=db,
  )
  assert outcome == sm.ANSWER_DUPLICATE
  assert after is not None


# ---------------------------------------------------------------- migration 계약


def test_v2_migration_registered_with_backfill_and_constraints():
  migration = POST_SCHEMA_MIGRATIONS.get("schema.sql:auradin-sessions-v2")
  assert migration is not None
  for required in (
    "owner_subject = state->>'ownerSubject'",
    "alter column owner_subject set not null",
    "chk_auradin_sessions_idempotency_fields",
    "uq_auradin_sessions_owner_client_request",
    "idx_auradin_sessions_idempotency_expires",
  ):
    assert required in migration


def test_memory_lazy_expiry_bumps_version_and_timestamp_exactly_once(monkeypatch):
  settings = _settings()
  state = sm.create_session(prompt="추천해줘", owner_subject="idem-user", settings=settings)
  state["expiresAt"] = 100.0
  state["updatedAt"] = 50.0
  initial_version = state["version"]
  monkeypatch.setattr(sm, "_now", lambda: 101.0)

  first = sm.get_session(state["sessionId"], owner_subject="idem-user")
  second = sm.get_session(state["sessionId"], owner_subject="idem-user")

  assert first["phase"] == "expired"
  assert first["updatedAt"] == 101.0
  assert first["version"] == initial_version + 1
  assert second["version"] == first["version"]


@pytest.mark.asyncio
async def test_cancel_cleans_session_lock_after_guard_exits():
  settings = _settings()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user", settings=settings, db=None,
  )

  outcome, cancelled = await sm.cancel_session_persisted(
    state["sessionId"], owner_subject="idem-user", settings=settings, db=None,
  )

  assert outcome == sm.CANCEL_ACCEPTED
  assert cancelled["phase"] == "cancelled"
  assert state["sessionId"] not in sm._SESSION_LOCKS
  assert state["sessionId"] not in sm._SESSION_LOCK_USERS


@pytest.mark.asyncio
async def test_cancel_cas_exhaustion_is_not_false_success():
  class AlwaysFailCasDB(FakeSessionDB):
    async def fetchrow(self, query: str, *args):
      if self._norm(query).startswith("update auradin_search_sessions set"):
        return None
      return await super().fetchrow(query, *args)

  settings = _settings("postgres")
  db = AlwaysFailCasDB()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user", settings=settings, db=db,
    client_request_id="req-cancel-cas",
  )

  outcome, latest = await sm.cancel_session_persisted(
    state["sessionId"], owner_subject="idem-user", settings=settings, db=db,
  )

  assert outcome == sm.MUTATION_VERSION_CONFLICT
  assert latest["phase"] != "cancelled"
  assert json.loads(db.rows[state["sessionId"]]["state"])["phase"] != "cancelled"


@pytest.mark.asyncio
async def test_postgres_lazy_expiry_is_cas_persisted_once(monkeypatch):
  settings = _settings("postgres")
  db = FakeSessionDB()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user", settings=settings, db=db,
    client_request_id="req-expiry-cas",
  )
  stored = json.loads(db.rows[state["sessionId"]]["state"])
  stored["expiresAt"] = 100.0
  stored["updatedAt"] = 50.0
  db.rows[state["sessionId"]]["state"] = json.dumps(stored)
  monkeypatch.setattr(sm, "_now", lambda: 101.0)

  expired = await sm.get_session_persisted(
    state["sessionId"], owner_subject="idem-user", settings=settings, db=db,
  )
  again = await sm.get_session_persisted(
    state["sessionId"], owner_subject="idem-user", settings=settings, db=db,
  )

  persisted = json.loads(db.rows[state["sessionId"]]["state"])
  assert expired["phase"] == persisted["phase"] == "expired"
  assert expired["version"] == stored["version"] + 1
  assert again["version"] == expired["version"]


@pytest.mark.asyncio
async def test_postgres_lazy_expiry_cas_exhaustion_never_serves_expired_active_row(monkeypatch):
  class AlwaysFailExpiryCasDB(FakeSessionDB):
    async def fetchrow(self, query: str, *args):
      if self._norm(query).startswith("update auradin_search_sessions set"):
        return None
      return await super().fetchrow(query, *args)

  settings = _settings("postgres")
  db = AlwaysFailExpiryCasDB()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user", settings=settings, db=db,
    client_request_id="req-expiry-conflict",
  )
  stored = json.loads(db.rows[state["sessionId"]]["state"])
  stored["expiresAt"] = 100.0
  db.rows[state["sessionId"]]["state"] = json.dumps(stored)
  monkeypatch.setattr(sm, "_now", lambda: 101.0)

  with pytest.raises(sm.SessionVersionConflictError):
    await sm.get_session_persisted(
      state["sessionId"], owner_subject="idem-user", settings=settings, db=db,
    )

  assert json.loads(db.rows[state["sessionId"]]["state"])["phase"] != "expired"


@pytest.mark.asyncio
async def test_postgres_idempotency_key_is_410_until_retention_then_creates_new_session():
  settings = _settings("postgres")
  db = FakeSessionDB()
  first = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user", settings=settings, db=db,
    client_request_id="req-pg-retention",
  )
  stored = json.loads(db.rows[first["sessionId"]]["state"])
  stored["expiresAt"] = 0.0
  db.rows[first["sessionId"]]["state"] = json.dumps(stored)
  sm.clear_sessions()

  with pytest.raises(sm.IdempotentSessionExpiredError):
    await sm.create_session_persisted(
      prompt="립 추천해줘", owner_subject="idem-user", settings=settings, db=db,
      client_request_id="req-pg-retention",
    )

  db.rows[first["sessionId"]]["idempotency_expires_at"] = 0.0
  sm.clear_sessions()
  fresh = await sm.create_session_persisted(
    prompt="립 추천해줘", owner_subject="idem-user", settings=settings, db=db,
    client_request_id="req-pg-retention",
  )
  assert fresh["sessionId"] != first["sessionId"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("changed"),
  [
    {"report_id": "report-2"},
    {"source": "analysisReport"},
    {"context": {"personalColor": "여름쿨"}},
  ],
)
async def test_same_key_rejects_each_changed_semantic_create_input(changed):
  settings = _settings()
  common = {
    "prompt": "립 추천해줘",
    "owner_subject": "idem-user",
    "settings": settings,
    "db": None,
    "client_request_id": f"req-input-{next(iter(changed))}",
  }
  await sm.create_session_persisted(**common)
  with pytest.raises(sm.IdempotencyKeyReuseError):
    await sm.create_session_persisted(**common, **changed)


@pytest.mark.asyncio
async def test_expiry_wins_concurrent_answer_and_cancel_without_double_version_bump():
  settings = _settings()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user", settings=settings, db=None,
  )
  question = state["lastQuestion"]
  initial_version = state["version"]
  state["expiresAt"] = 0.0

  answer_result, cancel_result = await asyncio.gather(
    sm.answer_session_persisted(
      state["sessionId"], owner_subject="idem-user",
      question_id=question["id"], option_id=question["options"][0]["id"],
      settings=settings, db=None,
    ),
    sm.cancel_session_persisted(
      state["sessionId"], owner_subject="idem-user", settings=settings, db=None,
    ),
  )

  assert answer_result[0] == sm.ANSWER_EXPIRED
  assert cancel_result[0] == sm.CANCEL_EXPIRED
  assert state["phase"] == "expired"
  assert state["version"] == initial_version + 1
  assert state["answers"] == []


@pytest.mark.asyncio
async def test_invalid_generated_answer_delta_returns_500_class_outcome_and_rolls_back():
  settings = _settings()
  state = await sm.create_session_persisted(
    prompt="추천해줘", owner_subject="idem-user", settings=settings, db=None,
  )
  question = state["lastQuestion"]
  option = question["options"][0]
  option["filterDelta"] = {
    "attribute": "priceKrw",
    "op": "gte",
    "numberValue": 20_000,
    "values": ["forbidden"],
  }
  before = copy.deepcopy(state)

  outcome, after = await sm.answer_session_persisted(
    state["sessionId"], owner_subject="idem-user",
    question_id=question["id"], option_id=option["id"], settings=settings, db=None,
  )

  assert outcome == sm.FILTER_DELTA_CONTRACT_VIOLATION
  assert after == before


@pytest.mark.asyncio
async def test_invalid_generated_refine_delta_rolls_back_residual_and_cache(monkeypatch):
  state, _answered = _drive_to_results()
  before = copy.deepcopy(state)
  monkeypatch.setattr(
    sm,
    "parse_intent",
    lambda _prompt: {
      "lockedFilters": [
        {"attribute": "priceKrw", "op": "between", "numberValue": 20_000},
      ],
      "softPreferences": [],
      "positiveResidual": "차분한 데일리",
    },
  )

  outcome, after = await sm.refine_session_persisted(
    state["sessionId"], owner_subject="idem-user", prompt="차분한 데일리",
    settings=_settings(), db=None,
  )

  assert outcome == sm.FILTER_DELTA_CONTRACT_VIOLATION
  assert after == before


@pytest.mark.asyncio
async def test_refine_enrich_failure_rolls_back_entire_memory_mutation(monkeypatch):
  state, _answered = _drive_to_results()
  before = copy.deepcopy(state)

  async def fail_enrich(_state, _settings, **_kwargs):
    # enrichment_policy 등 정책 키워드는 무시 — 실패 주입만 담당한다.
    raise RuntimeError("injected enrich failure")

  monkeypatch.setattr(sm, "_enrich_if_results", fail_enrich)
  with pytest.raises(RuntimeError, match="injected enrich failure"):
    await sm.refine_session_persisted(
      state["sessionId"],
      owner_subject="idem-user",
      dial="more_diverse",
      settings=_settings(),
      db=None,
    )

  assert sm._SESSIONS[state["sessionId"]] == before


def test_create_contract_violation_leaves_failed_state_and_raises(monkeypatch):
  monkeypatch.setattr(
    sm,
    "parse_intent",
    lambda *_args, **_kwargs: {
      "prompt": "잘못된 내부 delta",
      "lockedFilters": [{"attribute": "priceKrw", "op": "gte", "numberValue": True}],
      "softPreferences": [],
      "unsupportedCategory": None,
      "positiveResidual": "",
    },
  )

  with pytest.raises(sm.FilterDeltaContractViolation):
    sm.create_session(
      prompt="잘못된 내부 delta", owner_subject="idem-user", settings=_settings(),
    )

  failed = next(iter(sm._SESSIONS.values()))
  assert failed["phase"] == "failed"
  assert failed["lastQuestion"] is None
  assert failed["error"]["code"] == "filter_delta_contract_violation"
