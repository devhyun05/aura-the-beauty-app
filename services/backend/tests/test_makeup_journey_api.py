import json
from datetime import date, datetime, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import feedback as feedback_api
from app.api import makeup_journey as journey_api
from app.core.errors import AppError
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.schemas.analysis import FeedbackJobCreate
from app.schemas.makeup_journey import (
  MakeupJourneyMissionGenerate,
  MakeupJourneyMissionUpdate,
  MakeupJourneyNoteUpdate,
  MakeupJourneyScoreSelectionUpdate,
  MakeupJourneySettingsUpdate,
)


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
PARENT_ID = UUID("22222222-2222-2222-2222-222222222222")


async def _ensure_user(_db, _auth):
  return {"id": USER_ID, "gender": None}


def _settings(goal_score: int = 80) -> dict:
  return {
    "goal_score": goal_score,
    "mission_level": "beginner",
    "timezone_name": "Asia/Seoul",
    "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
  }


def test_settings_schema_accepts_score_boundaries_and_rejects_bad_values() -> None:
  assert MakeupJourneySettingsUpdate(goalScore=1, missionLevel="beginner").goal_score == 1
  assert MakeupJourneySettingsUpdate(goalScore=100, missionLevel="advanced").goal_score == 100
  with pytest.raises(ValidationError):
    MakeupJourneySettingsUpdate(goalScore=0, missionLevel="beginner")
  with pytest.raises(ValidationError):
    MakeupJourneySettingsUpdate(goalScore=80, missionLevel="expert")
  with pytest.raises(ValidationError):
    MakeupJourneySettingsUpdate(
      goalScore=80,
      missionLevel="beginner",
      timezoneName="Mars/Olympus",
    )


def test_report_generation_limit_settings_are_not_dropped() -> None:
  settings = Settings(
    face_analysis_generation_limit_per_minute=11,
    face_analysis_generation_limit_per_day=101,
    filter_extraction_generation_limit_per_minute=12,
    filter_extraction_generation_limit_per_day=102,
    makeup_feedback_generation_limit_per_minute=13,
    makeup_feedback_generation_limit_per_day=103,
    makeup_recommendation_generation_limit_per_minute=14,
    makeup_recommendation_generation_limit_per_day=104,
    report_draft_pending_limit_per_minute=15,
    report_draft_pending_limit_per_day=105,
    report_draft_pending_limit_per_user=205,
  )

  assert {
    "face_analysis": (
      settings.face_analysis_generation_limit_per_minute,
      settings.face_analysis_generation_limit_per_day,
    ),
    "filter_extraction": (
      settings.filter_extraction_generation_limit_per_minute,
      settings.filter_extraction_generation_limit_per_day,
    ),
    "makeup_feedback": (
      settings.makeup_feedback_generation_limit_per_minute,
      settings.makeup_feedback_generation_limit_per_day,
    ),
    "makeup_recommendation": (
      settings.makeup_recommendation_generation_limit_per_minute,
      settings.makeup_recommendation_generation_limit_per_day,
    ),
    "report_draft_pending": (
      settings.report_draft_pending_limit_per_minute,
      settings.report_draft_pending_limit_per_day,
      settings.report_draft_pending_limit_per_user,
    ),
  } == {
    "face_analysis": (11, 101),
    "filter_extraction": (12, 102),
    "makeup_feedback": (13, 103),
    "makeup_recommendation": (14, 104),
    "report_draft_pending": (15, 105, 205),
  }


def _http_auth() -> AuthContext:
  return AuthContext(
    subject="journey-http-user",
    provider="google",
    email=None,
    name=None,
    claims={"sub": "journey-http-user"},
  )


class SettingsHttpDatabase:
  def __init__(self) -> None:
    self.row = _settings(80)
    self.upsert_args = None

  async def fetchrow(self, query, *args):
    if "from makeup_journey_settings" in query:
      assert args == (USER_ID,)
      return self.row
    if "insert into makeup_journey_settings" in query:
      self.upsert_args = args
      self.row = {
        **_settings(args[1]),
        "mission_level": args[2],
        "timezone_name": args[3],
      }
      return self.row
    raise AssertionError(query)


@pytest.mark.parametrize("method", ["GET", "PUT"])
def test_settings_http_routes_require_auth_before_read_or_write(method: str) -> None:
  app = create_app(
    Settings(
      auth_required=True,
      database_url=None,
      makeup_journey_enabled=True,
    ),
  )
  client = TestClient(app)

  response = client.request(
    method,
    "/api/makeup-journey/settings",
    json={"goalScore": 80, "missionLevel": "beginner"} if method == "PUT" else None,
  )

  assert response.status_code == 401
  assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("method", ["GET", "PUT"])
def test_settings_http_routes_fail_closed_when_database_is_unavailable(method: str) -> None:
  app = create_app(
    Settings(
      auth_required=False,
      database_url=None,
      makeup_journey_enabled=True,
    ),
  )
  client = TestClient(app)

  response = client.request(
    method,
    "/api/makeup-journey/settings",
    json={"goalScore": 80, "missionLevel": "beginner"} if method == "PUT" else None,
  )

  assert response.status_code == 503
  assert response.json()["error"]["code"] == "DATABASE_NOT_CONFIGURED"


@pytest.mark.parametrize(
  "payload",
  [
    {"goalScore": 0, "missionLevel": "beginner"},
    {"goalScore": 101, "missionLevel": "beginner"},
    {"goalScore": 80, "missionLevel": "expert"},
  ],
)
def test_settings_put_http_rejects_invalid_goal_and_difficulty(
  monkeypatch,
  payload: dict,
) -> None:
  app = create_app(Settings(makeup_journey_enabled=True))
  app.dependency_overrides[get_current_user] = _http_auth
  app.dependency_overrides[require_database] = SettingsHttpDatabase
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  client = TestClient(app)

  response = client.put("/api/makeup-journey/settings", json=payload)

  assert response.status_code == 422
  assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_settings_get_and_put_http_return_success_envelope_with_camel_case(monkeypatch) -> None:
  db = SettingsHttpDatabase()
  app = create_app(Settings(makeup_journey_enabled=True))
  app.dependency_overrides[get_current_user] = _http_auth
  app.dependency_overrides[require_database] = lambda: db
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  client = TestClient(app)

  fetched = client.get("/api/makeup-journey/settings")
  updated = client.put(
    "/api/makeup-journey/settings",
    json={
      "goalScore": 91,
      "missionLevel": "advanced",
      "timezoneName": "Asia/Tokyo",
    },
  )

  assert fetched.status_code == 200
  assert fetched.json() == {
    "data": {
      "settings": {
        "goalScore": 80,
        "missionLevel": "beginner",
        "timezoneName": "Asia/Seoul",
        "createdAt": "2026-07-01T00:00:00Z",
        "updatedAt": "2026-07-01T00:00:00Z",
      },
      "requiresOnboarding": False,
    },
    "meta": {},
    "error": None,
  }
  assert updated.status_code == 200
  updated_body = updated.json()
  assert updated_body["data"]["settings"]["goalScore"] == 91
  assert updated_body["data"]["settings"]["missionLevel"] == "advanced"
  assert updated_body["data"]["settings"]["timezoneName"] == "Asia/Tokyo"
  assert updated_body["data"]["requiresOnboarding"] is False
  assert updated_body["meta"] == {}
  assert updated_body["error"] is None
  assert db.upsert_args == (USER_ID, 91, "advanced", "Asia/Tokyo")


def test_backend_makeup_journey_kill_switch_is_fail_closed() -> None:
  journey_api.require_makeup_journey_enabled(Settings(makeup_journey_enabled=True))
  with pytest.raises(AppError) as disabled:
    journey_api.require_makeup_journey_enabled(Settings(makeup_journey_enabled=False))
  assert disabled.value.status_code == 404
  assert disabled.value.code == "MAKEUP_JOURNEY_DISABLED"


def test_date_contract_handles_month_edges_and_leap_year_without_timezone_conversion() -> None:
  assert journey_api._month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 3, 1))
  assert journey_api._parse_date("2024-02-29") == date(2024, 2, 29)
  with pytest.raises(AppError):
    journey_api._parse_date("2023-02-29")


@pytest.mark.parametrize(
  "invalid_value",
  [
    date(2026, 7, 17),
    "2026-07-17T00:00:00",
    "20260717",
    1784246400,
    True,
  ],
)
def test_feedback_entry_date_accepts_only_exact_date_strings(invalid_value) -> None:
  assert FeedbackJobCreate(entryDate="2026-07-17").entry_date == date(2026, 7, 17)
  with pytest.raises(ValidationError):
    FeedbackJobCreate(entryDate=invalid_value)


@pytest.mark.parametrize("month", ["0000-01", "9999-12"])
def test_month_bounds_reject_unqueryable_year_edges_as_contract_errors(month: str) -> None:
  with pytest.raises(AppError) as exc_info:
    journey_api._month_bounds(month)

  assert exc_info.value.status_code == 422
  assert exc_info.value.code == "MAKEUP_JOURNEY_MONTH_INVALID"


def test_digest_uses_only_stored_allow_list_and_handles_missing_fields() -> None:
  row = {
    "id": PARENT_ID,
    "feedback_payload": {
      "result": {
        "score": 84,
        "scoreReason": "점수 근거",
        "summary": {"strengthSummary": "피부 표현이 자연스러워요."},
        "strengths": [
          {"title": "자연스러운 눈썹"},
          {"title": "깔끔한 피부"},
          {"title": "립 경계"},
        ],
        "points": [
          {
            "title": "블러셔",
            "description": "경계를 정리하세요.",
            "actionSteps": ["깨끗한 브러시로 경계를 한 번 풀어보세요."],
          },
          {"title": "아이섀도"},
          {"title": "아이라인"},
          {"title": "립"},
          {"title": "하이라이터"},
        ],
        "imageUrl": "https://secret.example/photo.jpg",
      },
    },
  }

  digest = journey_api.build_feedback_digest(row)

  assert digest == {
    "report_id": PARENT_ID,
    "headline": "피부 표현이 자연스러워요.",
    "strength_count": 3,
    "strengths": ["자연스러운 눈썹", "깔끔한 피부", "립 경계"],
    "improvement_count": 5,
    "improvements": ["블러셔", "아이섀도", "아이라인", "립", "하이라이터"],
    "next_action": "깨끗한 브러시로 경계를 한 번 풀어보세요.",
  }
  assert "image" not in json.dumps(digest, ensure_ascii=False, default=str).lower()
  fallback = journey_api.build_feedback_digest(
    {"id": PARENT_ID, "feedback_payload": {"result": {"scoreReason": "근거만 있어요."}}},
  )
  assert fallback["headline"] == "근거만 있어요."
  assert fallback["strengths"] == []
  legacy = journey_api.build_feedback_digest(
    {
      "id": PARENT_ID,
      "feedback_payload": json.dumps(
        {
          "result": {
            "scoreReason": "과거 보고서 근거",
            "strengths": [{"title": "고른 피부 표현"}],
          },
        },
        ensure_ascii=False,
      ),
    },
  )
  assert legacy["headline"] == "과거 보고서 근거"
  assert legacy["strengths"] == ["고른 피부 표현"]


class CalendarDatabase:
  def __init__(self, goal_score: int = 80) -> None:
    self.goal_score = goal_score
    self.fetch_query = ""
    self.streak_query = ""

  async def fetchrow(self, query, *args):
    if "from makeup_journey_settings" in query:
      return _settings(self.goal_score)
    self.streak_query = query
    assert args[0] == USER_ID
    return {"current_streak": 2}

  async def fetch(self, query, *args):
    self.fetch_query = query
    assert args == (USER_ID, date(2026, 7, 1), date(2026, 8, 1))
    return [
      {
        "entry_date": date(2026, 7, 16),
        "first_score": 76,
        "latest_score": 84,
        "selected_score": 76,
        "representative_report_id": PARENT_ID,
        "representative_thumbnail_available": True,
        "report_count": 2,
        "has_note": True,
        "completed_missions": 1,
        "total_missions": 2,
      },
      {
        "entry_date": date(2026, 7, 17),
        "first_score": 81,
        "latest_score": 81,
        "selected_score": None,
        "representative_report_id": UUID("33333333-3333-3333-3333-333333333333"),
        "representative_thumbnail_available": True,
        "report_count": 1,
        "has_note": False,
        "completed_missions": 0,
        "total_missions": 0,
      },
    ]


@pytest.mark.asyncio
async def test_calendar_uses_selected_daily_score_and_re_evaluates_current_goal(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  db = CalendarDatabase(goal_score=82)
  response = await journey_api.get_makeup_journey_calendar("2026-07", auth=object(), db=db)
  data = response["data"]

  assert data["summary"] == {"averageScore": 79, "recordedDays": 2, "currentStreak": 2}
  assert data["days"][0] == {
    "date": "2026-07-16",
    "status": "failure",
    "firstScore": 76,
    "latestScore": 84,
    "representativeReportId": str(PARENT_ID),
    "representativeScore": 76,
    "representativeThumbnailUrl": (
      f"/makeup-journey/reports/{PARENT_ID}/thumbnail"
    ),
    "scoreDelta": 0,
    "reportCount": 2,
    "hasNote": True,
    "missionSummary": {"completed": 1, "total": 2},
  }
  assert data["days"][1]["status"] == "failure"
  normalized_query = " ".join(db.fetch_query.lower().split())
  assert normalized_query.count("row_number()") == 2
  assert "status = 'completed'" in normalized_query
  assert "score is not null" in normalized_query
  assert "user_id = $1" in normalized_query
  assert "left join makeup_journey_day_score_selections" in normalized_query
  assert "left join media_assets" in normalized_query
  assert "distinct on (entry_date)" in normalized_query
  assert "thumbnail_cdn_url" not in normalized_query
  assert "thumbnail_bucket is not null" in normalized_query
  assert "thumbnail_object_key is not null" in normalized_query
  assert "select entry_date, bool_or(true) as has_note" in normalized_query
  assert "from makeup_journey_day_notes" in normalized_query
  assert "group by entry_date" in normalized_query
  assert "where id = selected_report_id" in normalized_query

  # Same stored scores are immediately reclassified by the current setting.
  db.goal_score = 80
  changed = await journey_api.get_makeup_journey_calendar("2026-07", auth=object(), db=db)
  assert [day["status"] for day in changed["data"]["days"]] == ["failure", "success"]
  assert [day["latestScore"] for day in changed["data"]["days"]] == [84, 81]
  assert [day["representativeScore"] for day in changed["data"]["days"]] == [76, 81]


class ThumbnailDatabase:
  def __init__(self, media: dict | None) -> None:
    self.media = media
    self.query = ""
    self.args = ()

  async def fetchrow(self, query, *args):
    self.query = " ".join(query.lower().split())
    self.args = args
    return self.media


@pytest.mark.asyncio
async def test_private_thumbnail_delivery_checks_ownership_and_returns_no_store(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  calls: dict[str, object] = {}

  class FakeS3Service:
    def __init__(self, _settings) -> None:
      pass

    def assert_managed_media_location(self, *, bucket: str, object_key: str) -> None:
      calls["managed"] = (bucket, object_key)

    def get_object_bytes(self, *, bucket: str, object_key: str, max_bytes: int):
      calls["read"] = (bucket, object_key, max_bytes)
      return b"private-thumbnail", "image/jpeg"

  async def run_in_thread(function, **kwargs):
    calls["threaded"] = True
    return function(**kwargs)

  monkeypatch.setattr(journey_api, "S3Service", FakeS3Service)
  monkeypatch.setattr(journey_api.asyncio, "to_thread", run_in_thread)
  db = ThumbnailDatabase(
    {
      "thumbnail_bucket": "managed-bucket",
      "thumbnail_object_key": "uploads/makeup_feedback/thumbnails/private.jpg",
    }
  )

  response = await journey_api.get_makeup_journey_report_thumbnail(
    PARENT_ID,
    auth=object(),
    db=db,
    settings=Settings(s3_bucket_name="managed-bucket"),
  )

  assert response.body == b"private-thumbnail"
  assert response.media_type == "image/jpeg"
  assert response.headers["cache-control"] == "private, no-store"
  assert response.headers["vary"] == "Authorization"
  assert response.headers["x-content-type-options"] == "nosniff"
  assert calls["threaded"] is True
  assert calls["managed"] == (
    "managed-bucket",
    "uploads/makeup_feedback/thumbnails/private.jpg",
  )
  assert calls["read"] == (
    "managed-bucket",
    "uploads/makeup_feedback/thumbnails/private.jpg",
    journey_api.MAKEUP_JOURNEY_THUMBNAIL_MAX_BYTES,
  )
  assert db.args == (PARENT_ID, USER_ID)
  assert "reports.user_id = $2" in db.query
  assert "media.owner_user_id = reports.user_id" in db.query
  assert "reports.status = 'completed'" in db.query
  assert "media.deleted_at is null" in db.query
  assert "thumbnail_cdn_url" not in db.query
  assert "cdn_url" not in db.query


@pytest.mark.asyncio
async def test_private_thumbnail_delivery_hides_missing_or_unowned_report(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  db = ThumbnailDatabase(None)

  with pytest.raises(AppError) as exc_info:
    await journey_api.get_makeup_journey_report_thumbnail(
      PARENT_ID,
      auth=object(),
      db=db,
      settings=Settings(),
    )

  assert exc_info.value.status_code == 404
  assert exc_info.value.code == "MAKEUP_JOURNEY_THUMBNAIL_NOT_FOUND"


@pytest.mark.asyncio
async def test_private_thumbnail_delivery_enforces_maximum_bytes(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)

  class OversizedS3Service:
    def __init__(self, _settings) -> None:
      pass

    def assert_managed_media_location(self, **_kwargs) -> None:
      pass

    def get_object_bytes(self, **_kwargs):
      raise AppError(413, "S3_OBJECT_TOO_LARGE", "too large")

  async def run_in_thread(function, **kwargs):
    return function(**kwargs)

  monkeypatch.setattr(journey_api, "S3Service", OversizedS3Service)
  monkeypatch.setattr(journey_api.asyncio, "to_thread", run_in_thread)
  db = ThumbnailDatabase(
    {
      "thumbnail_bucket": "managed-bucket",
      "thumbnail_object_key": "uploads/makeup_feedback/thumbnails/large.jpg",
    }
  )

  with pytest.raises(AppError) as exc_info:
    await journey_api.get_makeup_journey_report_thumbnail(
      PARENT_ID,
      auth=object(),
      db=db,
      settings=Settings(),
    )

  assert exc_info.value.status_code == 413


class DayDatabase:
  def __init__(self) -> None:
    self.report_query = ""

  async def fetchrow(self, query, *args):
    assert args[0] == USER_ID
    if "from makeup_journey_settings" in query:
      return _settings(80)
    if "from makeup_journey_day_notes" in query:
      return {"content": "오늘은 경계를 연습했다.", "created_at": None, "updated_at": None}
    raise AssertionError(query)

  async def fetch(self, query, *args):
    assert args == (USER_ID, date(2026, 7, 17))
    if "from makeup_feedback_reports" in query:
      self.report_query = query
      return [
        {
          "id": PARENT_ID,
          "score": 76,
          "feedback_kind": "initial",
          "parent_feedback_report_id": None,
          "created_at": datetime(2026, 7, 17, 1, tzinfo=timezone.utc),
          "completed_at": datetime(2026, 7, 17, 1, tzinfo=timezone.utc),
          "image_url": "https://cdn.example/initial.jpg",
          "goal_context": {"userGoalText": "출근 메이크업"},
          "selected_report_id": PARENT_ID,
          "feedback_payload": {"result": {"scoreReason": "최초 결과"}},
          "note_content": "최초 기록 메모",
          "note_created_at": datetime(2026, 7, 17, 1, tzinfo=timezone.utc),
          "note_updated_at": datetime(2026, 7, 17, 1, tzinfo=timezone.utc),
        },
        {
          "id": uuid4(),
          "score": 84,
          "feedback_kind": "correction",
          "parent_feedback_report_id": PARENT_ID,
          "created_at": datetime(2026, 7, 17, 2, tzinfo=timezone.utc),
          "completed_at": datetime(2026, 7, 17, 2, tzinfo=timezone.utc),
          "image_url": "https://cdn.example/correction.jpg",
          "selected_report_id": PARENT_ID,
          "note_content": "수정 기록 메모",
          "note_created_at": datetime(2026, 7, 17, 2, tzinfo=timezone.utc),
          "note_updated_at": datetime(2026, 7, 17, 2, tzinfo=timezone.utc),
          # A legacy root JSON string cannot be projected by PostgreSQL, so
          # the latest row falls back to its retained digest payload.
          "goal_context": {},
          "feedback_payload": json.dumps(
            {
              "request": {
                "user_goal_text": "출근 메이크업",
                "analysis_goal_text": "단정한 출근 메이크업",
              },
              "result": {"scoreReason": "수정 결과"},
            },
            ensure_ascii=False,
          ),
        },
      ]
    if "from makeup_journey_missions" in query:
      return []
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_day_detail_returns_minimal_owned_report_chain(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  db = DayDatabase()
  response = await journey_api.get_makeup_journey_day(
    "2026-07-17",
    auth=object(),
    db=db,
  )

  data = response["data"]
  assert data["firstScore"] == 76
  assert data["latestScore"] == 84
  assert data["representativeReportId"] == str(PARENT_ID)
  assert data["representativeScore"] == 76
  assert data["scoreDelta"] == 0
  assert data["status"] == "failure"
  assert data["reports"][1]["feedbackKind"] == "correction"
  assert data["reports"][1]["parentFeedbackReportId"] == str(PARENT_ID)
  assert data["reports"][0]["imageUrl"] == "https://cdn.example/initial.jpg"
  assert data["reports"][1]["imageUrl"] == "https://cdn.example/correction.jpg"
  assert data["reports"][0]["goalContext"] == {"userGoalText": "출근 메이크업"}
  assert data["reports"][1]["goalContext"] == {
    "userGoalText": "출근 메이크업",
    "analysisGoalText": "단정한 출근 메이크업",
  }
  assert data["reports"][0]["feedbackDigest"]["headline"] == "최초 결과"
  assert data["reports"][1]["feedbackDigest"]["headline"] == "수정 결과"
  assert data["reports"][0]["note"]["content"] == "최초 기록 메모"
  assert data["reports"][1]["note"]["content"] == "수정 기록 메모"
  assert data["note"]["content"] == "최초 기록 메모"
  assert data["feedbackDigest"]["reportId"] == str(PARENT_ID)
  assert "feedbackPayload" not in data["reports"][1]

  report_query = " ".join(db.report_query.split())
  assert "row_number() over" in report_query
  assert "selected_report_id, feedback_payload" in report_query
  assert "left join makeup_journey_day_score_selections" in report_query
  assert "jsonb_strip_nulls(jsonb_build_object" in report_query
  assert "feedbackContext" in report_query
  assert "feedback_context" in report_query
  assert "userGoalText" in report_query
  assert "user_goal_text" in report_query
  assert "left join media_assets media" in report_query
  assert "media.owner_user_id = reports.user_id" in report_query
  assert "media.deleted_at is null" in report_query


class RepeatedInitialDayDatabase(DayDatabase):
  async def fetch(self, query, *args):
    rows = await super().fetch(query, *args)
    if "from makeup_feedback_reports" not in query:
      return rows
    return [
      {
        **row,
        "feedback_kind": "initial",
        "parent_feedback_report_id": None,
        "selected_report_id": None,
      }
      for row in rows
    ]


@pytest.mark.asyncio
async def test_day_detail_keeps_two_independent_home_feedback_reports(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  db = RepeatedInitialDayDatabase()

  response = await journey_api.get_makeup_journey_day(
    "2026-07-17",
    auth=object(),
    db=db,
  )

  data = response["data"]
  assert data["reportCount"] == 2
  assert [report["feedbackKind"] for report in data["reports"]] == ["initial", "initial"]
  assert [report["parentFeedbackReportId"] for report in data["reports"]] == [None, None]
  assert [report["score"] for report in data["reports"]] == [76, 84]
  assert data["representativeReportId"] == data["reports"][1]["reportId"]
  assert data["representativeScore"] == 84
  normalized_query = " ".join(db.report_query.lower().split())
  assert "reports.feedback_kind =" not in normalized_query
  assert "reports.parent_feedback_report_id is not null" not in normalized_query


class TrendsDatabase:
  def __init__(self, goal_score: int = 80) -> None:
    self.goal_score = goal_score

  async def fetchrow(self, query, *args):
    assert "from makeup_journey_settings" in query
    return _settings(self.goal_score)

  async def fetch(self, query, *args):
    assert args == (USER_ID, date(2026, 6, 18), date(2026, 7, 17))
    assert "left join makeup_journey_day_score_selections" in query
    assert "coalesce(" in query
    return [
      {"entry_date": date(2026, 7, 1), "score": 76},
      {"entry_date": date(2026, 7, 17), "score": 91},
    ]


@pytest.mark.asyncio
async def test_trends_include_selected_or_latest_daily_scores_and_summary(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  db = TrendsDatabase()
  response = await journey_api.get_makeup_journey_trends(
    range_value="30d",
    end_date="2026-07-17",
    auth=object(),
    db=db,
  )
  data = response["data"]
  assert [point["status"] for point in data["points"]] == ["failure", "success"]
  assert data["summary"] == {
    "firstScore": 76,
    "latestScore": 91,
    "highestScore": 91,
    "averageScore": 84,
  }
  db.goal_score = 95
  changed = await journey_api.get_makeup_journey_trends(
    range_value="30d",
    end_date="2026-07-17",
    auth=object(),
    db=db,
  )
  assert [point["score"] for point in changed["data"]["points"]] == [76, 91]
  assert [point["status"] for point in changed["data"]["points"]] == ["failure", "failure"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("rows", "expected_summary"),
  [
    (
      [],
      {"firstScore": None, "latestScore": None, "highestScore": None, "averageScore": None},
    ),
    (
      [{"entry_date": date(2026, 7, 17), "score": 83}],
      {"firstScore": 83, "latestScore": 83, "highestScore": 83, "averageScore": 83},
    ),
  ],
)
async def test_trends_zero_and_single_point_contract(monkeypatch, rows, expected_summary) -> None:
  class VariableTrendsDatabase(TrendsDatabase):
    async def fetch(self, _query, *_args):
      return rows

  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  response = await journey_api.get_makeup_journey_trends(
    range_value="7d",
    end_date="2026-07-17",
    auth=object(),
    db=VariableTrendsDatabase(),
  )
  assert response["data"]["summary"] == expected_summary
  assert len(response["data"]["points"]) == len(rows)


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("range_value", "end_date", "expected_start"),
  [
    ("7d", "2024-03-01", date(2024, 2, 24)),
    ("30d", "2024-03-01", date(2024, 2, 1)),
    ("90d", "2026-07-17", date(2026, 4, 19)),
  ],
)
async def test_trend_ranges_use_inclusive_leap_safe_boundaries(
  monkeypatch,
  range_value,
  end_date,
  expected_start,
) -> None:
  class BoundaryDatabase:
    async def fetchrow(self, query, *args):
      assert "from makeup_journey_settings" in query
      return _settings(80)

    async def fetch(self, query, *args):
      assert "entry_date between $2 and $3" in query
      assert args == (USER_ID, expected_start, date.fromisoformat(end_date))
      return []

  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  response = await journey_api.get_makeup_journey_trends(
    range_value=range_value,
    end_date=end_date,
    auth=object(),
    db=BoundaryDatabase(),
  )

  assert response["data"]["range"] == range_value
  assert response["data"]["points"] == []


class ScoreSelectionDatabase:
  def __init__(self, *, found: bool = True, has_thumbnail: bool = True) -> None:
    self.found = found
    self.has_thumbnail = has_thumbnail
    self.query = ""
    self.args = None

  async def fetchrow(self, query, *args):
    self.query = query
    self.args = args
    if not self.found:
      return None
    return {
      "report_id": PARENT_ID,
      "score": 76,
      "has_thumbnail": self.has_thumbnail,
      "updated_at": datetime(2026, 7, 17, 3, tzinfo=timezone.utc),
    }


@pytest.mark.asyncio
async def test_score_selection_upserts_only_an_owned_completed_report_for_the_date(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  db = ScoreSelectionDatabase()

  response = await journey_api.update_makeup_journey_score_selection(
    "2026-07-17",
    MakeupJourneyScoreSelectionUpdate(reportId=PARENT_ID),
    auth=object(),
    db=db,
  )

  assert response["data"] == {
    "date": "2026-07-17",
    "reportId": str(PARENT_ID),
    "score": 76,
    "representativeThumbnailUrl": (
      f"/makeup-journey/reports/{PARENT_ID}/thumbnail"
    ),
    "updatedAt": "2026-07-17T03:00:00+00:00",
  }
  assert db.args == (USER_ID, date(2026, 7, 17), PARENT_ID)
  normalized_query = " ".join(db.query.lower().split())
  assert (
    "where reports.id = $3 and reports.user_id = $1 and reports.entry_date = $2"
    in normalized_query
  )
  assert "reports.status = 'completed' and reports.score is not null" in normalized_query
  assert "left join media_assets" in normalized_query
  assert "media.owner_user_id = reports.user_id" in normalized_query
  assert "media.status = 'active'" in normalized_query
  assert "media.deleted_at is null" in normalized_query
  assert "media.thumbnail_bucket is not null" in normalized_query
  assert "media.thumbnail_object_key is not null" in normalized_query
  assert "on conflict (user_id, entry_date) do update" in normalized_query


@pytest.mark.asyncio
async def test_score_selection_returns_null_thumbnail_when_owned_thumbnail_is_unavailable(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)

  response = await journey_api.update_makeup_journey_score_selection(
    "2026-07-17",
    MakeupJourneyScoreSelectionUpdate(reportId=PARENT_ID),
    auth=object(),
    db=ScoreSelectionDatabase(has_thumbnail=False),
  )

  assert response["data"]["representativeThumbnailUrl"] is None


@pytest.mark.asyncio
async def test_score_selection_rejects_foreign_wrong_date_or_incomplete_report(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)

  with pytest.raises(AppError) as exc_info:
    await journey_api.update_makeup_journey_score_selection(
      "2026-07-17",
      MakeupJourneyScoreSelectionUpdate(reportId=PARENT_ID),
      auth=object(),
      db=ScoreSelectionDatabase(found=False),
    )

  assert exc_info.value.status_code == 404
  assert exc_info.value.code == "MAKEUP_JOURNEY_REPORT_NOT_FOUND"


@pytest.mark.asyncio
async def test_correction_inherits_owned_completed_parent_date_and_goal_context() -> None:
  class ParentDatabase:
    async def fetchrow(self, query, *args):
      assert "where id = $1 and user_id = $2" in query
      assert args == (PARENT_ID, USER_ID)
      return {
        "id": PARENT_ID,
        "user_id": USER_ID,
        "entry_date": date(2026, 6, 1),
        "status": "completed",
        "score": 77,
        "feedback_payload": {
          "request": {
            "feedbackContext": {
              "originalGoalText": "면접 메이크업",
              "analysisGoalText": "단정한 면접 메이크업",
            },
          },
        },
      }

  payload = FeedbackJobCreate(
    entryDate="2099-01-01",
    feedbackKind="correction",
    parentFeedbackReportId=PARENT_ID,
  )
  inherited_date, inherited_context = await feedback_api.resolve_feedback_journey_context(
    ParentDatabase(),
    user_id=USER_ID,
    payload=payload,
  )
  assert inherited_date == date(2026, 6, 1)
  assert inherited_context["originalGoalText"] == "면접 메이크업"


@pytest.mark.asyncio
async def test_correction_inherits_legacy_top_level_goal_context() -> None:
  class LegacyParentDatabase:
    async def fetchrow(self, query, *args):
      assert "where id = $1 and user_id = $2" in query
      assert args == (PARENT_ID, USER_ID)
      return {
        "id": PARENT_ID,
        "user_id": USER_ID,
        "entry_date": date(2026, 6, 2),
        "status": "completed",
        "score": 78,
        "feedback_payload": json.dumps(
          {
            "request": {
              "user_goal_text": "결혼식 하객 메이크업",
              "original_goal_text": "결혼식 하객 메이크업",
              "goal_intent_type": "valid_context",
            },
          },
          ensure_ascii=False,
        ),
      }

  inherited_date, inherited_context = await feedback_api.resolve_feedback_journey_context(
    LegacyParentDatabase(),
    user_id=USER_ID,
    payload=FeedbackJobCreate(
      feedbackKind="correction",
      parentFeedbackReportId=PARENT_ID,
    ),
  )

  assert inherited_date == date(2026, 6, 2)
  assert inherited_context == {
    "userGoalText": "결혼식 하객 메이크업",
    "originalGoalText": "결혼식 하객 메이크업",
    "goalIntentType": "valid_context",
  }


@pytest.mark.asyncio
async def test_correction_rejects_foreign_or_incomplete_parent() -> None:
  class MissingDatabase:
    async def fetchrow(self, _query, *_args):
      return None

  with pytest.raises(AppError) as missing:
    await feedback_api.resolve_feedback_journey_context(
      MissingDatabase(),
      user_id=USER_ID,
      payload=FeedbackJobCreate(feedbackKind="correction", parentFeedbackReportId=PARENT_ID),
    )
  assert missing.value.status_code == 404

  class IncompleteDatabase:
    async def fetchrow(self, _query, *_args):
      return {
        "entry_date": date(2026, 7, 17),
        "status": "failed",
        "score": None,
        "feedback_payload": {},
      }

  with pytest.raises(AppError) as incomplete:
    await feedback_api.resolve_feedback_journey_context(
      IncompleteDatabase(),
      user_id=USER_ID,
      payload=FeedbackJobCreate(feedbackKind="correction", parentFeedbackReportId=PARENT_ID),
    )
  assert incomplete.value.code == "FEEDBACK_PARENT_NOT_COMPLETED"


@pytest.mark.asyncio
async def test_feedback_job_persists_canonical_correction_fields(monkeypatch) -> None:
  inserted: dict = {}

  class FeedbackDatabase:
    async def fetchrow(self, query, *args):
      if "select id, user_id, entry_date" in query:
        return {
          "id": PARENT_ID,
          "user_id": USER_ID,
          "entry_date": date(2026, 7, 10),
          "status": "completed",
          "score": 70,
          "feedback_payload": {
            "request": {"feedbackContext": {"userGoalText": "저장된 목표"}},
          },
        }
      if "insert into makeup_feedback_reports" in query:
        inserted["query"] = query
        inserted["args"] = args
        return {
          "id": uuid4(),
          "user_id": USER_ID,
          "entry_date": args[5],
          "feedback_kind": args[6],
          "parent_feedback_report_id": args[7],
          "feedback_payload": args[8],
        }
      raise AssertionError(query)

  monkeypatch.setattr(feedback_api, "ensure_user", _ensure_user)
  response = await feedback_api.create_feedback_job(
    FeedbackJobCreate(
      entryDate="2026-07-17",
      feedbackKind="correction",
      parentFeedbackReportId=PARENT_ID,
      requestPayload={
        "feedbackContext": {"userGoalText": "조작된 목표"},
        "originalGoalText": "조작된 원본 목표",
        "normalized_goal_text": "조작된 정규화 목표",
        "goalIntentType": "noise",
        "profile_gender": "조작된 성별",
      },
    ),
    BackgroundTasks(),
    auth=type("Auth", (), {"subject": "owner"})(),
    db=FeedbackDatabase(),
    settings=Settings(),
  )

  assert inserted["args"][5:8] == (date(2026, 7, 10), "correction", PARENT_ID)
  stored = json.loads(inserted["args"][8])
  assert stored["request"]["feedbackContext"] == {"userGoalText": "저장된 목표"}
  assert not {
    "originalGoalText",
    "normalized_goal_text",
    "goalIntentType",
    "profile_gender",
  }.intersection(stored["request"])
  assert stored["request"]["makeupJourneyContext"]["entryDate"] == "2026-07-10"
  assert response["data"]["job"]["feedbackKind"] == "correction"


@pytest.mark.asyncio
async def test_initial_feedback_rejects_stale_client_date(monkeypatch) -> None:
  monkeypatch.setattr(feedback_api, "server_entry_date", lambda: date(2026, 7, 17))
  with pytest.raises(AppError) as exc_info:
    await feedback_api.resolve_feedback_journey_context(
      object(),
      user_id=USER_ID,
      payload=FeedbackJobCreate(entryDate="2026-07-15"),
    )
  assert exc_info.value.code == "FEEDBACK_ENTRY_DATE_OUT_OF_RANGE"


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("payload", "expected_code"),
  [
    (
      FeedbackJobCreate(
        feedbackKind="initial",
        parentFeedbackReportId=PARENT_ID,
      ),
      "FEEDBACK_PARENT_NOT_ALLOWED",
    ),
    (
      FeedbackJobCreate(feedbackKind="correction"),
      "FEEDBACK_PARENT_REQUIRED",
    ),
  ],
)
async def test_feedback_kind_and_parent_combinations_are_enforced(
  payload: FeedbackJobCreate,
  expected_code: str,
) -> None:
  with pytest.raises(AppError) as exc_info:
    await feedback_api.resolve_feedback_journey_context(
      object(),
      user_id=USER_ID,
      payload=payload,
    )

  assert exc_info.value.status_code == 422
  assert exc_info.value.code == expected_code


@pytest.mark.asyncio
@pytest.mark.parametrize("offset_days", [-1, 1])
async def test_initial_feedback_accepts_exact_one_day_boundary(
  monkeypatch,
  offset_days: int,
) -> None:
  server_date = date(2026, 7, 17)
  monkeypatch.setattr(feedback_api, "server_entry_date", lambda: server_date)
  requested_date = date.fromordinal(server_date.toordinal() + offset_days)

  resolved_date, inherited_context = await feedback_api.resolve_feedback_journey_context(
    object(),
    user_id=USER_ID,
    payload=FeedbackJobCreate(entryDate=requested_date.isoformat()),
  )

  assert resolved_date == requested_date
  assert inherited_context is None


@pytest.mark.asyncio
async def test_initial_feedback_without_entry_date_uses_deterministic_server_date(monkeypatch) -> None:
  server_date = date(2026, 7, 17)
  monkeypatch.setattr(feedback_api, "server_entry_date", lambda: server_date)

  resolved_date, inherited_context = await feedback_api.resolve_feedback_journey_context(
    object(),
    user_id=USER_ID,
    payload=FeedbackJobCreate(),
  )

  assert resolved_date == server_date
  assert inherited_context is None


class GenerateMissionDatabase:
  def __init__(self) -> None:
    self.generation_payload = None

  async def fetchrow(self, query, *args):
    if "from makeup_journey_settings" in query:
      return _settings(80)
    if "from makeup_feedback_reports" in query:
      return {
        "score": 65,
        "feedback_payload": {
          "result": {
            "points": [{"title": "블러셔"}],
            "imageUrl": "https://secret.example/image.jpg",
          },
        },
      }
    raise AssertionError(query)

  async def fetch(self, query, *args):
    if "select title, is_completed" in query:
      return []
    if "source in ('ai', 'curated')" in query:
      return []
    if "insert into makeup_journey_missions" in query:
      self.generation_payload = json.loads(args[5])
      return [
        {
          "id": uuid4(),
          "source": args[2],
          "difficulty": difficulty,
          "title": title,
          "is_completed": False,
          "completed_at": None,
          "sort_order": index,
          "created_at": None,
          "updated_at": None,
        }
        for index, (title, difficulty) in enumerate(zip(args[3], args[4], strict=True))
      ]
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_mission_generation_uses_random_curated_set_without_ai_payload(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 17))
  db = GenerateMissionDatabase()
  response = await journey_api.generate_makeup_journey_missions(
    "2026-07-17",
    MakeupJourneyMissionGenerate(count=3),
    auth=object(),
    db=db,
  )

  missions = response["data"]["missions"]
  assert len(missions) == 3
  assert {mission["difficulty"] for mission in missions} == {
    "beginner",
    "intermediate",
    "advanced",
  }
  assert all(mission["source"] == "curated" for mission in missions)
  assert db.generation_payload == {
    "generationStatus": "curated_random",
    "missionSet": "daily_three",
    "poolVersion": "daily-v2",
  }
  assert "image" not in json.dumps(db.generation_payload).lower()


class NoteDatabase:
  def __init__(self) -> None:
    self.deleted_args = None

  async def fetchrow(self, query, *args):
    assert "from makeup_journey_settings" in query
    return _settings(80)

  async def execute(self, query, *args):
    assert "delete from makeup_journey_day_notes" in query
    self.deleted_args = args


@pytest.mark.asyncio
async def test_blank_note_deletes_only_owned_date(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 17))
  db = NoteDatabase()
  response = await journey_api.update_makeup_journey_note(
    "2026-07-17",
    MakeupJourneyNoteUpdate(content="  "),
    auth=object(),
    db=db,
  )
  assert response["data"] == {"note": None}
  assert db.deleted_args == (USER_ID, date(2026, 7, 17), None)


class ReportNoteDatabase:
  def __init__(self, *, owns_report: bool = True) -> None:
    self.owns_report = owns_report
    self.upsert_args = None

  async def fetchrow(self, query, *args):
    if "from makeup_journey_settings" in query:
      return _settings(80)
    if "from makeup_feedback_reports" in query:
      assert args == (USER_ID, date(2026, 7, 17), PARENT_ID)
      return {"id": PARENT_ID} if self.owns_report else None
    if "insert into makeup_journey_day_notes" in query:
      self.upsert_args = args
      assert "where report_id is not null" in query
      return {
        "content": args[3],
        "created_at": datetime(2026, 7, 17, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 17, 1, tzinfo=timezone.utc),
      }
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_note_is_saved_for_one_owned_report_instead_of_the_whole_date(
  monkeypatch,
) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 17))
  db = ReportNoteDatabase()

  response = await journey_api.update_makeup_journey_note(
    "2026-07-17",
    MakeupJourneyNoteUpdate(content="  최초 보고서 메모  ", reportId=PARENT_ID),
    auth=object(),
    db=db,
  )

  assert response["data"]["note"]["content"] == "최초 보고서 메모"
  assert db.upsert_args == (
    USER_ID,
    date(2026, 7, 17),
    PARENT_ID,
    "최초 보고서 메모",
  )


@pytest.mark.asyncio
async def test_note_rejects_a_foreign_wrong_date_or_incomplete_report(monkeypatch) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 17))

  with pytest.raises(AppError) as exc_info:
    await journey_api.update_makeup_journey_note(
      "2026-07-17",
      MakeupJourneyNoteUpdate(content="메모", reportId=PARENT_ID),
      auth=object(),
      db=ReportNoteDatabase(owns_report=False),
    )

  assert exc_info.value.status_code == 404
  assert exc_info.value.code == "MAKEUP_JOURNEY_REPORT_NOT_FOUND"


class FutureMissionDatabase:
  def __init__(self) -> None:
    self.mutation_attempted = False

  async def fetchrow(self, query, *args):
    if "select entry_date" in query:
      assert args == (PARENT_ID, USER_ID)
      return {"entry_date": date(2026, 7, 18)}
    if "from makeup_journey_settings" in query:
      return _settings(80)
    self.mutation_attempted = True
    raise AssertionError(query)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["patch", "delete"])
async def test_future_mission_patch_and_delete_are_read_only(monkeypatch, operation: str) -> None:
  monkeypatch.setattr(journey_api, "ensure_user", _ensure_user)
  monkeypatch.setattr(journey_api, "_today", lambda _timezone: date(2026, 7, 17))
  db = FutureMissionDatabase()

  with pytest.raises(AppError) as exc_info:
    if operation == "patch":
      await journey_api.update_makeup_journey_mission(
        PARENT_ID,
        MakeupJourneyMissionUpdate(isCompleted=True),
        auth=object(),
        db=db,
      )
    else:
      await journey_api.delete_makeup_journey_mission(
        PARENT_ID,
        auth=object(),
        db=db,
      )

  assert exc_info.value.status_code == 422
  assert exc_info.value.code == "MAKEUP_JOURNEY_FUTURE_DATE_READ_ONLY"
  assert db.mutation_attempted is False
