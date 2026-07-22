from datetime import date
from uuid import UUID

import pytest
from fastapi import BackgroundTasks

from app.api import analysis as analysis_api
from app.api import feedback as feedback_api
from app.api import makeup_recommendations as recommendation_api
from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.analysis import AnalysisJobCreate, FeedbackJobCreate
from app.schemas.face_analysis_v2 import FaceAnalysisStageRetryRequest
from app.schemas.makeup_recommendation import (
  MakeupRecommendationImageRetryRequest,
  MakeupRecommendationRefinementRequest,
)


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
SESSION_ID = UUID("22222222-2222-2222-2222-222222222222")
REPORT_ID = UUID("33333333-3333-3333-3333-333333333333")


async def _ensure_user(_db, _auth) -> dict:
  return {"id": USER_ID}


async def _quota_must_not_run(*_args, **_kwargs) -> None:
  raise AssertionError("validation/idempotent response must precede quota consumption")


@pytest.mark.asyncio
async def test_analysis_draft_pending_rows_are_atomically_bounded_without_generation_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class DraftLimitDatabase:
    def __init__(self) -> None:
      self.insert_query = ""
      self.insert_args: tuple = ()

    async def fetchrow(self, query: str, *args):
      assert "insert into analysis_reports" in query
      self.insert_query = query
      self.insert_args = args
      return None

  db = DraftLimitDatabase()
  monkeypatch.setattr(analysis_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(
    analysis_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  with pytest.raises(AppError) as exc_info:
    await analysis_api.create_analysis_job(
      AnalysisJobCreate(runImmediately=False),
      BackgroundTasks(),
      auth=type("Auth", (), {"subject": "owner"})(),
      db=db,
      settings=Settings(
        report_draft_pending_limit_per_minute=4,
        report_draft_pending_limit_per_day=12,
        report_draft_pending_limit_per_user=20,
      ),
    )

  assert exc_info.value.code == "REPORT_DRAFT_RATE_LIMITED"
  assert "pg_try_advisory_xact_lock" in db.insert_query
  assert "lock_acquired" in db.insert_query
  assert "($1::uuid)::text" in db.insert_query
  assert "r.user_id = $1::uuid" in db.insert_query
  assert "select $1::uuid, $2, $3, $4" in db.insert_query
  assert "r.status = 'pending'" in db.insert_query
  assert "r.deleted_at is null" in db.insert_query
  assert "interval '1 minute'" in db.insert_query
  assert "interval '1 day'" in db.insert_query
  assert "count(*)::int as total_count" in db.insert_query
  assert "when $8::boolean then true" in db.insert_query
  assert "where $8::boolean" in db.insert_query
  assert "and total_count < $11::int" in db.insert_query
  assert db.insert_args[7:11] == (False, 4, 12, 20)


@pytest.mark.asyncio
async def test_feedback_draft_pending_rows_are_atomically_bounded_without_generation_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class DraftLimitDatabase:
    def __init__(self) -> None:
      self.insert_query = ""
      self.insert_args: tuple = ()

    async def fetchrow(self, query: str, *args):
      assert "insert into makeup_feedback_reports" in query
      self.insert_query = query
      self.insert_args = args
      return None

  db = DraftLimitDatabase()
  monkeypatch.setattr(feedback_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(
    feedback_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  with pytest.raises(AppError) as exc_info:
    await feedback_api.create_feedback_job(
      FeedbackJobCreate(
        runImmediately=False,
        requestPayload={
          "feedbackContext": {"userGoalText": "데이트 메이크업"},
        },
      ),
      BackgroundTasks(),
      auth=type("Auth", (), {"subject": "owner"})(),
      db=db,
      settings=Settings(
        report_draft_pending_limit_per_minute=5,
        report_draft_pending_limit_per_day=15,
        report_draft_pending_limit_per_user=25,
      ),
    )

  assert exc_info.value.code == "REPORT_DRAFT_RATE_LIMITED"
  assert "pg_try_advisory_xact_lock" in db.insert_query
  assert "lock_acquired" in db.insert_query
  assert "($1::uuid)::text" in db.insert_query
  assert "report.user_id = $1::uuid" in db.insert_query
  assert "select $1::uuid, $2, $3, $4, $5" in db.insert_query
  assert "report.status = 'pending'" in db.insert_query
  assert "interval '1 minute'" in db.insert_query
  assert "interval '1 day'" in db.insert_query
  assert "count(*)::int as total_count" in db.insert_query
  assert "when $10::boolean then true" in db.insert_query
  assert "where $10::boolean" in db.insert_query
  assert "and total_count < $13::int" in db.insert_query
  assert db.insert_args[9:] == (False, 5, 15, 25)


@pytest.mark.asyncio
async def test_feedback_immediate_generation_bypasses_only_the_draft_gate(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: dict[str, object] = {}

  class ImmediateDatabase:
    async def fetchrow(self, query: str, *args):
      assert "insert into makeup_feedback_reports" in query
      calls["insert_query"] = query
      calls["insert_args"] = args
      return {
        "id": REPORT_ID,
        "user_id": USER_ID,
        "entry_date": date(2026, 7, 22),
        "feedback_kind": "initial",
        "parent_feedback_report_id": None,
        "status": "pending",
        "feedback_payload": args[8],
      }

  async def resolve_context(*_args, **_kwargs):
    return date(2026, 7, 22), None

  async def resolve_request(*_args, **_kwargs):
    return {"feedbackContext": {"userGoalText": "데이트 메이크업"}}

  async def capture_quota(*_args, **kwargs):
    calls["quota"] = kwargs

  async def capture_dispatch(_db, _background_tasks, report_id, user_id, *_args):
    calls["dispatch"] = (report_id, user_id)

  monkeypatch.setattr(feedback_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(feedback_api, "resolve_feedback_journey_context", resolve_context)
  monkeypatch.setattr(feedback_api, "resolve_feedback_request_payload", resolve_request)
  monkeypatch.setattr(feedback_api, "enforce_report_generation_limit", capture_quota)
  monkeypatch.setattr(feedback_api, "dispatch_feedback_job", capture_dispatch)

  response = await feedback_api.create_feedback_job(
    FeedbackJobCreate(runImmediately=True),
    BackgroundTasks(),
    auth=type("Auth", (), {"subject": "owner"})(),
    db=ImmediateDatabase(),
    settings=Settings(
      makeup_feedback_generation_limit_per_minute=3,
      makeup_feedback_generation_limit_per_day=11,
      report_draft_pending_limit_per_minute=7,
      report_draft_pending_limit_per_day=17,
      report_draft_pending_limit_per_user=27,
    ),
  )

  assert response["data"]["job"]["id"] == str(REPORT_ID)
  assert calls["quota"] == {
    "user_id": USER_ID,
    "feature": "makeup_feedback",
    "per_minute": 3,
    "per_day": 11,
  }
  assert calls["dispatch"] == (REPORT_ID, USER_ID)
  assert "when $10::boolean then true" in calls["insert_query"]
  assert "where $10::boolean" in calls["insert_query"]
  assert calls["insert_args"][9:] == (True, 7, 17, 27)


@pytest.mark.asyncio
async def test_face_retry_checks_report_ownership_before_consuming_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class MissingReportDatabase:
    async def fetchrow(self, _query: str, *_args):
      return None

  monkeypatch.setattr(analysis_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(
    analysis_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  with pytest.raises(AppError) as exc_info:
    await analysis_api.retry_analysis_job_stage(
      REPORT_ID,
      FaceAnalysisStageRetryRequest(stage="ai_measurement"),
      BackgroundTasks(),
      auth=object(),
      db=MissingReportDatabase(),
      settings=Settings(face_analysis_v2_enabled=True),
    )

  assert exc_info.value.code == "ANALYSIS_JOB_NOT_FOUND"


@pytest.mark.asyncio
async def test_face_retry_quota_failure_restores_the_claimed_report_state(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  previous_detail = {
    "request": {
      "measurements": {
        "schemaVersion": "aura-face-analysis-measurements-v1",
      },
    },
  }

  class RetryDatabase:
    def __init__(self) -> None:
      self.fetch_count = 0
      self.rollback: tuple[str, tuple] | None = None

    async def fetchrow(self, query: str, *args):
      self.fetch_count += 1
      if "select *" in query:
        return {
          "id": REPORT_ID,
          "user_id": USER_ID,
          "status": "failed",
          "error_message": "provider timeout",
          "detail_payload": previous_detail,
        }
      if "update analysis_reports" in query:
        assert "user_id = $3" in query
        assert args == (REPORT_ID, "ai_measurement", USER_ID)
        return {
          "id": REPORT_ID,
          "user_id": USER_ID,
          "status": "pending",
          "detail_payload": previous_detail,
        }
      raise AssertionError(query)

    async def execute(self, query: str, *args):
      self.rollback = (query, args)
      return "UPDATE 1"

  async def reject_quota(*_args, **_kwargs):
    raise AppError(429, "REPORT_RATE_LIMITED", "limited")

  db = RetryDatabase()
  monkeypatch.setattr(analysis_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(analysis_api, "enforce_report_generation_limit", reject_quota)

  with pytest.raises(AppError) as exc_info:
    await analysis_api.retry_analysis_job_stage(
      REPORT_ID,
      FaceAnalysisStageRetryRequest(stage="ai_measurement"),
      BackgroundTasks(),
      auth=object(),
      db=db,
      settings=Settings(face_analysis_v2_enabled=True),
    )

  assert exc_info.value.code == "REPORT_RATE_LIMITED"
  assert db.rollback is not None
  rollback_query, rollback_args = db.rollback
  assert "where id = $1 and user_id = $2 and status = 'pending'" in rollback_query
  assert rollback_args[:4] == (
    REPORT_ID,
    USER_ID,
    "failed",
    "provider timeout",
  )


@pytest.mark.asyncio
async def test_session_generation_checks_owned_state_before_consuming_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def reject_foreign_session(_db, _user_id, _session_id):
    raise AppError(404, "MAKEUP_SESSION_NOT_FOUND", "missing")

  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(recommendation_api, "begin_generation", reject_foreign_session)
  monkeypatch.setattr(
    recommendation_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  with pytest.raises(AppError) as exc_info:
    await recommendation_api.generate_makeup_recommendation_session(
      SESSION_ID,
      BackgroundTasks(),
      settings=Settings(),
      auth=object(),
      db=object(),
    )

  assert exc_info.value.code == "MAKEUP_SESSION_NOT_FOUND"


@pytest.mark.asyncio
async def test_session_generation_replay_returns_saved_report_without_spending_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def reuse_generation(_db, _user_id, _session_id):
    return {
      "reportId": REPORT_ID,
      "recommendation": {"generationSource": "claude", "looks": []},
      "generationSource": "claude",
      "imageStatus": "completed",
      "reused": True,
    }

  async def no_op_snapshot_dispatch(**_kwargs):
    return None

  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(recommendation_api, "begin_generation", reuse_generation)
  monkeypatch.setattr(
    recommendation_api,
    "dispatch_makeup_product_snapshot_job",
    no_op_snapshot_dispatch,
  )
  monkeypatch.setattr(
    recommendation_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  response = await recommendation_api.generate_makeup_recommendation_session(
    SESSION_ID,
    BackgroundTasks(),
    settings=Settings(),
    auth=object(),
    db=object(),
  )

  assert response["data"]["reportId"] == str(REPORT_ID)
  assert "reused" not in response["data"]


@pytest.mark.asyncio
async def test_session_generation_quota_failure_releases_the_generation_claim(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  released: list[tuple[UUID, UUID]] = []

  async def claimed_generation(_db, _user_id, _session_id):
    return {
      "session": {
        "id": SESSION_ID,
        "analysis_report_id": REPORT_ID,
        "context_snapshot": {},
        "questions": [],
        "answers": [],
        "image_mode": "generic",
      },
      "reused": False,
    }

  async def reject_quota(*_args, **_kwargs):
    raise AppError(429, "REPORT_RATE_LIMITED", "limited")

  async def release_claim(_db, user_id, session_id):
    released.append((user_id, session_id))

  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(recommendation_api, "begin_generation", claimed_generation)
  monkeypatch.setattr(recommendation_api, "enforce_report_generation_limit", reject_quota)
  monkeypatch.setattr(recommendation_api, "fail_generation", release_claim)

  with pytest.raises(AppError) as exc_info:
    await recommendation_api.generate_makeup_recommendation_session(
      SESSION_ID,
      BackgroundTasks(),
      settings=Settings(),
      auth=object(),
      db=object(),
    )

  assert exc_info.value.code == "REPORT_RATE_LIMITED"
  assert released == [(USER_ID, SESSION_ID)]


@pytest.mark.asyncio
async def test_image_retry_checks_report_ownership_before_consuming_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class MissingReportDatabase:
    async def fetchrow(self, _query: str, *_args):
      return None

  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(
    recommendation_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  with pytest.raises(AppError) as exc_info:
    await recommendation_api.retry_recommendation_images(
      REPORT_ID,
      BackgroundTasks(),
      settings=Settings(),
      auth=object(),
      db=MissingReportDatabase(),
    )

  assert exc_info.value.code == "MAKEUP_RECOMMENDATION_NOT_FOUND"


@pytest.mark.asyncio
async def test_completed_look_retry_is_idempotent_and_does_not_spend_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class CompletedLookDatabase:
    async def fetchrow(self, _query: str, *_args):
      return {"look_id": "anchor", "status": "completed"}

  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(
    recommendation_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  response = await recommendation_api.retry_recommendation_images(
    REPORT_ID,
    BackgroundTasks(),
    MakeupRecommendationImageRetryRequest(lookId="anchor"),
    settings=Settings(),
    auth=object(),
    db=CompletedLookDatabase(),
  )

  assert response["data"] == {
    "reportId": str(REPORT_ID),
    "lookId": "anchor",
    "imageStatus": "completed",
  }


@pytest.mark.asyncio
async def test_image_retry_quota_failure_restores_the_claimed_look_state(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class RetryDatabase:
    def __init__(self) -> None:
      self.rollback: tuple[str, tuple] | None = None

    async def fetchrow(self, query: str, *_args):
      if "select asset.look_id" in query:
        return {
          "look_id": "anchor",
          "status": "failed",
          "image_error": "provider timeout",
          "updated_at": "2026-07-22T00:00:00Z",
        }
      if "update makeup_recommendation_assets asset" in query:
        return {"id": UUID("44444444-4444-4444-4444-444444444444")}
      raise AssertionError(query)

    async def execute(self, query: str, *args):
      self.rollback = (query, args)
      return "UPDATE 1"

  async def reject_quota(*_args, **_kwargs):
    raise AppError(429, "REPORT_RATE_LIMITED", "limited")

  db = RetryDatabase()
  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(recommendation_api, "enforce_report_generation_limit", reject_quota)

  with pytest.raises(AppError) as exc_info:
    await recommendation_api.retry_recommendation_images(
      REPORT_ID,
      BackgroundTasks(),
      MakeupRecommendationImageRetryRequest(lookId="anchor"),
      settings=Settings(),
      auth=object(),
      db=db,
    )

  assert exc_info.value.code == "REPORT_RATE_LIMITED"
  assert db.rollback is not None
  rollback_query, rollback_args = db.rollback
  assert "and asset.status = 'pending'" in rollback_query
  assert rollback_args[3:] == (
    "failed",
    "provider timeout",
    "2026-07-22T00:00:00Z",
  )


@pytest.mark.asyncio
async def test_refinement_checks_parent_ownership_before_consuming_quota(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class MissingReportDatabase:
    async def fetchrow(self, _query: str, *_args):
      return None

  monkeypatch.setattr(recommendation_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(
    recommendation_api,
    "enforce_report_generation_limit",
    _quota_must_not_run,
  )

  with pytest.raises(AppError) as exc_info:
    await recommendation_api.refine_recommendation_report(
      REPORT_ID,
      MakeupRecommendationRefinementRequest(refinement="natural"),
      BackgroundTasks(),
      settings=Settings(),
      auth=object(),
      db=MissingReportDatabase(),
    )

  assert exc_info.value.code == "MAKEUP_RECOMMENDATION_NOT_FOUND"
