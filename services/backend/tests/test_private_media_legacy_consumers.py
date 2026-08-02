from datetime import date, datetime, timezone
from uuid import UUID

import pytest

from app.api import makeup_journey as journey_api
from app.services import consulting_partner


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
MEDIA_ID = UUID("20000000-0000-0000-0000-000000000001")
PREVIEW_ID = UUID("20000000-0000-0000-0000-000000000002")
REPORT_ID = UUID("30000000-0000-0000-0000-000000000001")


class JourneyDatabase:
  async def fetchrow(self, query, *_args):
    if "from makeup_journey_settings" in query:
      return {"goal_score": 80, "mission_level": "beginner", "timezone_name": "Asia/Seoul"}
    if "from makeup_journey_day_notes" in query:
      return None
    raise AssertionError(query)

  async def fetch(self, query, *_args):
    if "from makeup_feedback_reports" in query:
      return [
        {
          "id": REPORT_ID,
          "score": 88,
          "feedback_kind": "initial",
          "parent_feedback_report_id": None,
          "uploaded_media_id": MEDIA_ID,
          "image_url": "https://legacy-cdn.example/face.jpg",
          "selected_report_id": REPORT_ID,
          "feedback_payload": {"result": {"scoreReason": "좋아요"}},
          "goal_context": {},
          "note_content": None,
          "created_at": datetime(2026, 8, 2, tzinfo=timezone.utc),
          "completed_at": datetime(2026, 8, 2, tzinfo=timezone.utc),
        },
      ]
    if "from makeup_journey_missions" in query:
      return []
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_makeup_journey_replaces_legacy_cdn_with_owned_signed_url(monkeypatch) -> None:
  async def ensure_user(_db, _auth):
    return {"id": USER_ID}

  async def signed(_db, _settings, *, owner_user_id, media_ids, **_kwargs):
    assert owner_user_id == USER_ID
    assert list(media_ids) == [MEDIA_ID]
    return {str(MEDIA_ID): "https://signed.example/journey"}

  monkeypatch.setattr(journey_api, "ensure_user", ensure_user)
  monkeypatch.setattr(journey_api, "create_owned_media_delivery_urls", signed)

  response = await journey_api.get_makeup_journey_day(
    date(2026, 8, 2).isoformat(),
    auth=object(),
    db=JourneyDatabase(),
  )

  assert response["data"]["reports"][0]["imageUrl"] == "https://signed.example/journey"


class ConsultantDatabase:
  async def fetchrow(self, query, *_args):
    if "from analysis_reports r" in query:
      return {
        "id": REPORT_ID,
        "user_id": USER_ID,
        "source_media_id": MEDIA_ID,
        "preview_media_id": PREVIEW_ID,
        "source_image_url": "https://legacy-cdn.example/source.jpg",
        "preview_image_url": "https://legacy-cdn.example/preview.jpg",
        "detail_payload": {},
        "created_at": datetime(2026, 8, 2, tzinfo=timezone.utc),
      }
    raise AssertionError(query)


@pytest.mark.asyncio
async def test_authorized_consultant_report_uses_short_lived_media_delivery(monkeypatch) -> None:
  async def shared_reports(_db, _account):
    return [{"id": str(REPORT_ID)}]

  async def signed(_db, _settings, *, owner_user_id, media_ids, **_kwargs):
    assert owner_user_id == USER_ID
    assert list(media_ids) == [MEDIA_ID, PREVIEW_ID]
    return {
      str(MEDIA_ID): "https://signed.example/source",
      str(PREVIEW_ID): "https://signed.example/preview",
    }

  monkeypatch.setattr(consulting_partner, "shared_reports", shared_reports)
  monkeypatch.setattr(consulting_partner, "create_owned_media_delivery_urls", signed)

  result = await consulting_partner.report_detail(
    ConsultantDatabase(),
    {"id": "partner"},
    str(REPORT_ID),
  )

  assert result["detail"]["source_image_url"] == "https://signed.example/source"
  assert result["detail"]["preview_image_url"] == "https://signed.example/preview"
  assert result["detail"]["image_url"] == "https://signed.example/preview"
