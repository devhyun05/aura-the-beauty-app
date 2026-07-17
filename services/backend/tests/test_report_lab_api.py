from uuid import uuid4

import httpx
import pytest

from app.api import lab_analysis as lab_analysis_module
from app.core.settings import Settings
from app.db.session import get_database, require_database
from app import main as main_module
from app.main import create_app
from app.services.report_lab_rate_limit import ReportLabLoopbackRateLimiter
from app.services.report_lab_runs import REPORT_LAB_PRUNE_SESSIONS_SQL


class FakeLabDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple]] = []

  async def fetch(self, query: str, *args):
    self.calls.append((query, args))
    if "insert into analysis_lab_runs" in query:
      return [
        {
          "id": uuid4(),
          "client_request_id": args[3],
          "batch_ordinal": ordinal,
        }
        for ordinal in range(1, int(args[1]) + 1)
      ]
    return []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))
    if "insert into analysis_lab_sessions" in query:
      return {"id": args[0], "principal_id": args[1], "status": "active", "expires_at": None}
    if "from analysis_lab_sessions" in query or "update analysis_lab_sessions" in query:
      return {"id": args[0]}
    if "update analysis_lab_runs" in query:
      return {"id": args[0], "status": args[1]}
    return None

  async def fetchval(self, query: str, *args):
    self.calls.append((query, args))
    return 0

  async def execute(self, query: str, *args):
    self.calls.append((query, args))
    return "UPDATE 1"

  async def run_in_transaction(self, operation):
    self.calls.append(("BEGIN", ()))
    return await operation(self)


def settings(**overrides) -> Settings:
  return Settings(
    _env_file=None,
    environment="test",
    lab_mode=True,
    ai_provider="disabled",
    image_generation_provider="disabled",
    **overrides,
  )


def lab_app(*, database: FakeLabDatabase | None = None, **setting_overrides):
  app = create_app(settings(**setting_overrides))
  if database is not None:
    app.dependency_overrides[require_database] = lambda: database
    app.dependency_overrides[get_database] = lambda: database
  return app


def stage_payload(**overrides):
  payload = {
    "fixtureId": "synthetic-balanced-v1",
    "sessionId": "92fd95fb-a845-45d9-9ea4-a88953a8f295",
    "clientRequestId": "72fd95fb-a845-45d9-9ea4-a88953a8f296",
    "stage": "consult",
    "overrides": {"promptVersion": "fixture-api-v1"},
  }
  payload.update(overrides)
  return payload


@pytest.mark.asyncio
async def test_lab_database_connection_uses_the_explicit_validated_settings(monkeypatch) -> None:
  explicit = settings(
    database_url=(
      "postgresql://aura_report_lab:local-password@"
      "127.0.0.1:55432/aura_report_lab"
    ),
  )
  sentinel_config = object()
  sentinel_pool = object()
  seen = []

  async def fake_close():
    main_module.database.pool = None

  async def fake_create_pool(config):
    seen.append(config)
    return sentinel_pool

  monkeypatch.setattr(
    main_module,
    "resolve_database_connection_config",
    lambda value: sentinel_config if value is explicit else None,
  )
  monkeypatch.setattr(main_module.database, "close", fake_close)
  monkeypatch.setattr(main_module.database, "_create_pool", fake_create_pool)

  try:
    await main_module._connect_report_lab_database(explicit)

    assert seen == [sentinel_config]
    assert main_module.database.pool is sentinel_pool
  finally:
    # The backend database singleton is shared by subsequently collected tests.
    # Do not let this isolated connection-contract test poison their state.
    main_module.database.pool = None


@pytest.mark.asyncio
async def test_lab_app_exposes_only_the_isolated_lab_api_surface() -> None:
  app = lab_app()
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    paths = (await client.get("/openapi.json")).json()["paths"]

  assert "/api/lab/health" in paths
  assert "/api/lab/analysis/stage-run" in paths
  assert "/api/lab/analysis/session" in paths
  assert "/api/lab/analysis/runs/cancel" in paths
  assert "/api/lab/analysis/runs" in paths
  assert "/api/analysis/jobs" not in paths
  assert "/api/products/recommendations" not in paths
  assert "/health" not in paths


@pytest.mark.asyncio
async def test_normal_app_does_not_expose_report_lab_routes() -> None:
  app = create_app(Settings(_env_file=None))
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app),
    base_url="http://127.0.0.1:8000",
  ) as client:
    paths = (await client.get("/openapi.json")).json()["paths"]

  assert "/api/lab/health" not in paths
  assert "/api/lab/analysis/stage-run" not in paths
  assert "/api/lab/analysis/session" not in paths
  assert "/api/lab/analysis/runs" not in paths


@pytest.mark.asyncio
async def test_loopback_peer_and_numeric_host_are_both_required() -> None:
  app = lab_app()
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("203.0.113.20", 41000)),
    base_url="http://127.0.0.1:8000",
    headers={"X-Forwarded-For": "127.0.0.1"},
  ) as client:
    remote = await client.get("/api/lab/health")
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://localhost:8000",
  ) as client:
    alias = await client.get("/api/lab/health")
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
    headers={"Origin": "https://attacker.example"},
  ) as client:
    malicious_origin = await client.get("/api/lab/health")

  assert remote.status_code == 403
  assert remote.json()["error"]["code"] == "REPORT_LAB_LOOPBACK_REQUIRED"
  assert alias.status_code == 403
  assert malicious_origin.status_code == 403
  assert malicious_origin.json()["error"]["code"] == "REPORT_LAB_ORIGIN_FORBIDDEN"


@pytest.mark.asyncio
async def test_cors_allows_only_the_exact_report_lab_origin() -> None:
  app = lab_app()
  transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 41000))
  async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
    allowed = await client.options(
      "/api/lab/analysis/stage-run",
      headers={
        "Origin": "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    )
    localhost_alias = await client.options(
      "/api/lab/analysis/stage-run",
      headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    )

  assert allowed.status_code == 200
  assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
  assert localhost_alias.status_code == 400
  assert "access-control-allow-origin" not in localhost_alias.headers


@pytest.mark.asyncio
async def test_malicious_browser_origin_and_simple_form_post_are_rejected_before_mutation() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db)
  transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 41000))
  async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
    malicious = await client.post(
      "/api/lab/analysis/session",
      content="",
      headers={
        "Origin": "https://attacker.example",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    )
    simple_form = await client.post(
      "/api/lab/analysis/session",
      content="",
      headers={
        "Origin": "http://127.0.0.1:5173",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    )

  assert malicious.status_code == 403
  assert malicious.json()["error"]["code"] == "REPORT_LAB_ORIGIN_FORBIDDEN"
  assert simple_form.status_code == 415
  assert simple_form.json()["error"]["code"] == "REPORT_LAB_JSON_REQUIRED"
  assert not any("insert into analysis_lab_sessions" in query for query, _ in db.calls)
  assert not hasattr(app.state, "report_lab_rate_limiter")


@pytest.mark.asyncio
async def test_no_origin_cli_json_mutation_remains_allowed() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post("/api/lab/analysis/session", json={})

  assert response.status_code == 200
  assert any("insert into analysis_lab_sessions" in query for query, _ in db.calls)


@pytest.mark.asyncio
async def test_lab_health_reports_the_exact_runtime_commit_sha() -> None:
  commit_sha = "a" * 40
  app = lab_app(report_lab_commit_sha=commit_sha)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.get("/api/lab/health")

  assert response.status_code == 200
  assert response.json()["data"]["buildSha"] == commit_sha


@pytest.mark.asyncio
async def test_fixture_stage_run_is_provider_disabled_and_hides_raw_by_default() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post("/api/lab/analysis/stage-run", json=stage_payload())

  assert response.status_code == 200
  data = response.json()["data"]
  assert data["provider"] == data["model"] == "disabled"
  assert data["externalProviderRuns"] == 0
  assert data["tokenUsage"] is None
  assert "rawResponse" not in data
  assert "rawResponse" not in data["runs"][0]
  assert response.headers["Cache-Control"] == "private, no-store"
  assert data["inputHash"]
  assert data["cacheHit"] is False
  assert data["clientRequestId"] == stage_payload()["clientRequestId"]
  assert data["batchOrdinal"] == 1


@pytest.mark.asyncio
async def test_repeat_count_executes_each_fixture_run(monkeypatch) -> None:
  calls = 0
  original = lab_analysis_module.run_report_lab_fixture_stage

  async def counted_runner(*args, **kwargs):
    nonlocal calls
    calls += 1
    return await original(*args, **kwargs)

  monkeypatch.setattr(lab_analysis_module, "run_report_lab_fixture_stage", counted_runner)
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(repeatCount=3),
    )

  assert response.status_code == 200
  assert calls == 3
  assert len(response.json()["data"]["runs"]) == 3
  assert [run["batchOrdinal"] for run in response.json()["data"]["runs"]] == [1, 2, 3]


@pytest.mark.asyncio
async def test_session_is_server_issued_then_reused_by_the_stage_request() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    issued = await client.post("/api/lab/analysis/session", json={})
    session_id = issued.json()["data"]["sessionId"]
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(sessionId=session_id),
    )

  assert issued.status_code == response.status_code == 200
  assert response.json()["data"]["sessionId"] == session_id
  queries = [query for query, _ in db.calls]
  assert next(index for index, query in enumerate(queries) if "delete from analysis_lab_runs" in query) < next(
    index for index, query in enumerate(queries) if "insert into analysis_lab_sessions" in query
  )
  insert_call = next(call for call in db.calls if "insert into analysis_lab_runs" in call[0])
  assert str(insert_call[1][0]) == session_id


@pytest.mark.asyncio
async def test_budget_lock_is_acquired_before_a_fresh_count_and_insert() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post("/api/lab/analysis/stage-run", json=stage_payload())

  assert response.status_code == 200
  queries = [query for query, _ in db.calls]
  begin = queries.index("BEGIN")
  lock = next(index for index, query in enumerate(queries) if "pg_advisory_xact_lock" in query)
  count = next(index for index, query in enumerate(queries) if "select count(*)::integer" in query)
  insert = next(index for index, query in enumerate(queries) if "insert into analysis_lab_runs" in query)
  assert begin < lock < count < insert


@pytest.mark.asyncio
async def test_budget_exhaustion_under_the_lock_inserts_no_rows() -> None:
  class ExhaustedDatabase(FakeLabDatabase):
    async def fetchval(self, query: str, *args):
      self.calls.append((query, args))
      return 50

  db = ExhaustedDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post("/api/lab/analysis/stage-run", json=stage_payload())

  assert response.status_code == 429
  assert response.json()["error"]["code"] == "REPORT_LAB_SESSION_BUDGET_EXCEEDED"
  assert not any("insert into analysis_lab_runs" in query for query, _ in db.calls)


@pytest.mark.asyncio
async def test_arbitrary_client_uuid_cannot_reset_the_server_issued_session_budget() -> None:
  class UnregisteredSessionDatabase(FakeLabDatabase):
    async def fetchrow(self, query: str, *args):
      if "from analysis_lab_sessions" in query:
        self.calls.append((query, args))
        return None
      return await super().fetchrow(query, *args)

  db = UnregisteredSessionDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(sessionId=str(uuid4())),
    )

  assert response.status_code == 403
  assert response.json()["error"]["code"] == "REPORT_LAB_SESSION_INVALID"
  assert not any("insert into analysis_lab_runs" in query for query, _ in db.calls)


@pytest.mark.asyncio
async def test_exact_input_cache_is_reused_and_persisted_with_provenance() -> None:
  cached_id = uuid4()

  class CacheDatabase(FakeLabDatabase):
    async def fetchrow(self, query: str, *args):
      if "from analysis_lab_runs" in query and "status = 'completed'" in query:
        self.calls.append((query, args))
        return {
          "id": cached_id,
          "status": "completed",
          "schema_version": "aura-face-report-view-v1",
          "input_hash": args[4],
          "raw_response": {},
          "normalized_output": lab_analysis_module.load_report_lab_fixture(
            settings(), "synthetic-balanced-v1",
          ).report_view,
          "validation_errors": [],
          "latency_ms": 1,
          "token_usage": None,
          "external_provider_runs": 0,
          "provider": "disabled",
          "model": "disabled",
        }
      if "update analysis_lab_runs" in query:
        self.calls.append((query, args))
        return {"id": args[0], "status": args[1]}
      return await super().fetchrow(query, *args)

  db = CacheDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(bypassCache=False),
    )

  assert response.status_code == 200
  run = response.json()["data"]["runs"][0]
  assert run["cacheHit"] is True
  assert run["cachedFromRunId"] == str(cached_id)
  completion = next(call for call in db.calls if "cache_hit = $7" in call[0])
  assert completion[1][6:] == (True, cached_id)


@pytest.mark.asyncio
async def test_run_history_never_returns_raw_response_or_prompt_bodies() -> None:
  session_id = uuid4()
  client_request_id = uuid4()
  run_id = uuid4()

  class HistoryDatabase(FakeLabDatabase):
    async def fetch(self, query: str, *args):
      self.calls.append((query, args))
      if "from analysis_lab_runs" in query:
        return [
          {
            "id": run_id,
            "session_id": session_id,
            "client_request_id": client_request_id,
            "batch_ordinal": 1,
            "fixture_id": "synthetic-balanced-v1",
            "stage": "consult",
            "status": "completed",
            "schema_version": "aura-report-lab-fixture-v1",
            "prompt_version": "fixture-api-v1",
            "provider": "disabled",
            "model": "disabled",
            "input_hash": "a" * 64,
            "cache_hit": False,
            "cached_from_run_id": None,
            "normalized_output": {"summary": "safe"},
            "validation_errors": [],
            "latency_ms": 0,
            "token_usage": None,
            "external_provider_runs": 0,
            "started_at": None,
            "completed_at": None,
          },
        ]
      return await super().fetch(query, *args)

  db = HistoryDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.get(
      "/api/lab/analysis/runs",
      params={
        "sessionId": str(session_id),
        "clientRequestId": str(client_request_id),
      },
    )

  assert response.status_code == 200
  body = response.json()["data"]
  assert body["runs"][0]["runId"] == str(run_id)
  assert body["runs"][0]["clientRequestId"] == str(client_request_id)
  history_call = next(call for call in db.calls if "from analysis_lab_runs" in call[0])
  assert history_call[1][2] == client_request_id
  assert "client_request_id = $3" in history_call[0]
  assert "rawResponse" not in response.text
  assert "promptDeveloper" not in response.text


@pytest.mark.asyncio
async def test_raw_response_requires_exact_nonempty_admin_token_without_leaking_it() -> None:
  secret = "local-admin-secret"
  db = FakeLabDatabase()
  app = lab_app(database=db, report_lab_raw_response_admin_token=secret)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    wrong = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(),
      headers={"X-Aura-Lab-Admin-Token": "wrong"},
    )
    exact = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(),
      headers={"X-Aura-Lab-Admin-Token": secret},
    )

  assert "rawResponse" not in wrong.json()["data"]
  assert "rawResponse" in exact.json()["data"]
  assert secret not in wrong.text
  assert secret not in exact.text
  assert secret not in repr(db.calls)


@pytest.mark.asyncio
async def test_stage_run_prunes_expired_prompt_rows_before_cache_or_reservation() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(),
    )

  assert response.status_code == 200
  prune_index = next(
    index for index, (query, _) in enumerate(db.calls)
    if "delete from analysis_lab_runs where expires_at <= now()" in query
  )
  reserve_index = next(
    index for index, (query, _) in enumerate(db.calls)
    if "insert into analysis_lab_runs" in query
  )
  assert prune_index < reserve_index


@pytest.mark.asyncio
async def test_report_id_mode_is_absent_from_the_fixture_only_contract() -> None:
  db = FakeLabDatabase()
  app = lab_app(database=db, auth_required=False)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(reportId=str(uuid4())),
    )

  assert response.status_code == 422
  assert response.json()["error"]["code"] == "VALIDATION_ERROR"
  assert not any("from analysis_reports" in query for query, _ in db.calls)


@pytest.mark.asyncio
async def test_cancel_endpoint_moves_processing_rows_to_a_terminal_state() -> None:
  class CancelDatabase(FakeLabDatabase):
    async def execute(self, query: str, *args):
      self.calls.append((query, args))
      return "UPDATE 2" if "status = 'cancelled'" in query else "UPDATE 1"

  db = CancelDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 41000)),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/runs/cancel",
      json={"sessionId": stage_payload()["sessionId"]},
    )

  assert response.status_code == 200
  assert response.json()["data"]["cancelledRuns"] == 2
  query, _ = next(
    call for call in db.calls
    if "update analysis_lab_runs" in call[0] and "status = 'cancelled'" in call[0]
  )
  assert "where session_id = $1 and status = 'processing'" in query
  prune_statement = next(
    statement for statement, _ in db.calls
    if "delete from analysis_lab_sessions" in statement
  )
  assert "status = 'cancelled'" in prune_statement
  assert "not exists" in prune_statement


@pytest.mark.asyncio
async def test_runner_failure_marks_every_unfinished_reservation_failed(monkeypatch) -> None:
  calls = 0
  original = lab_analysis_module.run_report_lab_fixture_stage

  async def failing_runner(*args, **kwargs):
    nonlocal calls
    calls += 1
    if calls == 2:
      raise RuntimeError("synthetic runner failure")
    return await original(*args, **kwargs)

  monkeypatch.setattr(lab_analysis_module, "run_report_lab_fixture_stage", failing_runner)
  db = FakeLabDatabase()
  app = lab_app(database=db)
  async with httpx.AsyncClient(
    transport=httpx.ASGITransport(
      app=app,
      client=("127.0.0.1", 41000),
      raise_app_exceptions=False,
    ),
    base_url="http://127.0.0.1:8000",
  ) as client:
    response = await client.post(
      "/api/lab/analysis/stage-run",
      json=stage_payload(repeatCount=3, bypassCache=True),
    )

  assert response.status_code == 500
  cleanup_calls = [
    call for call in db.calls
    if "status = 'failed'" in call[0] and "status = 'processing'" in call[0]
  ]
  assert len(cleanup_calls) == 2


@pytest.mark.asyncio
async def test_loopback_rate_limiter_has_a_real_sliding_window_bound() -> None:
  now = 10.0
  limiter = ReportLabLoopbackRateLimiter(
    max_requests=2,
    window_seconds=5,
    clock=lambda: now,
  )
  await limiter.check("127.0.0.1")
  await limiter.check("127.0.0.1")
  with pytest.raises(Exception) as error:
    await limiter.check("127.0.0.1")
  assert getattr(error.value, "code", None) == "REPORT_LAB_RATE_LIMITED"

  now = 16.0
  await limiter.check("127.0.0.1")


def test_prune_contract_preserves_unexpired_cancelled_history_rows() -> None:
  normalized = " ".join(REPORT_LAB_PRUNE_SESSIONS_SQL.lower().split())
  assert "session_row.expires_at <= now()" in normalized
  assert "session_row.status = 'cancelled'" in normalized
  assert "not exists" in normalized
  assert "run_row.session_id = session_row.id" in normalized
