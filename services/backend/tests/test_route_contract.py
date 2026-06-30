from fastapi.testclient import TestClient

from app.core.settings import Settings
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
  ("GET", "/api/makeup-styles"),
  ("POST", "/api/makeup-styles"),
  ("POST", "/api/feedback/jobs"),
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
