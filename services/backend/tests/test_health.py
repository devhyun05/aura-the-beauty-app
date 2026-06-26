from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app


def test_health_without_database_url() -> None:
  client = TestClient(create_app(Settings()))

  response = client.get("/health")

  assert response.status_code == 200
  body = response.json()
  assert body["data"]["status"] == "ok"
  assert body["data"]["database"] == "not_configured"
  assert body["error"] is None


def test_health_config_does_not_expose_secret_values() -> None:
  client = TestClient(create_app(Settings()))

  response = client.get("/api/health/config")

  assert response.status_code == 200
  body = response.json()
  assert body["data"]["awsRegion"] == "ap-northeast-2"
  assert body["data"]["items"]["databaseUrl"]["configured"] is False
  assert "databaseUrl" in body["data"]["missing"]
  assert "postgresql://" not in response.text