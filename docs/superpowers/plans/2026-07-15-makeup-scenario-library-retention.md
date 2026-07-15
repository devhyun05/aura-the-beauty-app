# Makeup Scenario Library Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the shared AI scenario library and per-user generation rate while preserving unlimited long-term personalization.

**Architecture:** PostgreSQL owns both guarantees. One atomic CTE statement serializes capacity changes with a transaction-scoped advisory lock and either reuses, inserts, replaces, or declines to persist a generated card; one row per user stores a rolling-window request counter. The service returns an ephemeral generated card whenever persistence is intentionally skipped.

**Tech Stack:** Python 3.12, FastAPI, asyncpg/PostgreSQL, pytest, SQL/DBML.

## Global Constraints

- Never touch Metro port 8081; device verification uses port 8082 only.
- Keep at most 2,000 total `source = 'ai'` rows, including disabled rows.
- Never overwrite curated or disabled rows.
- Allow 3 scenario-generation requests per authenticated user per 60 seconds.
- A storage-cap decision must not prevent a safe generated result from being shown to the current user.
- Update runtime schema, canonical SQL, DBML, and schema checks together.

---

### Task 1: Bounded schema and request counter

**Files:**
- Modify: `services/backend/app/services/makeup_recommendation_schema.py`
- Modify: `docs/backend/schema.sql`
- Modify: `docs/backend/aws-postgresql-schema.dbml`
- Modify: `services/backend/app/db/check_schema.py`
- Test: `services/backend/tests/test_db_scripts.py`
- Test: `services/backend/tests/test_makeup_recommendations.py`

**Interfaces:**
- Produces: `makeup_scenario_library.last_served_at`
- Produces: `makeup_scenario_generation_limits(user_id, window_started_at, request_count)`

- [ ] **Step 1: Write failing schema contract tests**

```python
assert "last_served_at" in EXPECTED_COLUMNS["makeup_scenario_library"]
assert "makeup_scenario_generation_limits" in EXPECTED_TABLES
assert EXPECTED_COLUMNS["makeup_scenario_generation_limits"] >= {
  "user_id", "window_started_at", "request_count"
}
```

- [ ] **Step 2: Run the schema tests and confirm failure**

Run: `cd services/backend && pytest -q tests/test_db_scripts.py tests/test_makeup_recommendations.py -k "schema or expected"`
Expected: FAIL because the new table/columns are absent.

- [ ] **Step 3: Add idempotent SQL and DBML definitions**

```sql
alter table makeup_scenario_library add column if not exists last_served_at timestamptz;
create index if not exists idx_makeup_scenario_library_replacement
  on makeup_scenario_library (source, status, usage_count, last_served_at, created_at);

create table if not exists makeup_scenario_generation_limits (
  user_id uuid primary key references users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  constraint chk_makeup_scenario_generation_limit_count check (request_count between 0 and 4)
);
```

- [ ] **Step 4: Run schema tests and confirm pass**

Run: `cd services/backend && pytest -q tests/test_db_scripts.py tests/test_makeup_recommendations.py -k "schema or expected"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/app/services/makeup_recommendation_schema.py services/backend/app/db/check_schema.py services/backend/tests/test_db_scripts.py services/backend/tests/test_makeup_recommendations.py docs/backend/schema.sql docs/backend/aws-postgresql-schema.dbml
git commit -m "feat(makeup): add bounded scenario storage schema"
```

### Task 2: Atomic per-user generation throttle

**Files:**
- Modify: `services/backend/app/services/makeup_recommendation.py`
- Modify: `services/backend/app/api/makeup_recommendations.py`
- Test: `services/backend/tests/test_makeup_recommendations.py`

**Interfaces:**
- Produces: `enforce_scenario_generation_limit(db: Any, user_id: Any) -> None`
- Consumes: `makeup_scenario_generation_limits` from Task 1.

- [ ] **Step 1: Write failing service and route tests**

```python
@pytest.mark.asyncio
async def test_generation_limit_rejects_fourth_live_window():
  db = LimitDatabase(request_count=4)
  with pytest.raises(AppError) as error:
    await enforce_scenario_generation_limit(db, USER_ID)
  assert error.value.status_code == 429
  assert error.value.code == "MAKEUP_SCENARIO_RATE_LIMITED"

def test_scenario_route_checks_limit_before_bedrock(client, monkeypatch):
  # Override auth/db and make the limiter raise; generation must not be called.
  assert client.post("/api/makeup-recommendations/scenarios", json={"count": 12}).status_code == 429
```

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `cd services/backend && pytest -q tests/test_makeup_recommendations.py -k "generation_limit or scenario_route_checks_limit"`
Expected: FAIL because the limiter does not exist.

- [ ] **Step 3: Implement the atomic capped counter and call it before generation**

```python
async def enforce_scenario_generation_limit(db: Any, user_id: Any) -> None:
  row = await db.fetchrow("""
    insert into makeup_scenario_generation_limits (user_id, window_started_at, request_count)
    values ($1, now(), 1)
    on conflict (user_id) do update set
      window_started_at = case
        when makeup_scenario_generation_limits.window_started_at <= now() - interval '60 seconds' then now()
        else makeup_scenario_generation_limits.window_started_at end,
      request_count = case
        when makeup_scenario_generation_limits.window_started_at <= now() - interval '60 seconds' then 1
        else least(makeup_scenario_generation_limits.request_count + 1, 4) end
    returning request_count
  """, user_id)
  if row is None or int(row["request_count"]) > 3:
    raise AppError(429, "MAKEUP_SCENARIO_RATE_LIMITED", "잠시 후 카드를 더 만들어 주세요.")
```

- [ ] **Step 4: Run targeted tests and confirm pass**

Run: `cd services/backend && pytest -q tests/test_makeup_recommendations.py -k "generation_limit or scenario_route_checks_limit"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/app/services/makeup_recommendation.py services/backend/app/api/makeup_recommendations.py services/backend/tests/test_makeup_recommendations.py
git commit -m "feat(makeup): throttle scenario generation"
```

### Task 3: Atomic 2,000-row retention and ephemeral fallback

**Files:**
- Modify: `services/backend/app/services/makeup_recommendation.py`
- Test: `services/backend/tests/test_makeup_recommendations.py`

**Interfaces:**
- Produces: `_persist_generated_scenario(db, item, model_id, user_id) -> dict[str, Any] | None`
- Consumes: `last_served_at` from Task 1.

- [ ] **Step 1: Write failing persistence tests**

```python
@pytest.mark.asyncio
async def test_persist_statement_serializes_and_caps_ai_rows():
  db = CapturingScenarioDatabase(result=None)
  await _persist_generated_scenario(db, GENERATED, "model", USER_ID)
  query = db.last_query.casefold()
  assert "pg_advisory_xact_lock" in query
  assert "count(*)" in query and "source = 'ai'" in query
  assert "2000" in query
  assert "status = 'active'" in query and "source = 'ai'" in query
  assert "last_served_at < now() - interval '7 days'" in query

@pytest.mark.asyncio
async def test_unstored_generated_card_is_returned_with_ephemeral_id():
  # A None persistence result must still be included in the response.
  assert result["items"][-1]["id"].startswith("generated-")
```

- [ ] **Step 2: Run retention tests and confirm failure**

Run: `cd services/backend && pytest -q tests/test_makeup_recommendations.py -k "persist_statement or unstored_generated or shared_scenarios"`
Expected: FAIL because inserts are unbounded and `None` is discarded.

- [ ] **Step 3: Implement one-statement reuse/insert/replace persistence**

```sql
with capacity_lock as materialized (
  select pg_advisory_xact_lock(73120451)
), existing as materialized (
  select id, status from makeup_scenario_library, capacity_lock
  where normalized_text = $2 limit 1
), reused as (
  update makeup_scenario_library set
    usage_count = usage_count + 1, last_served_at = now(), updated_at = now()
  where id = (select id from existing where status = 'active')
  returning id, text, seed_prompt, tags, status
), capacity as materialized (
  select count(*)::integer as ai_count
  from makeup_scenario_library, capacity_lock where source = 'ai'
), inserted as (
  insert into makeup_scenario_library
    (text, normalized_text, seed_prompt, tags, source, model_id, prompt_version,
     status, usage_count, last_served_at, created_by_user_id)
  select $1, $2, $3, $4::jsonb, 'ai', $5, 'makeup-scenario-v2',
         'active', 1, now(), $6
  from capacity
  where ai_count < 2000 and not exists (select 1 from existing)
  on conflict (normalized_text) do nothing
  returning id, text, seed_prompt, tags, status
), replacement_candidate as materialized (
  select library.id
  from makeup_scenario_library library, capacity
  where capacity.ai_count >= 2000
    and library.source = 'ai'
    and library.status = 'active'
    and (library.last_served_at is null
         or library.last_served_at < now() - interval '7 days')
    and not exists (select 1 from existing)
  order by library.usage_count asc,
           library.last_served_at asc nulls first,
           library.created_at asc
  limit 1 for update skip locked
), replaced as (
  update makeup_scenario_library set
    text = $1, normalized_text = $2, seed_prompt = $3, tags = $4::jsonb,
    source = 'ai', model_id = $5, prompt_version = 'makeup-scenario-v2',
    status = 'active', usage_count = 1, last_served_at = now(),
    created_by_user_id = $6, created_at = now(), updated_at = now()
  where id = (select id from replacement_candidate)
  returning id, text, seed_prompt, tags, status
)
select * from reused
union all select * from inserted
union all select * from replaced
limit 1
```

The replacement update resets `usage_count = 1`, `last_served_at = now()`, provenance, text, normalized text, prompt, tags, creator, and timestamps. The query never selects `source = 'curated'` or `status = 'disabled'` as a candidate.

When the statement returns `None`, construct the response from the safe generated item and derive its existing stable `generated-<hash>` ID rather than raising or omitting it.

- [ ] **Step 4: Mark stored shared cards as served**

```sql
update makeup_scenario_library
set usage_count = usage_count + 1, last_served_at = now(), updated_at = now()
where id::text = any($1::text[])
```

- [ ] **Step 5: Run retention and existing scenario tests**

Run: `cd services/backend && pytest -q tests/test_makeup_recommendations.py -k "scenario"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/backend/app/services/makeup_recommendation.py services/backend/tests/test_makeup_recommendations.py
git commit -m "feat(makeup): cap shared scenario library"
```

### Task 4: Regression verification and deployment

**Files:**
- No new source files.

**Interfaces:**
- Consumes: all Tasks 1–3.
- Produces: deployed API/worker revision and physical-device evidence on Metro 8082.

- [ ] **Step 1: Run focused and full backend tests**

Run: `cd services/backend && pytest -q tests/test_makeup_recommendations.py tests/test_db_scripts.py`
Expected: PASS.

Run: `cd services/backend && pytest -q`
Expected: PASS except documented skips.

- [ ] **Step 2: Run repository checks**

Run: `npm --prefix apps/mobile run typecheck`
Expected: PASS.

Run: `git diff --check`
Expected: no output.

- [ ] **Step 3: Push and deploy**

```bash
git push origin feature/makeup-recommendation
gh workflow run deploy-backend-ecs.yml --ref feature/makeup-recommendation
gh run watch <run-id> --exit-status
```

Expected: workflow succeeds and ECS services stabilize.

- [ ] **Step 4: Verify only Metro 8082 and the physical iPhone flow**

```bash
curl -fsS http://127.0.0.1:8082/status
xcrun devicectl device process launch --device FD44CD30-B236-5594-BE61-3C5D408A6851 --terminate-existing com.aiarmakeupguides.mobile
curl -fsS http://127.0.0.1:8082/json/list
```

Expected: Metro 8082 responds, the app launches, and repeated card loads show shared plus fresh cards without duplicates. Port 8081 is never queried.
