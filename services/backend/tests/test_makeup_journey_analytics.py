import json
import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError

from app.api import makeup_journey as journey_api
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.main import create_app
from app.schemas.makeup_journey import MakeupJourneyAnalyticsEvent


EVENT_ADAPTER = TypeAdapter(MakeupJourneyAnalyticsEvent)
VALID_EVENTS = [
  {
    "name": "makeup_journey_opened",
    "properties": {"month": "2026-07", "hasRecords": True},
  },
  {
    "name": "makeup_journey_day_opened",
    "properties": {"hasReport": True, "reportCount": 2, "status": "success"},
  },
  {
    "name": "makeup_journey_settings_saved",
    "properties": {"goalScore": 80, "missionLevel": "intermediate"},
  },
  {
    "name": "makeup_journey_mission_completed",
    "properties": {"difficulty": "beginner", "source": "curated"},
  },
  {"name": "makeup_journey_correction_started", "properties": {}},
  {
    "name": "makeup_journey_correction_completed",
    "properties": {"scoreDelta": 8},
  },
  {
    "name": "floating_action_repositioned",
    "properties": {"quadrant": "bottomRight"},
  },
]


@pytest.mark.parametrize("event", VALID_EVENTS)
def test_analytics_schema_accepts_only_the_seven_contract_events(event) -> None:
  parsed = EVENT_ADAPTER.validate_python(event)
  assert parsed.name == event["name"]
  assert parsed.properties.model_dump(by_alias=True) == event["properties"]


@pytest.mark.parametrize(
  "event",
  [
    {"name": "unknown_event", "properties": {}},
    {
      "name": "makeup_journey_opened",
      "properties": {"month": "2026-07", "hasRecords": True, "userId": "private"},
    },
    {
      "name": "makeup_journey_correction_started",
      "properties": {"note": "private memo"},
    },
    {
      "name": "makeup_journey_settings_saved",
      "properties": {"goalScore": 101, "missionLevel": "beginner"},
    },
    {
      "name": "floating_action_repositioned",
      "properties": {"quadrant": "x:0.42,y:0.73"},
    },
    {
      "name": "makeup_journey_opened",
      "properties": {"month": "2026-07", "hasRecords": True},
      "email": "private@example.com",
    },
  ],
)
def test_analytics_schema_rejects_unknown_pii_and_out_of_contract_properties(event) -> None:
  with pytest.raises(ValidationError):
    EVENT_ADAPTER.validate_python(event)


@pytest.mark.asyncio
async def test_analytics_endpoint_logs_only_allow_list_fields(caplog) -> None:
  payload = EVENT_ADAPTER.validate_python(VALID_EVENTS[1])
  auth = AuthContext(
    subject="private-user-id",
    provider="google",
    email="private@example.com",
    name="Private Name",
    claims={"sub": "private-user-id"},
  )

  with caplog.at_level(logging.INFO, logger=journey_api.__name__):
    response = await journey_api.record_makeup_journey_analytics_event(payload, auth)

  assert response["data"] == {
    "accepted": True,
    "eventName": "makeup_journey_day_opened",
  }
  record = next(
    item for item in caplog.records if "[aura:makeup-journey-analytics]" in item.getMessage()
  )
  logged = json.loads(record.getMessage().split("] ", 1)[1])
  assert logged["eventName"] == "makeup_journey_day_opened"
  assert logged["properties"] == {
    "hasReport": True,
    "reportCount": 2,
    "status": "success",
  }
  assert len(logged["actorId"]) == 24
  assert logged["actorId"].isalnum()
  assert logged["occurredAt"].endswith("+00:00")
  assert "private" not in record.getMessage().lower()


def test_analytics_http_route_requires_auth_and_never_requires_database() -> None:
  app = create_app(Settings(auth_required=True, database_url=None))
  client = TestClient(app)
  payload = VALID_EVENTS[0]

  unauthorized = client.post("/api/makeup-journey/analytics/events", json=payload)
  assert unauthorized.status_code == 401

  app.dependency_overrides[get_current_user] = lambda: AuthContext(
    subject="authenticated-user",
    provider="google",
    email=None,
    name=None,
    claims={"sub": "authenticated-user"},
  )
  accepted = client.post("/api/makeup-journey/analytics/events", json=payload)
  assert accepted.status_code == 200
  assert accepted.json()["data"] == {
    "accepted": True,
    "eventName": "makeup_journey_opened",
  }
