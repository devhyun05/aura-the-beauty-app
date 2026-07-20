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
  ("DELETE", "/api/users/me"),
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
  ("POST", "/api/beard/upload-url"),
  ("POST", "/api/beard/prewarm"),
  ("POST", "/api/beard/jobs"),
  ("GET", "/api/beard/jobs/{job_id}"),
  ("POST", "/api/beard/report"),
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
  ("POST", "/api/feedback/conference-preview-messages"),
  ("GET", "/api/feedback/reports"),
  ("GET", "/api/makeup-journey/settings"),
  ("PUT", "/api/makeup-journey/settings"),
  ("GET", "/api/makeup-journey/calendar"),
  ("GET", "/api/makeup-journey/days/{entry_date}"),
  ("GET", "/api/makeup-journey/trends"),
  ("PUT", "/api/makeup-journey/days/{entry_date}/note"),
  ("POST", "/api/makeup-journey/days/{entry_date}/missions/generate"),
  ("POST", "/api/makeup-journey/days/{entry_date}/missions"),
  ("PATCH", "/api/makeup-journey/missions/{mission_id}"),
  ("DELETE", "/api/makeup-journey/missions/{mission_id}"),
  ("POST", "/api/filter-extractions/jobs"),
  ("POST", "/api/filter-extractions/analyze"),
  ("GET", "/api/filter-extractions"),
  ("GET", "/api/filter-extractions/{report_id}"),
  ("GET", "/api/ar/filters"),
  ("GET", "/api/ar/filter-states"),
  ("PUT", "/api/ar/filter-states/{filter_id}"),
  ("GET", "/api/hair-styles"),
  ("POST", "/api/hair-analyses"),
  ("GET", "/api/hair-analyses/{analysis_id}"),
  ("POST", "/api/hair-analyses/{analysis_id}/simulations"),
  ("GET", "/api/hair-simulations"),
  ("GET", "/api/hair-simulations/{simulation_id}"),
  ("POST", "/api/hair-simulations/{simulation_id}/save"),
  ("DELETE", "/api/hair-simulations/{simulation_id}"),
  ("POST", "/api/consulting/admin/bookings/{booking_id}/complete"),
  ("PATCH", "/api/consulting/admin/bookings/{booking_id}/status"),
  ("PUT", "/api/consulting/admin/bookings/{booking_id}/summary"),
  ("GET", "/api/consulting/admin/partner-applications"),
  ("POST", "/api/consulting/admin/partner-applications/{application_id}/approve"),
  ("POST", "/api/consulting/admin/partner-applications/{application_id}/reject"),
  ("POST", "/api/consulting/admin/partner-applications/{application_id}/needs-update"),
  ("POST", "/api/consulting/partner/login"),
  ("POST", "/api/consulting/partner/applications"),
  ("POST", "/api/consulting/partner/me/password"),
  ("GET", "/api/consulting/partner/me"),
  ("GET", "/api/consulting/partner/business-profile"),
  ("GET", "/api/consulting/partner/experts"),
  ("PATCH", "/api/consulting/partner/experts/{expert_id}/avatar"),
  ("GET", "/api/consulting/partner/dashboard"),
  ("GET", "/api/consulting/partner/bookings"),
  ("GET", "/api/consulting/partner/bookings/{booking_id}"),
  ("PATCH", "/api/consulting/partner/bookings/{booking_id}"),
  ("PATCH", "/api/consulting/partner/bookings/{booking_id}/status"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/status"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/payment"),
  ("GET", "/api/consulting/partner/settings"),
  ("PATCH", "/api/consulting/partner/settings"),
  ("GET", "/api/consulting/partner/bookings/{booking_id}/call"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/join"),
  ("POST", "/api/consulting/partner/bookings/{booking_id}/call/end"),
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
  assert body["data"]["products"]
  assert {product["externalSource"] for product in body["data"]["products"]} == {"auradin_catalog"}
  assert body["meta"]["source"] == "auradin_catalog"


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


def _fake_join_response(booking_id: str) -> dict:
  return {
    "call_session_id": "call-1",
    "booking_id": booking_id,
    "participant_type": "user",
    "participant": {"id": "user-1", "type": "customer"},
    "meeting": {"MeetingId": "meeting-1", "MediaRegion": "ap-northeast-2"},
    "attendee": {"AttendeeId": "attendee-1", "ExternalUserId": "customer:booking-1", "JoinToken": "secret-token"},
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

  async def fake_join_customer_call(_db, user_id, booking_id, _settings):
    assert user_id == "user-1"
    assert booking_id == "booking-1"
    return _fake_join_response(booking_id)

  monkeypatch.setattr(consulting_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(consulting_call_service, "join_customer_call", fake_join_customer_call)

  app = create_app(Settings(auth_required=False))
  app.dependency_overrides[require_database] = lambda: object()
  app.dependency_overrides[consulting_api.get_current_user] = fake_current_user
  client = TestClient(app)

  response = client.post(
    "/api/consulting/bookings/booking-1/call/join",
  )

  assert response.status_code == 200
  assert response.headers["Cache-Control"] == "no-store"
  assert response.headers["Pragma"] == "no-cache"
  assert response.json()["data"]["call"]["attendee"]["JoinToken"] == "secret-token"


def test_partner_call_join_response_is_not_cacheable(monkeypatch) -> None:
  async def fake_partner_account():
    return {"id": "partner-1", "role": "expert", "expert_id": "exp_sea"}

  async def fake_join_partner_call(_db, account, booking_id, _settings):
    assert account["id"] == "partner-1"
    assert booking_id == "booking-1"
    return {
      **_fake_join_response(booking_id),
      "participant_type": "expert",
      "participant": {"id": "partner-1", "type": "partner"},
      "attendee": {"AttendeeId": "attendee-2", "ExternalUserId": "partner:booking-1", "JoinToken": "partner-token"},
    }

  monkeypatch.setattr(consulting_call_service, "join_partner_call", fake_join_partner_call)

  app = create_app(Settings())
  app.dependency_overrides[require_database] = lambda: object()
  app.dependency_overrides[consulting_partner_api.get_partner_account] = fake_partner_account
  client = TestClient(app)

  response = client.post(
    "/api/consulting/partner/bookings/booking-1/call/join",
  )

  assert response.status_code == 200
  assert response.headers["Cache-Control"] == "no-store"
  assert response.headers["Pragma"] == "no-cache"
  assert response.json()["data"]["call"]["attendee"]["JoinToken"] == "partner-token"
