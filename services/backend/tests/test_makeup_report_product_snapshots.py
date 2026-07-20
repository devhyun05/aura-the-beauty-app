from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from typing import Any
from uuid import UUID

import pytest
from fastapi import BackgroundTasks

from app.api import makeup_recommendations as makeup_api
from app.core.settings import Settings
from app.services import makeup_report_product_discovery as discovery
from app.services import makeup_report_product_snapshots as snapshots


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
REPORT_ID = UUID("22222222-2222-2222-2222-222222222222")
RUN_ID = UUID("33333333-3333-3333-3333-333333333333")
INTERNAL_PRODUCT_ID = UUID("44444444-4444-4444-4444-444444444444")
SECOND_INTERNAL_PRODUCT_ID = UUID("55555555-5555-5555-5555-555555555555")
SHADE_ID = UUID("66666666-6666-6666-6666-666666666666")


def _legacy_look() -> dict[str, Any]:
  """An early V2 recipe: guide-level fields exist, applicationPlan does not."""

  return {
    "id": "anchor-look",
    "role": "anchor",
    "title": "퇴근 후 로즈 룩",
    "summary": "저장된 보고서 요약",
    "durationMinutes": 25,
    "areaGuides": [
      {
        "area": "base",
        "color": {"name": "내추럴 베이지", "hex": "#D8AA92"},
        "texture": "촉촉한 글로우",
        "steps": ["쿠션을 얇게 두드려요"],
        "products": ["쿠션 파운데이션"],
      },
      {
        "area": "brow",
        "color": {"name": "내추럴 브라운", "hex": "#6E5148"},
        "texture": "내추럴",
        "steps": ["결을 따라 채워요"],
        "products": ["아이브로우 펜슬"],
      },
      {
        "area": "eye",
        "color": {"name": "소프트 로즈", "hex": "#B96872"},
        "texture": "새틴",
        "steps": ["섀도를 펴고 아이라인을 채워요"],
        "products": ["아이섀도 팔레트", "아이라이너"],
      },
      {
        "area": "cheek",
        "color": {"name": "로지 피치", "hex": "#D98A91"},
        "texture": "크림",
        "steps": ["볼 중앙에 얹어요"],
        "products": ["크림 블러셔"],
      },
      {
        "area": "lip",
        "color": {"name": "뮤티드 로즈", "hex": "#B85E6D"},
        "texture": "글로우",
        "steps": ["안쪽부터 그라데이션해요"],
        "products": ["글로우 틴트"],
      },
    ],
  }


def _legacy_report() -> dict[str, Any]:
  return {
    "id": REPORT_ID,
    "recommendation": {"looks": [_legacy_look()]},
    "context_snapshot": {
      "analysisReport": {"skinType": "복합성"},
      "selection": {
        "customSituationText": "SECRET USER FREE TEXT",
      },
    },
    "schema_version": "makeup-recommendation-v2",
  }


class SnapshotDatabase:
  """Small SQL-shaped fake that preserves run rows across service calls."""

  is_connected = True

  def __init__(self, report: dict[str, Any] | None = None) -> None:
    self.report = deepcopy(report or _legacy_report())
    self.runs: list[dict[str, Any]] = []
    self.insert_count = 0
    self.claim_count = 0
    self.execute_count = 0

  @staticmethod
  def _query(query: str) -> str:
    return " ".join(query.lower().split())

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    normalized = self._query(query)
    if "from makeup_recommendation_reports" in normalized:
      report_id, user_id = args
      if report_id != REPORT_ID or user_id != USER_ID:
        return None
      return deepcopy(self.report)

    if "insert into product_recommendation_runs" in normalized:
      (
        run_id,
        user_id,
        report_id,
        look_id,
        recipe_hash,
        catalog_version,
        algorithm_version,
      ) = args
      revisions = [
        int(row["revision"])
        for row in self.runs
        if row["user_id"] == user_id
        and row["source_makeup_report_id"] == report_id
        and row["source_look_id"] == look_id
        and row["strategy"] == snapshots.SNAPSHOT_STRATEGY
      ]
      now = datetime.now(timezone.utc)
      row = {
        "id": run_id,
        "user_id": user_id,
        "source_makeup_report_id": report_id,
        "source_look_id": look_id,
        "recipe_hash": recipe_hash,
        "catalog_version": catalog_version,
        "strategy": snapshots.SNAPSHOT_STRATEGY,
        "algorithm_version": algorithm_version,
        "status": "pending",
        "revision": max(revisions, default=0) + 1,
        "recommendation_payload": {},
        "product_ids": [],
        "created_at": now,
        "started_at": None,
        "completed_at": None,
        "error_code": None,
        "expires_at": datetime.max.replace(tzinfo=timezone.utc),
      }
      self.runs.append(row)
      self.insert_count += 1
      return row

    if normalized.startswith("update product_recommendation_runs") and "returning" in normalized:
      run_id = args[0]
      row = next((candidate for candidate in self.runs if candidate["id"] == run_id), None)
      self.claim_count += 1
      if row is None:
        return None
      stale = row["status"] == "processing" and (
        row.get("started_at") is None
        or row["started_at"] <= datetime.now(timezone.utc) - snapshots.PROCESSING_STALE_AFTER
      )
      if row["status"] != "pending" and not stale:
        return None
      row.update({
        "status": "processing",
        "started_at": datetime.now(timezone.utc),
        "completed_at": None,
        "error_code": None,
      })
      return dict(row)

    if "from product_recommendation_runs" in normalized:
      user_id, report_id, look_id, *rest = args
      recipe_hash = rest[0] if rest else None
      matches = [
        row
        for row in self.runs
        if row["user_id"] == user_id
        and row["source_makeup_report_id"] == report_id
        and row["source_look_id"] == look_id
        and (recipe_hash is None or row["recipe_hash"] == recipe_hash)
        and row["strategy"] == snapshots.SNAPSHOT_STRATEGY
      ]
      return max(
        matches,
        key=lambda row: (int(row["revision"]), row["created_at"]),
        default=None,
      )

    raise AssertionError(f"unexpected fetchrow query: {query}")

  async def execute(self, query: str, *args: Any) -> None:
    normalized = self._query(query)
    run_id = args[0]
    row = next(candidate for candidate in self.runs if candidate["id"] == run_id)
    self.execute_count += 1
    if "set status=$2" in normalized:
      _, status, raw_payload, product_ids, lease_started_at = args
      if row["status"] != "processing" or row["started_at"] != lease_started_at:
        return
      row.update({
        "status": status,
        "recommendation_payload": json.loads(raw_payload),
        "product_ids": list(product_ids),
        "completed_at": datetime.now(timezone.utc),
        "error_code": None,
      })
      return
    if "set status='failed'" in normalized:
      _, error_code, lease_started_at = args
      if row["status"] != "processing" or row["started_at"] != lease_started_at:
        return
      row.update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc),
        "error_code": error_code,
      })
      return
    raise AssertionError(f"unexpected execute query: {query}")


class RollingDeployConflictDatabase(SnapshotDatabase):
  """Simulate another algorithm/catalog release winning the next revision."""

  def __init__(self) -> None:
    super().__init__()
    self.conflict_next_insert = False

  async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
    normalized = self._query(query)
    if self.conflict_next_insert and "insert into product_recommendation_runs" in normalized:
      self.conflict_next_insert = False
      winner_args = list(args)
      winner_args[4] = "f" * 64
      winner_args[5] = "catalog:rolling-release"
      winner_args[6] = "makeup_report_hybrid_rolling"
      await super().fetchrow(query, *winner_args)
      return None
    return await super().fetchrow(query, *args)


def _use_test_catalog_version(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(snapshots, "_catalog_snapshot_version", lambda _settings: "catalog:test")


def test_recipe_hash_ignores_image_fit_and_generated_copy_but_tracks_matching_steps() -> None:
  report = _legacy_report()
  normalized, look = snapshots.resolve_report_look(report["recommendation"], "anchor-look")
  assert look is not None
  initial = snapshots._recipe_hash(look, report["context_snapshot"])

  look["fitAssessment"] = {"score": 99, "summary": "image-only result"}
  look["summary"] = "generated copy changed after image completion"
  assert snapshots._recipe_hash(look, report["context_snapshot"]) == initial

  look["areaGuides"][0]["applicationPlan"]["steps"][0]["productType"] = "컨실러"
  assert snapshots._recipe_hash(look, report["context_snapshot"]) != initial


@pytest.mark.asyncio
async def test_legacy_recipe_creates_one_durable_pending_run_and_ordinary_ensure_reuses_it(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  compute_calls = 0

  async def compute_should_not_run(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    nonlocal compute_calls
    compute_calls += 1
    raise AssertionError("ensure must not calculate recommendations inline")

  monkeypatch.setattr(snapshots, "get_makeup_report_product_recommendations", compute_should_not_run)
  db = SnapshotDatabase()

  first = await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  )
  # This non-recipe user prose is intentionally absent from the idempotency
  # hash. Editing it must not create a different product ranking snapshot.
  db.report["context_snapshot"]["selection"]["customSituationText"] = "CHANGED SECRET TEXT"
  monkeypatch.setattr(snapshots, "_catalog_snapshot_version", lambda _settings: "catalog:new-release")
  second = await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  )

  normalized = snapshots.normalize_makeup_report_recommendation(db.report["recommendation"])
  assert "applicationPlan" in normalized["looks"][0]["areaGuides"][0]
  assert "applicationPlan" not in db.report["recommendation"]["looks"][0]["areaGuides"][0]
  assert first[0]["id"] == second[0]["id"]
  assert first[0]["status"] == "pending"
  assert first[0]["source_look_id"] == "anchor-look"
  assert len(first[0]["recipe_hash"]) == 64
  assert first[0]["catalog_version"] == "catalog:test"
  assert db.insert_count == 1
  assert len(db.runs) == 1
  assert compute_calls == 0


@pytest.mark.asyncio
async def test_fallback_era_run_is_not_reused_for_verified_only_contract(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  db = SnapshotDatabase()
  old_run = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]
  old_run.update({
    "algorithm_version": "makeup_report_hybrid_v3",
    "status": "ready",
    "recommendation_payload": {
      "ranking": {
        "fallback": {
          "mode": "rules_only_with_catalog_supplement",
          "reasonCodes": ["SUPPLEMENTAL_AURADIN_APPLIED"],
          "supplementalAuradinApplied": True,
        },
      },
      "groups": [{
        "category": "lip",
        "items": [{
          "productId": "external-lip",
          "externalSource": snapshots.AURADIN_CATALOG_SOURCE,
        }],
      }],
    },
  })

  current = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]

  assert current["id"] != old_run["id"]
  assert current["algorithm_version"] == snapshots.ALGORITHM_VERSION
  assert current["revision"] == 2
  assert current["status"] == "pending"
  assert db.insert_count == 2


@pytest.mark.asyncio
async def test_force_refresh_creates_next_revision_without_replacing_the_previous_run(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  db = SnapshotDatabase()
  first = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]
  refreshed = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    force=True,
  ))[0]

  assert first["id"] != refreshed["id"]
  assert first["revision"] == 1
  assert refreshed["revision"] == 2
  assert first["recipe_hash"] == refreshed["recipe_hash"]
  assert [run["status"] for run in db.runs] == ["pending", "pending"]


@pytest.mark.asyncio
async def test_cross_release_refresh_conflict_reuses_the_winning_look_revision(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  db = RollingDeployConflictDatabase()
  first = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]

  db.conflict_next_insert = True
  refreshed = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    force=True,
  ))[0]

  assert refreshed["id"] == db.runs[-1]["id"]
  assert refreshed["id"] != first["id"]
  assert refreshed["revision"] == 2
  assert refreshed["recipe_hash"] == "f" * 64
  assert refreshed["algorithm_version"] == "makeup_report_hybrid_rolling"


@pytest.mark.asyncio
async def test_worker_claims_once_and_persists_only_sanitized_terminal_snapshot(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  db = SnapshotDatabase()
  run = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]
  compute_calls: list[dict[str, Any]] = []

  async def compute(*_args: Any, **kwargs: Any) -> dict[str, Any]:
    compute_calls.append(kwargs)
    return {
      "status": "ready",
      "report": {
        "scenario": "SECRET USER FREE TEXT",
        "looks": [{"imageUrl": "https://signed.example.com/private-look.png?signature=secret"}],
      },
      "selectedLook": {
        "imageUrl": "https://signed.example.com/private-look.png?signature=secret",
      },
      "userText": "SECRET USER FREE TEXT",
      "groups": [{
        "category": "lip",
        "label": "립",
        "status": "ready",
        "target": {"colorHex": "#B85E6D", "colorFamily": "rose"},
        "items": [
          {
            "productId": str(INTERNAL_PRODUCT_ID),
            "shadeId": str(SHADE_ID),
            "productName": "검증 립",
            "imageUrl": "https://cdn.example.com/product.png",
            "matchPercent": 96,
          },
          {
            "productId": "auradin-lip-1",
            "productName": "외부 립",
            "externalSource": "auradin_verified_snapshot",
            "imageUrl": "https://cdn.example.com/external-product.png",
          },
        ],
        "source": "verified_catalog",
        "degraded": False,
        "degradedReason": None,
      }],
      "ranking": {"embeddingApplied": True},
      "algorithmVersion": "test-algorithm-v1",
    }

  monkeypatch.setattr(snapshots, "get_makeup_report_product_recommendations", compute)
  await snapshots.run_makeup_report_product_snapshot_jobs(
    [run["id"], run["id"]],
    Settings(),
    db=db,
  )

  persisted = db.runs[0]
  serialized = json.dumps(persisted["recommendation_payload"], ensure_ascii=False)
  assert len(compute_calls) == 1
  assert compute_calls[0]["look_id"] == "anchor-look"
  assert compute_calls[0]["categories"] == list(snapshots.DEFAULT_CATEGORIES)
  assert compute_calls[0]["per_category_limit"] == snapshots.SNAPSHOT_PER_CATEGORY_LIMIT
  assert persisted["status"] == "ready"
  assert persisted["completed_at"] is not None
  assert persisted["error_code"] is None
  assert persisted["product_ids"] == [INTERNAL_PRODUCT_ID]
  assert "report" not in persisted["recommendation_payload"]
  assert "selectedLook" not in persisted["recommendation_payload"]
  assert "signed.example.com" not in serialized
  assert "SECRET USER FREE TEXT" not in serialized
  assert persisted["recommendation_payload"]["groups"][0]["items"][0]["productId"] == str(
    INTERNAL_PRODUCT_ID
  )
  # A ready terminal row cannot be claimed again, even if the queue delivers
  # the same job more than once.
  await snapshots.run_makeup_report_product_snapshot_jobs([run["id"]], Settings(), db=db)
  assert len(compute_calls) == 1


@pytest.mark.asyncio
async def test_worker_failure_is_durable_and_does_not_persist_private_exception_text(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  db = SnapshotDatabase()
  run = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]
  compute_calls = 0

  async def fail(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    nonlocal compute_calls
    compute_calls += 1
    raise RuntimeError("SECRET provider diagnostic and user text")

  monkeypatch.setattr(snapshots, "get_makeup_report_product_recommendations", fail)
  await snapshots.run_makeup_report_product_snapshot_jobs([run["id"]], Settings(), db=db)
  await snapshots.run_makeup_report_product_snapshot_jobs([run["id"]], Settings(), db=db)

  persisted = db.runs[0]
  assert compute_calls == 1
  assert persisted["status"] == "failed"
  assert persisted["error_code"] == snapshots.GENERIC_FAILURE_CODE
  assert "SECRET" not in persisted["error_code"]
  assert persisted["recommendation_payload"] == {}
  assert persisted["product_ids"] == []
  assert persisted["completed_at"] is not None


@pytest.mark.asyncio
async def test_stale_worker_cannot_commit_after_a_new_lease_wins(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  _use_test_catalog_version(monkeypatch)
  db = SnapshotDatabase()
  run = (await snapshots.ensure_makeup_report_product_snapshots(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
  ))[0]

  async def compute_after_reclaim(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    # Simulate another worker reclaiming the row while this worker is still
    # computing. Its new started_at value is the lease/fencing token.
    db.runs[0]["started_at"] = datetime.now(timezone.utc) + timedelta(seconds=1)
    return {
      "status": "ready",
      "groups": [],
      "ranking": {"embeddingApplied": False},
      "algorithmVersion": "test-algorithm-v1",
    }

  monkeypatch.setattr(
    snapshots,
    "get_makeup_report_product_recommendations",
    compute_after_reclaim,
  )
  await snapshots.run_makeup_report_product_snapshot_jobs([run["id"]], Settings(), db=db)

  persisted = db.runs[0]
  assert persisted["status"] == "processing"
  assert persisted["recommendation_payload"] == {}
  assert persisted["completed_at"] is None


@pytest.mark.asyncio
async def test_response_filters_then_live_hydrates_without_changing_snapshot_identity_or_order(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  now = datetime.now(timezone.utc)
  external_id = "auradin-lip-1"
  shadow_id = "auradin-shadow-1"
  run = {
    "id": RUN_ID,
    "user_id": USER_ID,
    "source_makeup_report_id": REPORT_ID,
    "source_look_id": "anchor-look",
    "recipe_hash": "a" * 64,
    "catalog_version": "catalog:test",
    "algorithm_version": "test-algorithm-v1",
    "status": "ready",
    "revision": 3,
    "created_at": now,
    "started_at": now,
    "completed_at": now,
    "error_code": None,
    "recommendation_payload": {
      "contractVersion": snapshots.SNAPSHOT_CONTRACT_VERSION,
      "status": "ready",
      "algorithmVersion": "test-algorithm-v1",
      "ranking": {"embeddingApplied": True},
      "groups": [
        {
          "category": "lip",
          "label": "립",
          "status": "ready",
          "items": [
            {
              "productId": str(INTERNAL_PRODUCT_ID),
              "shadeId": str(SHADE_ID),
              "productName": "Stored Internal A",
              "imageUrl": "https://old.example.com/a.png",
              "price": {"amount": 1, "currency": "KRW"},
              "matchPercent": 98,
            },
            {
              "productId": external_id,
              "externalSource": snapshots.AURADIN_CATALOG_SOURCE,
              "brandName": "Stored External Brand",
              "productName": "Stored External B",
              "imageUrl": "https://old.example.com/b.png",
              "purchaseUrl": "https://old.example.com/b",
              "price": {"amount": 2, "currency": "KRW"},
              "matchPercent": 94,
            },
            {
              "productId": str(SECOND_INTERNAL_PRODUCT_ID),
              "productName": "Stored Internal C",
              "imageUrl": "https://old.example.com/c.png",
              "matchPercent": 90,
            },
          ],
          "degraded": False,
          "degradedReason": None,
        },
        {
          "category": "shadow",
          "label": "아이섀도우",
          "status": "ready",
          "items": [{
            "productId": shadow_id,
            "externalSource": snapshots.AURADIN_CATALOG_SOURCE,
          }],
        },
      ],
    },
  }
  loader_categories: list[list[str]] = []

  async def load_internal(
    _db: Any,
    _settings: Settings,
    *,
    user_id: UUID,
    categories: list[str],
    product_ids: list[UUID],
  ) -> list[dict[str, Any]]:
    assert user_id == USER_ID
    loader_categories.append(categories)
    assert product_ids == [INTERNAL_PRODUCT_ID]
    return [{
      "product_id": INTERNAL_PRODUCT_ID,
      "shade_id": SHADE_ID,
      "brand_name": "Live Brand",
      "product_name": "Live Name Must Not Re-rank",
      "category": "lip",
      "shade_name": "Live Rose",
      "srgb_hex": "#B85E6D",
      "finish": "glow",
      "image_url": "https://live.example.com/a.png",
      "price_amount": 31000,
      "currency": "KRW",
      "price_updated_at": now,
      "offer_id": UUID("77777777-7777-7777-7777-777777777777"),
      "seller_name": "공식몰",
      "seller_domain": "shop.example.com",
      "availability_status": "in_stock",
      "affiliate_type": "none",
      "catalog_version": "catalog:live",
      "source_updated_at": now,
      "liked": True,
    }]

  monkeypatch.setattr(snapshots, "_fetch_internal_candidates", load_internal)
  response = await snapshots.makeup_report_product_snapshot_response(
    object(),
    Settings(),
    user_id=USER_ID,
    run=run,
    categories=["lip"],
    per_category_limit=2,
  )

  assert response["status"] == "ready"
  assert response["runId"] == str(RUN_ID)
  assert response["snapshot"]["revision"] == 3
  assert response["snapshot"]["recipeHash"] == "a" * 64
  assert loader_categories == [["lip"]]
  assert [group["category"] for group in response["groups"]] == ["lip"]
  items = response["groups"][0]["items"]
  assert [item["productId"] for item in items] == [str(INTERNAL_PRODUCT_ID)]
  assert [item["productName"] for item in items] == ["Stored Internal A"]
  assert [item["matchPercent"] for item in items] == [98]
  assert items[0]["imageUrl"] == "https://live.example.com/a.png"
  assert items[0]["price"]["amount"] == 31000
  assert items[0]["viewerState"] == {"liked": True}
  assert external_id not in json.dumps(response)
  assert SECOND_INTERNAL_PRODUCT_ID.hex not in json.dumps(response)
  assert shadow_id not in json.dumps(response)


@pytest.mark.asyncio
async def test_verified_report_discovery_item_replays_from_snapshot_without_recalculation() -> None:
  now = datetime.now(timezone.utc)
  item = {
    "productId": "naver-123456",
    "externalSource": discovery.DISCOVERY_SOURCE,
    "brandName": "실제 브랜드",
    "productName": "로즈 립 틴트",
    "category": "lip",
    "imageUrl": "https://shopping-phinf.pstatic.net/main/123456.jpg",
    "purchaseUrl": "https://shop.example.com/products/123456",
    "price": {"amount": 18000, "currency": "KRW"},
    "viewerState": {"liked": True},
    "canLike": True,
    "matchRate": 94,
    "recommendationBasis": "verifiedListingImageColor",
    "verification": {
      "contractVersion": discovery.DISCOVERY_CONTRACT_VERSION,
      "provider": "naver_shopping",
      "evidenceType": discovery.IMAGE_EVIDENCE_TYPE,
      "evidenceConfidence": 0.9,
      "capturedAt": now.isoformat(),
      "observedColorHex": "#B85E6D",
      "reportTargetHex": "#B85E6D",
      "colorDistance": 1.2,
    },
  }
  cheaper_duplicate = {
    **item,
    "productId": "naver-654321",
    "productName": "로즈 립 틴트 2개",
    "imageUrl": "https://shopping-phinf.pstatic.net/main/654321.jpg",
    "purchaseUrl": "https://shop.example.com/products/654321",
    "price": {"amount": 15000, "currency": "KRW"},
    "matchRate": 91,
  }
  run = {
    "id": RUN_ID,
    "status": "ready",
    "revision": 1,
    "recipe_hash": "e" * 64,
    "algorithm_version": snapshots.ALGORITHM_VERSION,
    "catalog_version": "catalog:test",
    "created_at": now,
    "started_at": now,
    "completed_at": now,
    "error_code": None,
    "recommendation_payload": {
      "status": "ready",
      "algorithmVersion": snapshots.ALGORITHM_VERSION,
      "ranking": {"fallback": {"mode": "none"}},
      "groups": [{
        "category": "lip",
        "label": "립",
        "status": "ready",
        "items": [item, cheaper_duplicate],
      }],
    },
  }

  response = await snapshots.makeup_report_product_snapshot_response(
    object(),
    Settings(),
    user_id=USER_ID,
    run=run,
    categories=["lip"],
    per_category_limit=6,
  )

  assert response["status"] == "ready"
  assert len(response["groups"][0]["items"]) == 1
  replayed = response["groups"][0]["items"][0]
  assert replayed["productId"] == "naver-654321"
  assert replayed["price"]["amount"] == 15000
  assert replayed["matchRate"] == 91
  assert replayed["viewerState"] == {"liked": False}
  assert replayed["canLike"] is False


@pytest.mark.asyncio
async def test_external_hydration_drops_product_reclassified_to_another_category(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  now = datetime.now(timezone.utc)
  external_id = "auradin-lip-reclassified"
  run = {
    "id": RUN_ID,
    "status": "ready",
    "revision": 1,
    "recipe_hash": "c" * 64,
    "algorithm_version": "test-v1",
    "catalog_version": "catalog:test",
    "created_at": now,
    "started_at": now,
    "completed_at": now,
    "error_code": None,
    "recommendation_payload": {
      "status": "ready",
      "algorithmVersion": "test-v1",
      "ranking": {"embeddingApplied": False},
      "groups": [{
        "category": "lip",
        "label": "립",
        "status": "ready",
        "items": [{
          "productId": external_id,
          "externalSource": snapshots.AURADIN_CATALOG_SOURCE,
          "productName": "Stored Lip",
        }],
      }],
    },
  }

  response = await snapshots.makeup_report_product_snapshot_response(
    object(),
    Settings(),
    user_id=USER_ID,
    run=run,
    categories=["lip"],
    per_category_limit=6,
  )

  assert response["status"] == "noEligibleProducts"
  assert response["groups"][0]["items"] == []
  assert response["groups"][0]["degradedReason"] == "stored_product_offer_unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("current_brand", "current_name"),
  [
    ("Drifted Brand", "Stored Tint"),
    ("Stored Brand", "Drifted Product Name"),
  ],
)
async def test_external_hydration_drops_brand_or_product_identity_drift(
  monkeypatch: pytest.MonkeyPatch,
  current_brand: str,
  current_name: str,
) -> None:
  now = datetime.now(timezone.utc)
  external_id = "auradin-lip-identity"
  run = {
    "id": RUN_ID,
    "status": "ready",
    "revision": 1,
    "recipe_hash": "d" * 64,
    "algorithm_version": "makeup_report_hybrid_v3",
    "catalog_version": "catalog:test",
    "created_at": now,
    "started_at": now,
    "completed_at": now,
    "error_code": None,
    "recommendation_payload": {
      "status": "ready",
      "algorithmVersion": "makeup_report_hybrid_v3",
      "ranking": {"embeddingApplied": False},
      "groups": [{
        "category": "lip",
        "label": "립",
        "status": "ready",
        "items": [{
          "productId": external_id,
          "externalSource": snapshots.AURADIN_CATALOG_SOURCE,
          "category": "lip",
          "brandName": "Stored Brand",
          "productName": "Stored Tint",
          "shadeName": "Stored Rose Option",
          "reasonCodes": ["VERIFIED_EXTERNAL_SHADE_OPTION"],
        }],
      }],
    },
  }

  response = await snapshots.makeup_report_product_snapshot_response(
    object(),
    Settings(),
    user_id=USER_ID,
    run=run,
    categories=["lip"],
    per_category_limit=6,
  )

  assert response["status"] == "noEligibleProducts"
  assert response["groups"][0]["items"] == []
  assert response["groups"][0]["degradedReason"] == "stored_product_offer_unavailable"


@pytest.mark.asyncio
async def test_external_hydration_failure_keeps_current_internal_snapshot_items(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  now = datetime.now(timezone.utc)
  run = {
    "id": RUN_ID,
    "status": "ready",
    "revision": 1,
    "recipe_hash": "b" * 64,
    "algorithm_version": "test-v1",
    "catalog_version": "catalog:test",
    "created_at": now,
    "started_at": now,
    "completed_at": now,
    "error_code": None,
    "recommendation_payload": {
      "status": "ready",
      "algorithmVersion": "test-v1",
      "ranking": {"embeddingApplied": False},
      "groups": [
        {
          "category": "lip",
          "label": "립",
          "status": "ready",
          "items": [{"productId": str(INTERNAL_PRODUCT_ID), "shadeId": str(SHADE_ID)}],
        },
        {
          "category": "shadow",
          "label": "아이섀도우",
          "status": "ready",
          "items": [{
            "productId": "auradin-shadow-low-popularity",
            "externalSource": snapshots.AURADIN_CATALOG_SOURCE,
          }],
        },
      ],
    },
  }

  async def load_internal(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
    return [{
      "product_id": INTERNAL_PRODUCT_ID,
      "shade_id": SHADE_ID,
      "brand_name": "Live Brand",
      "product_name": "Still eligible",
      "category": "lip",
      "image_url": "https://live.example.com/internal.png",
      "liked": False,
    }]

  monkeypatch.setattr(snapshots, "_fetch_internal_candidates", load_internal)
  response = await snapshots.makeup_report_product_snapshot_response(
    object(),
    Settings(),
    user_id=USER_ID,
    run=run,
    categories=["lip", "shadow"],
    per_category_limit=6,
  )

  assert response["status"] == "partial"
  assert [item["productId"] for item in response["groups"][0]["items"]] == [str(INTERNAL_PRODUCT_ID)]
  assert response["groups"][1]["items"] == []
  assert response["groups"][1]["degradedReason"] == "stored_product_offer_unavailable"


def test_only_pending_or_stale_processing_runs_are_schedulable() -> None:
  now = datetime.now(timezone.utc)
  assert snapshots.snapshot_job_is_schedulable({"status": "pending"}) is True
  assert snapshots.snapshot_job_is_schedulable({
    "status": "processing",
    "started_at": now - snapshots.PROCESSING_STALE_AFTER - timedelta(seconds=1),
  }) is True
  assert snapshots.snapshot_job_is_schedulable({
    "status": "processing",
    "started_at": None,
  }) is True
  assert snapshots.snapshot_job_is_schedulable({
    "status": "processing",
    "started_at": now - snapshots.PROCESSING_STALE_AFTER + timedelta(seconds=1),
  }) is False
  assert snapshots.snapshot_job_is_schedulable({"status": "ready"}) is False
  assert snapshots.snapshot_job_is_schedulable({"status": "failed"}) is False


@pytest.mark.asyncio
async def test_report_completion_dispatches_pending_snapshots_for_every_look(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls: list[dict[str, Any]] = []
  background_tasks = BackgroundTasks()
  db = object()
  settings = Settings()

  async def dispatch(**kwargs: Any) -> list[dict[str, Any]]:
    calls.append(kwargs)
    return [{"id": RUN_ID, "status": "pending"}]

  monkeypatch.setattr(makeup_api, "dispatch_makeup_report_product_snapshot_jobs", dispatch)
  await makeup_api.dispatch_makeup_product_snapshot_job(
    db=db,
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    settings=settings,
  )

  assert calls == [{
    "db": db,
    "background_tasks": background_tasks,
    "report_id": REPORT_ID,
    "user_id": USER_ID,
    "settings": settings,
    "all_looks": True,
  }]


@pytest.mark.asyncio
async def test_product_snapshot_dispatch_failure_never_fails_the_completed_report(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def dispatch(**_kwargs: Any) -> list[dict[str, Any]]:
    raise RuntimeError("snapshot storage temporarily unavailable")

  monkeypatch.setattr(makeup_api, "dispatch_makeup_report_product_snapshot_jobs", dispatch)
  # The absence of an exception is the contract: a completed report remains
  # usable and the product GET backstop can enqueue its snapshot later.
  assert await makeup_api.dispatch_makeup_product_snapshot_job(
    db=object(),
    background_tasks=BackgroundTasks(),
    report_id=REPORT_ID,
    user_id=USER_ID,
    settings=Settings(),
  ) is None


@pytest.mark.asyncio
async def test_inline_post_generation_runs_image_and_product_jobs_concurrently(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  product_started = asyncio.Event()
  image_observed_concurrency = False
  product_completed = False

  async def run_image(*_args: Any, **_kwargs: Any) -> None:
    nonlocal image_observed_concurrency
    await asyncio.wait_for(product_started.wait(), timeout=0.5)
    image_observed_concurrency = True

  async def run_products(*_args: Any, **_kwargs: Any) -> None:
    nonlocal product_completed
    product_started.set()
    await asyncio.sleep(0)
    product_completed = True

  monkeypatch.setattr(makeup_api, "run_recommendation_image_job", run_image)
  monkeypatch.setattr(makeup_api, "run_makeup_report_product_snapshot_jobs", run_products)
  await makeup_api.run_makeup_post_generation_jobs(
    db=object(),
    report_id=REPORT_ID,
    user_id=USER_ID,
    settings=Settings(),
    product_run_ids=[RUN_ID],
  )

  assert image_observed_concurrency is True
  assert product_completed is True


@pytest.mark.asyncio
async def test_inline_post_generation_dispatch_registers_one_parallel_coordinator(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def ensure(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
    assert _kwargs["all_looks"] is True
    return [{"id": RUN_ID, "status": "pending"}]

  monkeypatch.setattr(makeup_api, "ensure_makeup_report_product_snapshots", ensure)
  background_tasks = BackgroundTasks()
  status = await makeup_api.dispatch_makeup_post_generation_jobs(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    settings=Settings(ai_job_execution_mode="inline"),
  )

  assert status == "pending"
  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].func is makeup_api.run_makeup_post_generation_jobs
  assert background_tasks.tasks[0].kwargs["product_run_ids"] == [RUN_ID]
