from datetime import datetime, timezone

from app.core.responses import success
from app.core.settings import Settings
from app.ops.export_openapi import build_openapi_schema
from app.schemas.makeup_journey import (
  MakeupJourneyCalendarResponse,
  MakeupJourneySettingsResponse,
)


EXPECTED_RESPONSE_MODELS = {
  ("post", "/api/feedback/jobs"): "FeedbackJobCreateResponse",
  ("post", "/api/makeup-journey/analytics/events"): "MakeupJourneyAnalyticsResponse",
  ("get", "/api/makeup-journey/settings"): "MakeupJourneySettingsResponse",
  ("put", "/api/makeup-journey/settings"): "MakeupJourneySettingsResponse",
  ("get", "/api/makeup-journey/calendar"): "MakeupJourneyCalendarResponse",
  ("get", "/api/makeup-journey/days/{entry_date}"): "MakeupJourneyDayResponse",
  ("get", "/api/makeup-journey/trends"): "MakeupJourneyTrendResponse",
  (
    "put",
    "/api/makeup-journey/days/{entry_date}/score-selection",
  ): "MakeupJourneyScoreSelectionResponse",
  ("put", "/api/makeup-journey/days/{entry_date}/note"): "MakeupJourneyNoteResponse",
  ("post", "/api/makeup-journey/days/{entry_date}/missions"): "MakeupJourneyMissionResponse",
  (
    "post",
    "/api/makeup-journey/days/{entry_date}/missions/generate",
  ): "MakeupJourneyMissionsResponse",
  ("patch", "/api/makeup-journey/missions/{mission_id}"): "MakeupJourneyMissionResponse",
  (
    "delete",
    "/api/makeup-journey/missions/{mission_id}",
  ): "MakeupJourneyDeleteMissionResponse",
}


def test_every_makeup_journey_operation_has_a_concrete_openapi_response_model() -> None:
  schema = build_openapi_schema(Settings())

  for (method, path), model_name in EXPECTED_RESPONSE_MODELS.items():
    response_schema = schema["paths"][path][method]["responses"]["200"]["content"][
      "application/json"
    ]["schema"]
    assert response_schema == {"$ref": f"#/components/schemas/{model_name}"}


def test_openapi_response_components_are_required_nullable_and_camel_case() -> None:
  components = build_openapi_schema(Settings())["components"]["schemas"]
  envelope = components["MakeupJourneySettingsResponse"]
  settings_data = components["MakeupJourneySettingsResponseData"]
  calendar_day = components["MakeupJourneyCalendarDay"]
  day_data = components["MakeupJourneyDayResponseData"]
  delete_data = components["MakeupJourneyDeleteMissionResponseData"]
  feedback_job = components["FeedbackJobRecord"]

  assert set(envelope["required"]) == {"data", "meta", "error"}
  assert "requiresOnboarding" in settings_data["properties"]
  assert "requires_onboarding" not in settings_data["properties"]
  assert "firstScore" in calendar_day["required"]
  assert {"firstScore", "representativeScore"}.issubset(calendar_day["required"])
  assert {
    "goalScore",
    "feedbackDigest",
    "scoreDelta",
    "representativeReportId",
    "representativeScore",
  }.issubset(day_data["required"])
  report_schema = components["MakeupJourneyReport"]
  assert {"imageUrl", "feedbackDigest", "note"}.issubset(report_schema["required"])
  assert "reportId" in components["MakeupJourneyNoteUpdate"]["properties"]
  assert "reportId" in components["MakeupJourneyScoreSelectionUpdate"]["required"]
  assert "missionId" in delete_data["properties"]
  assert "mission_id" not in delete_data["properties"]
  assert {"entryDate", "feedbackKind", "parentFeedbackReportId"}.issubset(
    feedback_job["required"],
  )
  assert "entry_date" not in feedback_job["properties"]


def test_response_models_validate_the_success_envelope_wire_shape() -> None:
  now = datetime(2026, 7, 17, 12, tzinfo=timezone.utc)
  settings_payload = success(
    {
      "settings": {
        "goal_score": 80,
        "mission_level": "intermediate",
        "timezone_name": "Asia/Seoul",
        "created_at": now,
        "updated_at": now,
      },
      "requires_onboarding": False,
    }
  )
  validated_settings = MakeupJourneySettingsResponse.model_validate(settings_payload)
  dumped_settings = validated_settings.model_dump(mode="json", by_alias=True)
  assert dumped_settings["data"]["settings"]["goalScore"] == 80
  assert dumped_settings["data"]["settings"]["createdAt"] == "2026-07-17T12:00:00Z"
  assert dumped_settings["data"]["requiresOnboarding"] is False
  assert dumped_settings["meta"] == {}
  assert dumped_settings["error"] is None

  calendar_payload = success(
    {
      "month": "2026-07",
      "goal_score": 80,
      "summary": {
        "average_score": 84,
        "recorded_days": 1,
        "current_streak": 1,
      },
      "days": [
        {
          "date": "2026-07-17",
          "status": "success",
          "first_score": 84,
          "latest_score": 84,
          "representative_score": 84,
          "score_delta": 0,
          "report_count": 1,
          "has_note": False,
          "mission_summary": {"completed": 0, "total": 0},
        }
      ],
    }
  )
  validated_calendar = MakeupJourneyCalendarResponse.model_validate(calendar_payload)
  dumped_calendar = validated_calendar.model_dump(mode="json", by_alias=True)
  assert dumped_calendar == calendar_payload
