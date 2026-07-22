import asyncio
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest
from botocore.exceptions import UnauthorizedSSOTokenError

from app.api import health as health_api
from app.core.settings import Settings
from app.main import create_app
from app.services import bedrock_credential_readiness as bedrock_readiness
from app.services.auradin_agent.snapshot_manifest import resolve_and_validate_snapshot
from app.services.bedrock_credential_readiness import BedrockCredentialReadiness


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
  client = TestClient(create_app(Settings(makeup_recommendation_v2_enabled=False)))

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
  app = create_app(Settings(database_url=None, makeup_recommendation_v2_enabled=False))

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


class _FakeBedrockCredentialProbe:
  def __init__(self, result: BedrockCredentialReadiness) -> None:
    self.result = result
    self.calls = 0

  async def check(self, _settings: Settings) -> BedrockCredentialReadiness:
    self.calls += 1
    return self.result


def test_health_ready_checks_bedrock_credentials_when_makeup_v2_is_enabled() -> None:
  app = create_app(Settings(makeup_recommendation_v2_enabled=True))
  probe = _FakeBedrockCredentialProbe(
    BedrockCredentialReadiness(status="ready", credential_source="profile"),
  )
  app.state.makeup_recommendation_bedrock_credential_probe = probe

  response = TestClient(app).get("/health/ready")

  assert response.status_code == 200
  assert probe.calls == 1
  assert response.json()["data"]["makeupRecommendationBedrock"] == {
    "status": "ready",
    "credentialSource": "profile",
  }


def test_health_ready_reports_all_generation_credential_sources() -> None:
  app = create_app(Settings(makeup_recommendation_v2_enabled=True))
  probe = _FakeBedrockCredentialProbe(
    BedrockCredentialReadiness(
      status="ready",
      credential_source="profile",
      credential_sources=("profile", "static"),
    ),
  )
  app.state.makeup_recommendation_bedrock_credential_probe = probe

  response = TestClient(app).get("/health/ready")

  assert response.status_code == 200
  assert response.json()["data"]["makeupRecommendationBedrock"] == {
    "status": "ready",
    "credentialSource": "profile",
    "credentialSources": ["profile", "static"],
  }


def test_health_ready_skips_bedrock_credentials_when_makeup_v2_is_disabled() -> None:
  app = create_app(Settings(makeup_recommendation_v2_enabled=False))
  probe = _FakeBedrockCredentialProbe(
    BedrockCredentialReadiness(status="not_ready", reason="must_not_be_called"),
  )
  app.state.makeup_recommendation_bedrock_credential_probe = probe

  response = TestClient(app).get("/health/ready")

  assert response.status_code == 200
  assert probe.calls == 0
  assert "makeupRecommendationBedrock" not in response.json()["data"]


def test_health_ready_returns_non_sensitive_503_for_bedrock_credential_failure() -> None:
  app = create_app(Settings(makeup_recommendation_v2_enabled=True))
  probe = _FakeBedrockCredentialProbe(
    BedrockCredentialReadiness(status="not_ready", reason="credentials_expired"),
  )
  app.state.makeup_recommendation_bedrock_credential_probe = probe

  response = TestClient(app).get("/health/ready")

  assert response.status_code == 503
  assert response.json()["error"] == {
    "code": "MAKEUP_RECOMMENDATION_BEDROCK_NOT_READY",
    "message": "Makeup recommendation Bedrock credentials are not ready.",
    "details": {
      "component": "makeup_recommendation_bedrock",
      "status": "not_ready",
      "reason": "credentials_expired",
    },
  }
  assert "access" not in response.text.lower()
  assert "secret" not in response.text.lower()


def test_health_ready_uses_configured_bedrock_credential_timeout(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  configured_timeouts: list[float] = []

  class CapturingProbe:
    def __init__(self, *, timeout_seconds: float) -> None:
      configured_timeouts.append(timeout_seconds)

    async def check(self, _settings: Settings) -> BedrockCredentialReadiness:
      return BedrockCredentialReadiness(status="ready", credential_source="profile")

  monkeypatch.setattr(health_api, "BedrockCredentialReadinessProbe", CapturingProbe)
  app = create_app(
    Settings(
      makeup_recommendation_v2_enabled=True,
      bedrock_credential_readiness_timeout_seconds=7.5,
    ),
  )

  response = TestClient(app).get("/health/ready")

  assert response.status_code == 200
  assert configured_timeouts == [7.5]


class _FakeFrozenCredentials:
  access_key = "test-access-key"
  secret_key = "test-secret-key"


class _FakeCredentials:
  def __init__(self, expiry_time: datetime | None = None) -> None:
    self._expiry_time = expiry_time

  def get_frozen_credentials(self) -> _FakeFrozenCredentials:
    return _FakeFrozenCredentials()


def test_bedrock_readiness_maps_every_generation_runtime_credential_path() -> None:
  assert bedrock_readiness._generation_credential_sources(
    Settings(
      aws_profile_name="local-profile",
      aws_access_key_id="test-access-key",
      aws_secret_access_key="test-secret-key",
    ),
  ) == ("profile", "static")
  assert bedrock_readiness._generation_credential_sources(
    Settings(aws_profile_name="local-profile"),
  ) == ("profile", "provider_chain")
  assert bedrock_readiness._generation_credential_sources(
    Settings(aws_access_key_id="test-access-key", aws_secret_access_key="test-secret-key"),
  ) == ("provider_chain", "static")
  assert bedrock_readiness._generation_credential_sources(
    Settings(aws_use_iam_role=True),
  ) == ("iam_role",)


def test_bedrock_readiness_resolves_static_profile_and_iam_role_credentials(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  session_kwargs: list[dict[str, str]] = []

  class FakeSession:
    def __init__(self, **kwargs: str) -> None:
      session_kwargs.append(kwargs)

    def get_credentials(self) -> _FakeCredentials:
      return _FakeCredentials()

    def client(self, service_name: str, **_kwargs):
      assert service_name == "sts"

      class FakeStsClient:
        def get_caller_identity(self) -> dict[str, str]:
          return {"Account": "123456789012", "Arn": "arn:aws:iam::123456789012:user/test"}

      return FakeStsClient()

  monkeypatch.setattr(bedrock_readiness.boto3, "Session", FakeSession)

  profile_and_static = bedrock_readiness._resolve_credentials(
    Settings(
      aws_profile_name="local-profile",
      aws_access_key_id="test-access-key",
      aws_secret_access_key="test-secret-key",
    ),
  )
  role = bedrock_readiness._resolve_credentials(Settings(aws_use_iam_role=True))

  assert [profile_and_static.credential_source, role.credential_source] == [
    "profile",
    "iam_role",
  ]
  assert profile_and_static.public_status() == {
    "status": "ready",
    "credential_source": "profile",
    "credential_sources": ["profile", "static"],
  }
  assert session_kwargs[0]["profile_name"] == "local-profile"
  assert session_kwargs[1]["aws_access_key_id"] == "test-access-key"
  assert set(session_kwargs[2]) == {"region_name"}
  assert "test-access-key" not in str(profile_and_static.public_status())
  assert "test-secret-key" not in str(profile_and_static.public_status())


def test_bedrock_readiness_rejects_invalid_static_used_by_analysis_even_when_profile_is_valid(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeSession:
    def __init__(self, **kwargs: str) -> None:
      self.source = "static" if "aws_access_key_id" in kwargs else "profile"

    def get_credentials(self) -> _FakeCredentials:
      return _FakeCredentials()

    def client(self, service_name: str, **_kwargs):
      assert service_name == "sts"

      class InvalidStsClient:
        def get_caller_identity(self) -> dict[str, str]:
          raise RuntimeError("invalid static credentials")

      return InvalidStsClient()

  monkeypatch.setattr(bedrock_readiness.boto3, "Session", FakeSession)

  result = bedrock_readiness._resolve_credentials(
    Settings(
      aws_profile_name="local-profile",
      aws_access_key_id="invalid-access-key",
      aws_secret_access_key="invalid-secret-key",
    ),
  )

  assert result.public_status() == {
    "status": "not_ready",
    "reason": "credentials_invalid",
    "failed_credential_source": "static",
    "credential_sources": ["profile", "static"],
  }
  assert "invalid-access-key" not in str(result.public_status())
  assert "invalid-secret-key" not in str(result.public_status())


def test_bedrock_readiness_rejects_expired_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
  class FakeSession:
    def __init__(self, **_kwargs: str) -> None:
      pass

    def get_credentials(self) -> _FakeCredentials:
      return _FakeCredentials(datetime.now(timezone.utc) - timedelta(seconds=1))

  monkeypatch.setattr(bedrock_readiness.boto3, "Session", FakeSession)

  result = bedrock_readiness._resolve_credentials(Settings(aws_use_iam_role=True))

  assert result.public_status() == {"status": "not_ready", "reason": "credentials_expired"}


def test_bedrock_readiness_classifies_expired_profile_session(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class FakeSession:
    def __init__(self, **_kwargs: str) -> None:
      pass

    def get_credentials(self):
      raise UnauthorizedSSOTokenError()

  monkeypatch.setattr(bedrock_readiness.boto3, "Session", FakeSession)

  result = bedrock_readiness._resolve_credentials(Settings(aws_profile_name="aura-dev"))

  assert result.public_status() == {
    "status": "not_ready",
    "reason": "credentials_expired",
    "failed_credential_source": "profile",
    "credential_sources": ["profile", "provider_chain"],
  }


def test_bedrock_readiness_probe_caches_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
  calls = 0

  def fake_resolve(_settings: Settings) -> BedrockCredentialReadiness:
    nonlocal calls
    calls += 1
    return BedrockCredentialReadiness(status="ready", credential_source="provider_chain")

  monkeypatch.setattr(bedrock_readiness, "_resolve_credentials", fake_resolve)
  probe = bedrock_readiness.BedrockCredentialReadinessProbe(success_cache_seconds=30)

  async def run_checks() -> None:
    await probe.check(Settings())
    await probe.check(Settings())

  asyncio.run(run_checks())

  assert calls == 1


def test_bedrock_readiness_probe_times_out_without_blocking_endpoint(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  def slow_resolve(_settings: Settings) -> BedrockCredentialReadiness:
    time.sleep(0.05)
    return BedrockCredentialReadiness(status="ready", credential_source="provider_chain")

  monkeypatch.setattr(bedrock_readiness, "_resolve_credentials", slow_resolve)
  probe = bedrock_readiness.BedrockCredentialReadinessProbe(timeout_seconds=0.001)

  result = asyncio.run(probe.check(Settings()))

  assert result.public_status() == {
    "status": "not_ready",
    "reason": "credential_resolution_timeout",
  }


def test_bedrock_readiness_probe_allows_slow_resolution_within_configured_timeout(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  def slow_resolve(_settings: Settings) -> BedrockCredentialReadiness:
    time.sleep(0.03)
    return BedrockCredentialReadiness(status="ready", credential_source="profile")

  monkeypatch.setattr(bedrock_readiness, "_resolve_credentials", slow_resolve)
  probe = bedrock_readiness.BedrockCredentialReadinessProbe(timeout_seconds=0.1)

  result = asyncio.run(probe.check(Settings()))

  assert result.public_status() == {
    "status": "ready",
    "credential_source": "profile",
  }
