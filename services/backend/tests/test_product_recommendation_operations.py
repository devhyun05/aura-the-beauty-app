from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.main import create_app
from app.ops.cleanup_product_recommendation_data import cleanup_product_recommendation_data
from app.ops.audit_product_catalog import catalog_audit_has_failures
from app.services.product_catalog_operations import audit_product_catalog
from app.services.product_cohorts import refresh_color_cohort_memberships


def test_public_feature_status_is_honest_without_a_catalog_database() -> None:
  client = TestClient(create_app(Settings(database_url=None)))
  response = client.get("/api/products/features")
  assert response.status_code == 200
  data = response.json()["data"]
  assert data["catalogConfigured"] is False
  assert data["externalDataReady"] is False
  assert data["readiness"] == {
    "eligibleProducts": 0,
    "arEligibleProducts": 0,
    "publishedSeasonalCollections": 0,
  }


def test_catalog_monitor_exit_gate_catches_invalid_or_relational_rows() -> None:
  assert not catalog_audit_has_failures({"invalid": 0, "relationshipMismatches": {"offers": 0}})
  assert catalog_audit_has_failures({"invalid": 1, "relationshipMismatches": {}})
  assert catalog_audit_has_failures({"invalid": 0, "relationshipMismatches": {"offers": 1}})


def test_seasonal_public_response_supports_etag_even_when_empty() -> None:
  client = TestClient(create_app(Settings(database_url=None)))
  first = client.get("/api/products/recommendations/seasonal")
  assert first.status_code == 200
  assert first.json()["data"]["status"] == "empty"
  assert first.headers["cache-control"].startswith("public")
  etag = first.headers["etag"]
  second = client.get("/api/products/recommendations/seasonal", headers={"If-None-Match": etag})
  assert second.status_code == 304
  assert second.headers["etag"] == etag


def test_search_returns_unavailable_instead_of_fixture_products_without_db() -> None:
  client = TestClient(create_app(Settings(database_url=None)))
  response = client.get("/api/products/search", params={"q": "립"})
  assert response.status_code == 200
  assert response.headers["cache-control"] == "private, no-store"
  assert response.json()["data"]["status"] == "unavailable"
  assert response.json()["data"]["items"] == []


class _CleanupDb:
  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple[object, ...]]] = []

  async def fetchrow(self, _query: str, *_args):
    return {"count": 1}

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "DELETE 1"


@pytest.mark.asyncio
async def test_retention_job_deletes_expired_data_and_minimizes_old_search_text(monkeypatch) -> None:
  settings = Settings(
    product_event_retention_days=7,
    product_raw_search_retention_days=3,
  )
  monkeypatch.setattr("app.ops.cleanup_product_recommendation_data.get_settings", lambda: settings)
  db = _CleanupDb()
  result = await cleanup_product_recommendation_data(db, dry_run=False)  # type: ignore[arg-type]
  assert result == {
    "events": 1,
    "profiles": 1,
    "runs": 1,
    "cohorts": 1,
    "auradinSessions": 1,
    "rawSearchQueries": 1,
  }
  assert sum("delete from" in query.lower() for query, _ in db.executed) == 5
  assert any("delete from auradin_search_sessions" in query.lower() for query, _ in db.executed)
  assert any("context=context - 'query'" in query for query, _ in db.executed)


class _CohortDb:
  def __init__(self) -> None:
    self.rows = [
      {"user_id": uuid4(), "preference_payload": {"color_family:mauve": 5}, "contribution_count": 100},
      {"user_id": uuid4(), "preference_payload": {"color_family:coral": 4}, "contribution_count": 999},
    ]
    self.executed: list[tuple[str, tuple[object, ...]]] = []

  async def fetch(self, _query: str):
    return self.rows

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "OK"


@pytest.mark.asyncio
async def test_cohort_refresh_merges_rare_buckets_and_caps_contribution() -> None:
  db = _CohortDb()
  result = await refresh_color_cohort_memberships(
    db,  # type: ignore[arg-type]
    Settings(cohort_recommendations_v1=True, product_cohort_min_size=3),
  )
  assert result == {"eligible": 2, "memberships": 2, "mergedRare": 2}
  inserts = [(query, args) for query, args in db.executed if "insert into product_color_cohort_memberships" in query]
  assert len(inserts) == 2
  assert all(args[1] == "preference-v2:other" for _, args in inserts)
  assert all("'broad_preference_v2'" in query for query, _ in inserts)
  assert all(0 <= args[2] <= 100 for _, args in inserts)


class _EmptyCatalogAuditDb:
  pool = object()

  async def fetch(self, _query: str, *_args):
    return []


@pytest.mark.asyncio
async def test_catalog_integrity_audit_is_safe_on_an_empty_trusted_catalog() -> None:
  result = await audit_product_catalog(_EmptyCatalogAuditDb(), Settings())  # type: ignore[arg-type]
  assert result == {
    "scanned": 0,
    "invalid": 0,
    "quarantined": 0,
    "productIds": [],
    "relationshipMismatches": {},
  }


@pytest.mark.asyncio
async def test_catalog_quarantine_requires_an_audited_actor() -> None:
  with pytest.raises(AppError) as error:
    await audit_product_catalog(
      _EmptyCatalogAuditDb(),  # type: ignore[arg-type]
      Settings(),
      apply_quarantine=True,
      actor_user_id=None,
    )
  assert error.value.code == "INVALID_CATALOG_ACTOR"
