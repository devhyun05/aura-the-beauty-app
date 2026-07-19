import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import app.ops.cleanup_stuck_jobs as cleanup_module
from app.ops.cleanup_expired_media_uploads import ExpiredMediaUploadResult
from app.ops.cleanup_stuck_jobs import (
  CleanupResult,
  ERROR_CODE,
  cleanup_stuck_jobs,
  find_stuck_jobs,
  parse_args,
  run,
)


class FakeDB:
  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple[object, ...]]] = []

  async def fetch(self, query: str, *args: object) -> list[dict[str, str]]:
    normalized = " ".join(query.split())
    self.calls.append((normalized, args))
    if "imageGenerationStatus" in query:
      return [{"id": "image-1"}]
    if "analysis_reports" in query:
      return [{"id": "analysis-1"}]
    if "makeup_feedback_reports" in query:
      return [{"id": "feedback-1"}]
    return [{"id": "filter-1"}]


@pytest.mark.asyncio
async def test_find_stuck_jobs_only_reads_old_processing_reports() -> None:
  db = FakeDB()
  cutoff = datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc)

  result = await find_stuck_jobs(db, cutoff=cutoff)

  # analysis(processing) + image-stuck + feedback + filter = 4.
  assert result.total == 4
  assert result.image_stuck_report_ids == ("image-1",)
  # analysis·feedback·filter는 processing만 회수(pending은 SQS-safe 문제로 제외).
  assert "status = 'processing'" in db.calls[0][0]
  # image-stuck 조회는 completed + imageGenerationStatus=processing.
  assert "status = 'completed'" in db.calls[1][0]
  assert "imageGenerationStatus" in db.calls[1][0]
  assert all(args == (cutoff,) for _, args in db.calls)
  assert all(not query.startswith("update") for query, _ in db.calls)


@pytest.mark.asyncio
async def test_cleanup_is_conditional_and_preserves_existing_payload() -> None:
  db = FakeDB()
  cutoff = datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc)

  result = await cleanup_stuck_jobs(db, cutoff=cutoff)

  assert result.analysis_report_ids == ("analysis-1",)
  assert result.feedback_report_ids == ("feedback-1",)
  assert result.filter_extraction_report_ids == ("filter-1",)
  assert result.image_stuck_report_ids == ("image-1",)
  assert all(query.startswith("update") for query, _ in db.calls)
  assert all("returning id" in query for query, _ in db.calls)
  assert all(args[0] == cutoff for _, args in db.calls)
  # 실패 전이 쿼리(analysis/feedback/filter)만 error payload를 쓴다.
  failure_calls = [
    (query, args) for query, args in db.calls if "'failed'" in query
  ]
  assert len(failure_calls) == 3
  assert all("coalesce(" in query and "- 'error'" in query for query, _ in failure_calls)
  assert all(json.loads(str(args[2]))["code"] == ERROR_CODE for _, args in failure_calls)
  # image-stuck 회수는 상태를 바꾸지 않고 imageGenerationStatus만 내린다.
  image_calls = [query for query, _ in db.calls if "imageGenerationStatus" in query]
  assert len(image_calls) == 1
  assert "'failed'" not in image_calls[0]


def test_parse_args_uses_two_hour_default_and_supports_dry_run() -> None:
  defaults = parse_args([])
  custom = parse_args(["--timeout-minutes", "180", "--dry-run"])

  assert defaults.timeout_minutes == 120
  assert defaults.dry_run is False
  assert custom.timeout_minutes == 180
  assert custom.dry_run is True


def test_parse_args_rejects_non_positive_timeout() -> None:
  with pytest.raises(SystemExit):
    parse_args(["--timeout-minutes", "0"])


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("dry_run", "expected_calls"),
  [
    (True, ["find-stuck", "find-expired", "find-expired-uploads"]),
    (False, ["cleanup-stuck", "cleanup-expired", "cleanup-expired-uploads"]),
  ],
)
async def test_run_processes_all_scheduled_cleanup_work(
  monkeypatch: pytest.MonkeyPatch,
  dry_run: bool,
  expected_calls: list[str],
) -> None:
  calls: list[str] = []

  class ClosableDB:
    closed = False

    async def close(self) -> None:
      self.closed = True

  db = ClosableDB()

  async def fake_connect_database() -> tuple[ClosableDB, object]:
    return db, object()

  async def fake_find_stuck_jobs(db_arg: object, *, cutoff: datetime) -> CleanupResult:
    assert db_arg is db
    assert cutoff.tzinfo is not None
    calls.append("find-stuck")
    return CleanupResult((), (), ())

  async def fake_cleanup_stuck_jobs(db_arg: object, *, cutoff: datetime) -> CleanupResult:
    assert db_arg is db
    assert cutoff.tzinfo is not None
    calls.append("cleanup-stuck")
    return CleanupResult((), (), ())

  async def fake_find_expired_sessions(db_arg: object) -> SimpleNamespace:
    assert db_arg is db
    calls.append("find-expired")
    return SimpleNamespace(total=0)

  async def fake_cleanup_expired_sessions(db_arg: object) -> SimpleNamespace:
    assert db_arg is db
    calls.append("cleanup-expired")
    return SimpleNamespace(total=0)

  async def fake_find_expired_uploads(db_arg: object) -> ExpiredMediaUploadResult:
    assert db_arg is db
    calls.append("find-expired-uploads")
    return ExpiredMediaUploadResult(())

  async def fake_cleanup_expired_uploads(
    db_arg: object,
    *,
    s3: object,
  ) -> ExpiredMediaUploadResult:
    assert db_arg is db
    assert s3 is not None
    calls.append("cleanup-expired-uploads")
    return ExpiredMediaUploadResult(())

  monkeypatch.setattr(cleanup_module, "connect_database", fake_connect_database)
  monkeypatch.setattr(cleanup_module, "find_stuck_jobs", fake_find_stuck_jobs)
  monkeypatch.setattr(cleanup_module, "cleanup_stuck_jobs", fake_cleanup_stuck_jobs)
  monkeypatch.setattr(cleanup_module, "find_expired_auradin_sessions", fake_find_expired_sessions)
  monkeypatch.setattr(cleanup_module, "cleanup_expired_auradin_sessions", fake_cleanup_expired_sessions)
  monkeypatch.setattr(cleanup_module, "find_expired_media_uploads", fake_find_expired_uploads)
  monkeypatch.setattr(cleanup_module, "cleanup_expired_media_uploads", fake_cleanup_expired_uploads)

  result = await run(SimpleNamespace(timeout_minutes=120, dry_run=dry_run))

  assert result == 0
  assert calls == expected_calls
  assert db.closed is True
