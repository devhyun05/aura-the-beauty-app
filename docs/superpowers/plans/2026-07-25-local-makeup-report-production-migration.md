# Local Saved Report Production Migration — Plan and Execution Record

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every app-visible report created locally by `du822623@gmail.com` into the deployed PostgreSQL account identified by the same Cognito `(auth_provider, oauth_sub)`, including face analysis, makeup recommendation, makeup extraction, makeup feedback, and their required media/session/analysis dependencies, without deleting or overwriting deployed data.

**Architecture:** A read-only exporter builds a bounded migration bundle from the local database, and a transactional importer resolves the destination user by authentication identity before inserting the graph. Source non-user UUIDs are retained only after collision checks; every inserted JSON/provenance row receives a source-environment migration marker so reruns can distinguish an already imported row from an unrelated collision. S3 objects are planned separately: existing objects in `aura-mobile-media-dev` are reused after `HeadObject`; local-file objects would be copied to deterministic, non-overwriting migration keys before the database transaction.

**Tech Stack:** Python 3.13, asyncpg, boto3, PostgreSQL, AWS Secrets Manager, RDS snapshots, S3, pytest.

## Execution Result — 2026-07-25

- Source user `727abd9b-9134-4d36-9598-9acb42771a7f` was mapped by Google authentication identity to deployed user `606063d1-ccec-4a75-97d3-225796c32828`; the local user UUID was not copied.
- Reviewed batch: `local-makeup-reports:55daed50190cd8bd460d36eea9aaca5991ee79deea7acf45322a0155831a267e`.
- Reviewed bundle SHA-256: `1c82548e2be29375056d5c70878eaeaee950cdf0f11561e915c30318f1e01fcf`.
- Backup guard used encrypted, available RDS snapshot `aura-dev-postgres-1-pre-all-reports-migration-20260725-035358`.
- The single transaction inserted 75 new rows: 23 media assets, 21 photo captures, 8 analysis reports, 9 analysis stage rows, 2 filter extraction reports, and 12 makeup feedback reports.
- The importer preserved and skipped 60 already deployed rows, including all 8 recommendation reports, sessions, and generated assets from the prior recommendation-only migration.
- All 60 referenced S3 objects existed. Report payload image URLs for feedback and extraction were remote CloudFront URLs; `file://` values existed only in non-authoritative capture-device metadata.
- The post-import verifier reported zero remaining inserts for every table. A same-bundle rerun is therefore idempotent.
- Post-import deployed app-query counts were 20 visible face-analysis rows, 8 recommendation rows, 3 completed extraction rows, and 15 completed/scored feedback rows.
- The physical app was relaunched without rebuilding at `aiarmakeup://tabs/profile`; all four My Page report-list requests returned HTTP 200.
- Seven legacy rows are preserved in the deployed database but may remain hidden by current strict mobile contracts (five incomplete legacy face-analysis payloads, one non-AI extraction fallback, and one legacy feedback payload). Their provenance was not falsified or rewritten as successful AI output.
- The snapshot was created before the migration transaction, but user/background writes continued immediately afterward. It protects the reviewed migration starting point; restoring it would require separately preserving post-snapshot user activity.

The task estimates and sample commands below are retained as the implementation history. The execution record above is authoritative where counts or IDs differ.

## Global Constraints

- The destination user must be resolved by exact `(auth_provider, oauth_sub)`; never insert or replace the local user UUID.
- Do not delete or overwrite any existing deployed row or S3 object.
- The first deployed operation must be read-only dry-run; the first write must be an available RDS manual snapshot.
- All database inserts and relationship fixups must occur in one PostgreSQL transaction.
- Any UUID collision with a non-migration row, missing FK prerequisite, identity mismatch, missing S3 object, or schema mismatch aborts before writes.
- A rerun must insert zero duplicates and report previously imported rows as skipped.
- Only sessions linked to the eight selected recommendation reports are in scope; unfinished/unlinked local sessions are excluded.
- The existing unrelated iOS project and Podfile changes must not be staged or committed.

---

### Task 1: Migration bundle and identity/collision planner

**Files:**
- Create: `services/backend/app/ops/makeup_recommendation_migration.py`
- Create: `services/backend/tests/test_makeup_recommendation_migration.py`

**Interfaces:**
- Produces: `MigrationBundle`, `MigrationPlan`, `build_migration_plan(source, destination)`.
- `MigrationBundle` contains only these tables: `media_assets`, `photo_captures`, `analysis_reports`, `analysis_stage_runs`, `face_length_measurement_snapshots`, `makeup_recommendation_sessions`, `makeup_recommendation_reports`, `makeup_recommendation_assets`, and report-bound `product_recommendation_runs`.
- `MigrationPlan.destination_user_id` is resolved from the source `auth_provider` and `oauth_sub`.

- [ ] **Step 1: Write identity and collision tests**

```python
def test_plan_maps_destination_user_by_auth_identity_not_local_uuid():
  source = bundle(local_user_id=LOCAL_USER, auth_provider="google", oauth_sub="google-sub")
  destination = destination_state(user_id=DEPLOYED_USER, auth_provider="google", oauth_sub="google-sub")
  plan = build_migration_plan(source, destination)
  assert plan.destination_user_id == DEPLOYED_USER
  assert plan.destination_user_id != LOCAL_USER


def test_plan_rejects_same_email_with_different_auth_subject():
  source = bundle(auth_provider="google", oauth_sub="source-sub")
  destination = destination_state(auth_provider="google", oauth_sub="other-sub")
  with pytest.raises(MigrationPreconditionError, match="authentication identity"):
    build_migration_plan(source, destination)


def test_plan_rejects_unrelated_existing_uuid():
  source = bundle(report_ids=[REPORT_ID])
  destination = destination_state(existing_ids={"makeup_recommendation_reports": {REPORT_ID}})
  with pytest.raises(MigrationCollisionError, match=str(REPORT_ID)):
    build_migration_plan(source, destination)
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cd services/backend
.venv/bin/python -m pytest tests/test_makeup_recommendation_migration.py -q
```

Expected: import failure because `app.ops.makeup_recommendation_migration` does not exist.

- [ ] **Step 3: Implement immutable bundle and plan types**

```python
@dataclass(frozen=True)
class MigrationBundle:
  batch_id: str
  source_user_id: UUID
  auth_provider: str
  oauth_sub: str
  email: str
  rows: Mapping[str, tuple[dict[str, Any], ...]]
  s3_objects: tuple[S3ObjectReference, ...]


@dataclass(frozen=True)
class MigrationPlan:
  batch_id: str
  destination_user_id: UUID
  insert_counts: Mapping[str, int]
  skip_counts: Mapping[str, int]
  s3_copy_actions: tuple[S3CopyAction, ...]
```

Use `batch_id = "local-makeup-reports:" + sha256(auth_provider + "\0" + oauth_sub + sorted(report_ids)).hexdigest()`.
An existing row is skippable only when its migration marker contains the same `batchId` and `sourceId`; otherwise its UUID is a fatal collision.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
cd services/backend
.venv/bin/python -m pytest tests/test_makeup_recommendation_migration.py -q
```

Expected: all Task 1 tests pass.

### Task 2: Read-only exporter and complete dry-run

**Files:**
- Modify: `services/backend/app/ops/makeup_recommendation_migration.py`
- Create: `services/backend/scripts/migrate_makeup_recommendations.py`
- Modify: `services/backend/tests/test_makeup_recommendation_migration.py`

**Interfaces:**
- Produces: `export_bundle(connection, email) -> MigrationBundle`.
- CLI: `python scripts/migrate_makeup_recommendations.py dry-run --email du822623@gmail.com --bundle /private/tmp/aura-makeup-migration.json`.
- Dry-run opens the local database from `services/backend/.env` and deployed database from Secrets Manager profile `aura-dev`, but performs only `SELECT` and S3 `HeadObject`.

- [ ] **Step 1: Write exporter graph tests**

```python
def test_export_includes_only_sessions_linked_to_selected_reports():
  bundle = export_fixture(
    reports=[report(REPORT_ID, session_id=LINKED_SESSION)],
    sessions=[
      session(LINKED_SESSION, report_id=REPORT_ID, status="completed"),
      session(UNLINKED_SESSION, report_id=None, status="expired"),
    ],
  )
  assert ids(bundle, "makeup_recommendation_sessions") == {LINKED_SESSION}


def test_export_includes_analysis_and_media_prerequisites():
  bundle = export_fixture_with_analysis_graph()
  assert counts(bundle) == {
    "media_assets": 5,
    "photo_captures": 4,
    "analysis_reports": 4,
    "makeup_recommendation_sessions": 7,
    "makeup_recommendation_reports": 7,
    "makeup_recommendation_assets": 7,
    "product_recommendation_runs": 16,
  }
```

- [ ] **Step 2: Implement bounded graph export queries**

Query the exact local user by `lower(email::text)=lower($1)` and require one active row. Select all seven `makeup_recommendation_reports`, then select only sessions whose `report_id` points to those reports or whose IDs appear in `report.session_id`. Build prerequisite sets from `session.analysis_report_id`, `report.source_analysis_report_id`, analysis media IDs, photo captures, and asset input media. Include analysis child rows only for selected analysis IDs.

- [ ] **Step 3: Implement destination dry-run checks**

The destination query must require:

```sql
select id,auth_provider::text,oauth_sub,email::text
from users
where auth_provider=$1 and oauth_sub=$2 and deleted_at is null
```

Assert that the returned email is `du822623@gmail.com`, report all destination row counts, verify static `situation_id` and `keyword_id` references exist, compare table columns between local and deployed schemas, and check every referenced S3 bucket/key with `HeadObject`.

- [ ] **Step 4: Serialize a protected bundle**

Write with mode `0600` using an atomic temporary file plus `os.replace`. The bundle must never contain database passwords, access tokens, presigned URLs, or the destination user UUID. Store JSON values and timestamps in canonical JSON, with a SHA-256 digest printed by the CLI.

- [ ] **Step 5: Run tests and the real dry-run**

Run:

```bash
cd services/backend
.venv/bin/python -m pytest tests/test_makeup_recommendation_migration.py -q
.venv/bin/python scripts/migrate_makeup_recommendations.py dry-run \
  --email du822623@gmail.com \
  --aws-profile aura-dev \
  --region ap-northeast-2 \
  --config-secret-id aura/backend/dev \
  --bundle /private/tmp/aura-makeup-migration.json
```

Expected real plan: local/deployed authentication fingerprints match; destination report count is zero; seven reports, seven linked completed sessions, seven generated assets, sixteen product snapshot runs, four referenced analysis reports, six analysis-stage rows, four photo captures, and five media assets are insert candidates; all sixteen S3 object references exist.

### Task 3: Non-overwriting S3 preparation and transactional importer

**Files:**
- Modify: `services/backend/app/ops/makeup_recommendation_migration.py`
- Modify: `services/backend/scripts/migrate_makeup_recommendations.py`
- Modify: `services/backend/tests/test_makeup_recommendation_migration.py`

**Interfaces:**
- Produces: `prepare_s3_objects(plan, s3) -> PreparedS3Objects`.
- Produces: `import_bundle(connection, bundle, plan) -> ImportResult`.
- CLI write guard: `apply` requires both `--expected-batch-id` and `--backup-snapshot-id`.

- [ ] **Step 1: Write S3 safety and transactional rollback tests**

```python
def test_existing_s3_object_is_reused_without_put():
  prepared = prepare_s3_objects(plan_with_existing_object(), fake_s3)
  assert prepared.reused == 1
  assert fake_s3.put_calls == []


def test_existing_s3_checksum_mismatch_aborts():
  with pytest.raises(MigrationCollisionError, match="S3"):
    prepare_s3_objects(plan_with_checksum_mismatch(), fake_s3)


@pytest.mark.asyncio
async def test_import_rolls_back_every_table_when_final_link_fixup_fails(database):
  with pytest.raises(Exception):
    await import_bundle(database, bundle_with_bad_session_link(), plan())
  assert await migrated_row_count(database) == 0
```

- [ ] **Step 2: Implement deterministic S3 handling**

Reuse the existing `aura-mobile-media-dev` objects after successful `HeadObject`. For a filesystem object, compute SHA-256 and target:

```python
key = f"migrations/makeup-recommendations/{destination_user_id}/{sha256}{suffix}"
```

Call `HeadObject` first. If absent, upload with server-side encryption and metadata `{"aura-migration-batch": plan.batch_id}`; if present, require matching checksum metadata. Never issue `DeleteObject` or overwrite a mismatched key.

- [ ] **Step 3: Implement one-transaction insertion order**

Inside one `connection.transaction()`:

1. Lock the destination user row with `FOR SHARE`.
2. Re-run identity, schema, collision, and destination-zero/marker checks.
3. Insert `media_assets` with `owner_user_id=destination_user_id`.
4. Insert `photo_captures` and `analysis_reports` with `user_id=destination_user_id`.
5. Insert analysis child rows.
6. Insert linked sessions with `user_id=destination_user_id` and `report_id=NULL`.
7. Insert reports with `user_id=destination_user_id`, `session_id=NULL`, and `parent_report_id=NULL`.
8. Insert assets and report-bound product runs with `user_id=destination_user_id`.
9. Update only rows inserted in this transaction to restore session/report and parent-report links.
10. Compare inserted counts to the frozen plan; raise on any mismatch.

Use ordinary `INSERT`, not `ON CONFLICT DO UPDATE`. A rerun checks migration markers first and returns `skipped`; an unrelated conflict aborts.

- [ ] **Step 4: Add migration markers to copied JSON**

Add this object only to copied destination values:

```json
{
  "migration": {
    "batchId": "local-makeup-reports:43c7802b7ce399e288b2f215104d523a57a162624262f3d363643850e6d1b974",
    "sourceEnvironment": "local",
    "sourceId": "1dd498d9-d23e-4ee9-8779-7873f4cd9b5a"
  }
}
```

Use `context_snapshot` for sessions/reports, `provenance` for generated assets, `detail_payload` for analysis reports, and `consent_snapshot` for product runs. Media/photo rows use retained collision-checked UUIDs and are tied to the destination user.

- [ ] **Step 5: Run unit and PostgreSQL integration tests**

Run:

```bash
cd services/backend
.venv/bin/python -m pytest tests/test_makeup_recommendation_migration.py -q
```

Expected: identity mismatch, collision, missing S3 object, duplicate rerun, and rollback tests all pass.

### Task 4: Backup, apply, and post-migration verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-local-makeup-report-production-migration.md`

**Interfaces:**
- Consumes the reviewed dry-run `batchId` and `/private/tmp/aura-makeup-migration.json`.
- Produces an available RDS snapshot ID, an `ImportResult`, and API verification counts.

- [ ] **Step 1: Re-run dry-run immediately before backup**

Run the Task 2 dry-run again and require unchanged source counts, zero collisions, matching authentication fingerprint `02a067e991bdd903`, and all S3 objects present.

- [ ] **Step 2: Create and wait for the RDS backup**

```bash
snapshot_id="aura-dev-postgres-1-pre-makeup-migration-$(date -u +%Y%m%d-%H%M%S)"
aws rds create-db-snapshot \
  --db-instance-identifier aura-dev-postgres-1 \
  --db-snapshot-identifier "$snapshot_id" \
  --tags Key=Project,Value=aura Key=Environment,Value=dev Key=Purpose,Value=pre-makeup-report-migration \
  --profile aura-dev \
  --region ap-northeast-2
aws rds wait db-snapshot-available \
  --db-snapshot-identifier "$snapshot_id" \
  --profile aura-dev \
  --region ap-northeast-2
aws rds describe-db-snapshots \
  --db-snapshot-identifier "$snapshot_id" \
  --profile aura-dev \
  --region ap-northeast-2 \
  --query 'DBSnapshots[0].{id:DBSnapshotIdentifier,status:Status,created:SnapshotCreateTime}' \
  --output json
```

Expected: the new snapshot status is `available`. Do not run `apply` until this is true.

- [ ] **Step 3: Execute the guarded import**

```bash
cd services/backend
.venv/bin/python scripts/migrate_makeup_recommendations.py apply \
  --email du822623@gmail.com \
  --aws-profile aura-dev \
  --region ap-northeast-2 \
  --config-secret-id aura/backend/dev \
  --bundle /private/tmp/aura-makeup-migration.json \
  --expected-batch-id "local-makeup-reports:43c7802b7ce399e288b2f215104d523a57a162624262f3d363643850e6d1b974" \
  --backup-snapshot-id "$snapshot_id"
```

Expected: exactly the reviewed insert counts and no updates/deletes.

- [ ] **Step 4: Verify local/deployed counts and rerun safety**

Run dry-run again. Expected deployed counts are seven reports, seven linked sessions, seven assets, sixteen product runs, four referenced analyses, six analysis-stage rows, four photo captures, and five media assets. Run `apply` once more with the same guards; expected insert count is zero and every row is reported as `skippedAlreadyImported`.

- [ ] **Step 5: Verify the deployed API**

Obtain a Cognito access token for `du822623@gmail.com` through the existing mobile login, then request:

```bash
curl -fsS \
  -H "Authorization: Bearer $AURA_MIGRATION_ACCESS_TOKEN" \
  "https://d3t1pbvtir1lj.cloudfront.net/api/makeup-recommendations?limit=20&offset=0"
```

Expected: seven migrated reports are returned for the deployed account and completed assets resolve through signed S3 URLs. Do not print or persist the token.

- [ ] **Step 6: Remove the temporary bundle**

After verification succeeds, move `/private/tmp/aura-makeup-migration.json` to Trash or securely remove that exact file. Keep the RDS snapshot and record its ID in the execution notes.
