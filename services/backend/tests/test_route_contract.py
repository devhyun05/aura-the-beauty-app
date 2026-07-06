from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app


EXPECTED_ROUTES = {
  ("GET", "/health"),
  ("GET", "/api/health"),
  ("GET", "/api/health/db"),
  ("GET", "/api/health/config"),
  ("GET", "/api/users/me"),
  ("PATCH", "/api/users/me/profile"),
  ("GET", "/api/home"),
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
