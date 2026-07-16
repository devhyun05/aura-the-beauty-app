from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.main import create_app
from app.services.auradin_agent.snapshot_manifest import resolve_and_validate_snapshot


def _active_snapshot():
  return resolve_and_validate_snapshot(Settings(), force=True)


def test_health_without_database_url() -> None:
  active = _active_snapshot()
  client = TestClient(create_app(Settings()))

  response = client.get("/health")

  assert response.status_code == 200
  body = response.json()
  assert body["data"]["status"] == "ok"
  assert body["data"]["database"] == "not_configured"
  assert body["data"]["snapshotRunDate"] == active.run_date
  assert body["data"]["snapshotManifestSha256"] == active.manifest_sha256
  assert len(body["data"]["snapshotManifestSha256"]) == 64
  assert body["error"] is None


def test_health_ready_exposes_non_sensitive_snapshot_identity() -> None:
  active = _active_snapshot()
  client = TestClient(create_app(Settings()))

  response = client.get("/health/ready")

  assert response.status_code == 200
  data = response.json()["data"]
  assert data["status"] == "ready"
  assert data["snapshotSource"] == "active_pointer"
  assert data["snapshotRunDate"] == active.run_date
  assert data["snapshotManifestSha256"] == active.manifest_sha256
  assert set(data) == {
    "status",
    "snapshotSource",
    "snapshotRunDate",
    "snapshotManifestSha256",
  }


def test_lifespan_binds_validated_snapshot_before_serving() -> None:
  active = _active_snapshot()
  app = create_app(Settings(database_url=None))

  with TestClient(app) as client:
    response = client.get("/health/ready")
    descriptor = app.state.auradin_snapshot

  assert response.status_code == 200
  assert descriptor.run_date == active.run_date
  assert descriptor.manifest_sha256 == active.manifest_sha256
  assert response.json()["data"]["snapshotManifestSha256"] == descriptor.manifest_sha256


def test_health_config_does_not_expose_secret_values() -> None:
  client = TestClient(create_app(Settings()))

  response = client.get("/api/health/config")

  assert response.status_code == 200
  body = response.json()
  assert body["data"]["awsRegion"] == "ap-northeast-2"
  assert body["data"]["items"]["databaseUrl"]["configured"] is False
  assert "databaseUrl" in body["data"]["missing"]
  assert "postgresql://" not in response.text
