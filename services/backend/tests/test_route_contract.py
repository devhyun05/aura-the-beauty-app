from fastapi.testclient import TestClient

from app.api import consulting as consulting_api
from app.api import consulting_partner as consulting_partner_api
from app.core.security import AuthContext
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.services import consulting_call as consulting_call_service


EXPECTED_ROUTES = {
  ("GET", "/health"),
  ("GET", "/api/health"),
  ("GET", "/api/health/db"),
  ("GET", "/api/health/config"),
  ("GET", "/api/users/me"),
  ("PATCH", "/api/users/me/profile"),
  ("GET", "/api/home"),
  ("GET", "/api/community/threads"),
  ("GET", "/api/community/search"),
  ("POST", "/api/community/threads"),
  ("GET", "/api/community/threads/recommended"),
  ("GET", "/api/community/threads/{thread_id}"),
  ("POST", "/api/community/threads/{thread_id}/replies"),
  ("POST", "/api/community/threads/{thread_id}/like"),
  ("DELETE", "/api/community/threads/{thread_id}/like"),
  ("POST", "/api/community/threads/{thread_id}/save"),
  ("DELETE", "/api/community/threads/{thread_id}/save"),
  ("DELETE", "/api/community/replies/{reply_id}"),
  ("POST", "/api/community/replies/{reply_id}/like"),
  ("DELETE", "/api/community/replies/{reply_id}/like"),
  ("POST", "/api/community/events"),
  ("POST", "/api/media/presigned-upload"),
  ("POST", "/api/media/complete-upload"),
  ("POST", "/api/photo-captures"),
  ("POST", "/api/analysis/jobs"),
  ("GET", "/api/analysis/jobs/{job_id}"),
  ("GET", "/api/analysis/reports"),
  ("GET", "/api/analysis/reports/{report_id}"),
  ("DELETE", "/api/analysis/reports/{report_id}"),
  ("DELETE", "/api/analysis/reports/{report_id}/recommended-makeups/{makeup_index}"),
  ("GET", "/api/products/recommendations"),
  ("GET", "/api/products/liked"),
  ("POST", "/api/products/{product_id}/like"),
  ("DELETE", "/api/products/{product_id}/like"),
  ("POST", "/api/search/sessions"),
  ("GET", "/api/search/sessions/{session_id}"),
  ("POST", "/api/search/sessions/{session_id}/answer"),
  ("GET", "/api/makeup-styles"),
  ("POST", "/api/makeup-styles"),
  ("POST", "/api/feedback/jobs"),
  ("POST", "/api/feedback/conference-messages"),
  ("GET", "/api/feedback/reports"),
  ("POST", "/api/filter-extractions/jobs"),
  ("POST", "/api/filter-extractions/analyze"),
  ("GET", "/api/filter-extractions/{report_id}"),
  ("GET", "/api/ar/filters"),
  ("GET", "/api/ar/filter-states"),
  ("PUT", "/api/ar/filter-states/{filter_id}"),
  ("POST", "/api/consulting/admin/bookings/{booking_id}/complete"),
  ("PATCH", "/api/consulting/admin/bookings/{booking_id}/status"),
  ("PUT", "/api/consulting/admin/bookings/{booking_id}/summary"),
  ("POST", "/api/consulting/partner/login"),
  ("POST", "/api/consulting/partner/dev/issue-accounts"),
  ("GET", "/api/consulting/partner/me"),
  ("GET", "/api/consulting/partner/business-profile"),
  ("GET", "/api/consulting/partner/experts"),
  ("GET", "/api/consulting/partner/dashboard"),
  ("GET", "/api/consulting/partner/bookings"),
  ("GET", "/api/consulting/partner/bookings/{booking_id}"),
  ("PATCH", "/api/consulting/partner/bookings/{booking_id}/status"),
  ("GET", "/api/consulting/partner/settings"),
  ("PATCH", "/api/consulting/partner/settings"),
  ("GET", "/api/consulting/partner/bookings/{booking_id}/call"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/join"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/end"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/transcription/start"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/transcription/stop"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/captions/translate"),
  ("GET", "/api/consulting/partner/customers"),
  ("GET", "/api/consulting/partner/customers/{customer_id}"),
  ("GET", "/api/consulting/partner/chat/threads"),
  ("GET", "/api/consulting/partner/chat/threads/{thread_id}"),
  ("POST", "/api/consulting/partner/chat/threads/{thread_id}/read"),
  ("GET", "/api/consulting/partner/summaries/{booking_id}"),
  ("POST", "/api/consulting/partner/summaries/{booking_id}/generate"),
  ("POST", "/api/consulting/partner/summaries/{booking_id}/complete"),
  ("POST", "/api/consulting/partner/media/presigned-upload"),
  ("POST", "/api/consulting/partner/media/complete-upload"),
  ("GET", "/api/consulting/partner/shared-reports"),
  ("GET", "/api/consulting/partner/reports/{report_id}"),
  ("GET", "/api/consulting/local-places"),
  ("GET", "/api/consulting/bookings/{booking_id}/call"),
  ("POST", "/api/consulting/bookings/{booking_id}/call/join"),
  ("POST", "/api/consulting/bookings/{booking_id}/call/end"),
  ("PATCH", "/api/consulting/bookings/{booking_id}"),
  ("DELETE", "/api/consulting/bookings/{booking_id}"),
}


def test_openapi_contains_mobile_api_contract_routes() -> None:
  client = TestClient(create_app())

  response = client.get("/openapi.json")

  assert response.status_code == 200
  paths = response.json()["paths"]
  actual_routes = {
    (method.upper(), path)
    for path, operations in paths.items()
    for method in operations
    if method.lower() in {"get", "post", "patch", "put", "delete"}
  }

  assert EXPECTED_ROUTES.issubset(actual_routes)


def test_home_returns_empty_contract_without_database() -> None:
  client = TestClient(create_app())

  response = client.get("/api/home")

  assert response.status_code == 200
  body = response.json()
  assert body["data"] == {
    "hero": None,
    "notices": [],
    "trends": [],
    "filterStore": [],
    "recommendedLooks": [],
  }
  assert body["meta"]["source"] == "empty_not_configured"


def test_products_recommendations_returns_mobile_contract_without_database() -> None:
  client = TestClient(
    create_app(
      Settings(
        database_url=None,
        naver_shopping_client_id=None,
        naver_shopping_client_secret=None,
      ),
    ),
  )

  response = client.get("/api/products/recommendations")

  assert response.status_code == 200
  body = response.json()
  assert body["data"]["userNickname"] == "고객"
  assert body["data"]["tabs"][0] == {"id": "all", "label": "전체"}
  assert body["data"]["products"] == []
  assert body["meta"]["source"] == "fallback"


class ARFilterCatalogDatabase:
  def __init__(self) -> None:
    self.fetch_args = None

  async def fetch(self, _query: str, *args):
    self.fetch_args = args

    return [
      {
        "id": "34b5d10d-4f7b-4398-a8d0-f5334c5d9345",
        "external_key": "filter-clean-smoky-city",
        "category": "recommended",
        "title": "클린 스모키",
        "subtitle": "서브타이틀 fallback",
        "intensity_label": "96% match",
        "filter_payload": {
          "kind": "recommendedMakeupFilter",
          "headline": "차가운 도시의",
          "displayTitle": "클린 스모키",
          "description": "DB에서 온 필터 설명",
          "categoryTags": ["smoky", "brown"],
          "keywords": ["쿨", "스모키"],
          "embeddingVector": [0.92, 0.18],
          "matchScore": 96,
          "sortOrder": 0,
        },
      },
    ]


def test_ar_filters_returns_recommended_makeup_card_contract() -> None:
  db = ARFilterCatalogDatabase()
  app = create_app(Settings())
  app.dependency_overrides[require_database] = lambda: db
  client = TestClient(app)

  response = client.get("/api/ar/filters?kind=recommendedMakeupFilter")

  assert response.status_code == 200
  assert db.fetch_args == ("recommendedMakeupFilter",)
  filter_card = response.json()["data"]["filters"][0]
  assert filter_card["id"] == "filter-clean-smoky-city"
  assert filter_card["databaseId"] == "34b5d10d-4f7b-4398-a8d0-f5334c5d9345"
  assert filter_card["headline"] == "차가운 도시의"
  assert filter_card["displayTitle"] == "클린 스모키"
  assert filter_card["description"] == "DB에서 온 필터 설명"
  assert "imageUrl" not in filter_card
  assert "sourceImageId" not in filter_card
  assert filter_card["filterPayload"]["kind"] == "recommendedMakeupFilter"


def test_partner_caption_translate_broadcasts_mobile_caption_event(monkeypatch) -> None:
  broadcasts: list[tuple[str, dict]] = []

  async def fake_partner_account():
    return {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"}

  async def fake_translate_partner_caption(_db, _account, booking_id, **kwargs):
    assert booking_id == "booking-1"
    assert kwargs["result_id"] == "caption-1"
    assert kwargs["source_language_code"] == "ko-KR"
    assert kwargs["content"] == "안녕하세요"
    return {
      "result_id": "caption-1",
      "source_language_code": "ko-KR",
      "target_language_code": "en",
      "translated_content": "hello",
    }

  class FakeRealtimeManager:
    async def broadcast(self, booking_id: str, payload: dict) -> None:
      broadcasts.append((booking_id, payload))

  monkeypatch.setattr(consulting_call_service, "translate_partner_caption", fake_translate_partner_caption)
  monkeypatch.setattr(consulting_partner_api, "consulting_realtime_manager", FakeRealtimeManager())

  app = create_app(Settings())
  app.dependency_overrides[require_database] = lambda: object()
  app.dependency_overrides[consulting_partner_api.get_partner_account] = fake_partner_account
  client = TestClient(app)

  response = client.post(
    "/api/consulting/partner/bookings/booking-1/call/captions/translate",
    json={
      "resultId": "caption-1",
      "sourceLanguageCode": "ko-KR",
      "content": "안녕하세요",
    },
  )

  assert response.status_code == 200
  assert response.json()["data"] == {
    "resultId": "caption-1",
    "sourceLanguageCode": "ko-KR",
    "targetLanguageCode": "en",
    "translatedContent": "hello",
  }
  assert broadcasts == [
    (
      "booking-1",
      {
        "type": "caption.translation",
        "bookingId": "booking-1",
        "resultId": "caption-1",
        "sourceLanguageCode": "ko-KR",
        "targetLanguageCode": "en",
        "translatedContent": "hello",
      },
    ),
  ]


def _fake_join_response(booking_id: str) -> dict:
  return {
    "call_session_id": "call-1",
    "booking_id": booking_id,
    "participant_type": "user",
    "participant_language_code": "ko-KR",
    "supported_language_codes": ["en-US", "ko-KR"],
    "participant": {"id": "user-1", "type": "customer", "language_code": "ko-KR"},
    "meeting": {"MeetingId": "meeting-1", "MediaRegion": "ap-northeast-2"},
    "attendee": {"AttendeeId": "attendee-1", "ExternalUserId": "customer:booking-1", "JoinToken": "secret-token"},
    "transcription_status": "stopped",
    "transcription_mode": "fixed",
    "transcription": {
      "enabled": True,
      "translation_enabled": True,
      "status": "stopped",
      "mode": "fixed",
      "language_code": None,
      "customer_language_code": "ko-KR",
      "expert_language_code": "ko-KR",
    },
  }


def test_customer_call_join_response_is_not_cacheable(monkeypatch) -> None:
  async def fake_current_user():
    return AuthContext(
      subject="user-1",
      provider="dev",
      email=None,
      name=None,
      claims={},
    )

  async def fake_ensure_user(_db, auth):
    return {"id": auth.subject}

  async def fake_join_customer_call(_db, user_id, booking_id, language_code, _settings):
    assert user_id == "user-1"
    assert booking_id == "booking-1"
    assert language_code == "ko-KR"
    return _fake_join_response(booking_id)

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_call_service, "join_customer_call", fake_join_customer_call)

  app = create_app(Settings(auth_required=False))
  app.dependency_overrides[require_database] = lambda: object()
  app.dependency_overrides[consulting_api.get_current_user] = fake_current_user
  client = TestClient(app)

  response = client.post(
    "/api/consulting/bookings/booking-1/call/join",
    json={"languageCode": "ko-KR"},
  )

  assert response.status_code == 200
  assert response.headers["Cache-Control"] == "no-store"
  assert response.headers["Pragma"] == "no-cache"
  assert response.json()["data"]["call"]["attendee"]["JoinToken"] == "secret-token"


def test_partner_call_join_response_is_not_cacheable(monkeypatch) -> None:
  async def fake_partner_account():
    return {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"}

  async def fake_join_partner_call(_db, account, booking_id, language_code, _settings):
    assert account["id"] == "partner-1"
    assert booking_id == "booking-1"
    assert language_code == "en-US"
    return {
      **_fake_join_response(booking_id),
      "participant_type": "expert",
      "participant_language_code": "en-US",
      "participant": {"id": "partner-1", "type": "partner", "language_code": "en-US"},
      "attendee": {"AttendeeId": "attendee-2", "ExternalUserId": "partner:booking-1", "JoinToken": "partner-token"},
    }

  monkeypatch.setattr(consulting_call_service, "join_partner_call", fake_join_partner_call)

  app = create_app(Settings())
  app.dependency_overrides[require_database] = lambda: object()
  app.dependency_overrides[consulting_partner_api.get_partner_account] = fake_partner_account
  client = TestClient(app)

  response = client.post(
    "/api/consulting/partner/bookings/booking-1/call/join",
    json={"languageCode": "en-US"},
  )

  assert response.status_code == 200
  assert response.headers["Cache-Control"] == "no-store"
  assert response.headers["Pragma"] == "no-cache"
  assert response.json()["data"]["call"]["attendee"]["JoinToken"] == "partner-token"
