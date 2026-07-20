from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore, Event
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest

from app.api import products as products_api
from app.core.errors import AppError
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings
from app.db.check_schema import EXPECTED_CONSTRAINTS, EXPECTED_CONSTRAINT_CONTRACTS
from app.db.init_db import POST_SCHEMA_MIGRATIONS
from app.db.session import require_database
from app.main import create_app
from app.services import makeup_report_product_recommendations as service
from app.services import product_external_catalog as external_catalog
from app.services.product_color import srgb_hex_to_lab


USER_ID = UUID("11111111-1111-1111-1111-111111111111")
REPORT_ID = UUID("22222222-2222-2222-2222-222222222222")


def _guide(area: str, color_hex: str, product_type: str) -> dict:
  return {
    "area": area,
    "color": {"name": "로즈" if area != "base" else "내추럴 베이지", "hex": color_hex},
    "texture": "촉촉한 글로우 크림",
    "applicationPlan": {
      "steps": [{"productType": product_type, "finishCheck": "은은한 글로우로 마무리"}],
    },
  }


def _look(role: str = "anchor") -> dict:
  return {
    "id": f"{role}-look",
    "role": role,
    "title": f"{role} 룩",
    "summary": "구조화 추천 요약",
    "areaGuides": [
      _guide("base", "#D8AA92", "쿠션 파운데이션"),
      _guide("brow", "#6E5148", "아이브로우 펜슬"),
      _guide("eye", "#B96872", "아이섀도 팔레트"),
      _guide("cheek", "#D98A91", "크림 블러셔"),
      _guide("lip", "#B85E6D", "글로우 틴트"),
    ],
  }


def _report_row(*, image_status: str = "partial") -> dict:
  return {
    "id": REPORT_ID,
    "scenario_text": "퇴근 후 약속",
    "recommendation": {"looks": [_look(role) for role in ("anchor", "bold", "discovery")]},
    "context_snapshot": {
      "analysisReport": {"skinType": "복합성"},
      "selection": {
        "situation": {"key": "daily"},
        "customSituationText": "SECRET USER FREE TEXT",
      },
    },
    "schema_version": "makeup-recommendation-v2",
    "image_status": image_status,
    "created_at": datetime(2026, 7, 20, tzinfo=timezone.utc),
  }


def _catalog_row(
  category: str,
  color_hex: str,
  *,
  product_id: UUID | None = None,
  product_name: str | None = None,
) -> dict:
  lab = srgb_hex_to_lab(color_hex)
  product_id = product_id or uuid4()
  return {
    "product_id": product_id,
    "brand_name": "검증 브랜드",
    "product_name": product_name or f"검증 {category}",
    "category": category,
    "tags": ["글로우", "복합성", "틴트", "쿠션", "아이섀도"],
    "product_payload": {},
    "catalog_version": "catalog-test",
    "source_updated_at": datetime(2026, 7, 20, tzinfo=timezone.utc),
    "shade_id": uuid4(),
    "shade_name": "로즈 01",
    "product_region": category,
    "srgb_hex": color_hex,
    "lab_l": lab[0],
    "lab_a": lab[1],
    "lab_b": lab[2],
    "color_family": "rose",
    "finish": "glow",
    "coverage": "medium",
    "opacity": 0.7,
    "evidence_type": "brand_official_swatch",
    "evidence_confidence": 0.9,
    "reviewed_at": datetime(2026, 7, 19, tzinfo=timezone.utc),
    "image_url": "https://cdn.example.com/product.png",
    "offer_id": uuid4(),
    "seller_name": "공식몰",
    "seller_domain": "shop.example.com",
    "purchase_url": "https://shop.example.com/product",
    "currency": "KRW",
    "price_amount": 25000,
    "price_updated_at": datetime(2026, 7, 20, tzinfo=timezone.utc),
    "availability_status": "in_stock",
    "affiliate_type": "none",
    "disclosure_label": None,
    "liked": False,
  }


class _DetailDatabase:
  is_connected = True

  def __init__(self, report: dict | None, rows: list[dict] | None = None) -> None:
    self.report = report
    self.rows = rows or []
    self.fetch_queries: list[str] = []

  async def fetchrow(self, query: str, *_args):
    assert "where id=$1 and user_id=$2" in query
    return self.report

  async def fetch(self, query: str, *_args):
    self.fetch_queries.append(" ".join(query.split()))
    if "from makeup_recommendation_assets" in query:
      return []
    if "with eligible as" in query:
      return self.rows
    raise AssertionError(f"unexpected query: {query}")


@pytest.mark.asyncio
async def test_picker_uses_one_bulk_asset_query_and_keeps_partial_recipe(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class PickerDatabase:
    def __init__(self) -> None:
      self.calls = 0

    async def fetch(self, query: str, *_args):
      self.calls += 1
      if "from makeup_recommendation_reports" in query:
        return [_report_row()]
      assert "where report_id=any($1::uuid[])" in query
      return [{
        "report_id": REPORT_ID,
        "look_id": "anchor-look",
        "role": "anchor",
        "status": "completed",
        "image_url": None,
        "storage_bucket": "private-bucket",
        "object_key": "makeup-recommendations/private/anchor.png",
        "is_private": True,
      }]

  monkeypatch.setattr(
    service.S3Service,
    "create_presigned_download",
    lambda _self, **_kwargs: "https://signed.example.com/private.png",
  )
  db = PickerDatabase()
  result = await service.list_owned_makeup_reports(
    db, Settings(), user_id=USER_ID, limit=20, offset=0,
  )

  assert db.calls == 2
  assert len(result["reports"]) == 1
  report = result["reports"][0]
  assert report["imageStatus"] == "partial"
  assert report["looks"][0]["imageUrl"] == "https://signed.example.com/private.png"
  assert report["looks"][0]["palette"] == ["#6E5148", "#B96872", "#D98A91", "#B85E6D"]
  assert report["looks"][0]["targets"] == ["base", "brow", "shadow", "liner", "cheek", "lip"]
  assert "contextSnapshot" not in report and "questions" not in report


@pytest.mark.asyncio
async def test_picker_excludes_failed_images_but_keeps_pending_and_partial() -> None:
  failed = _report_row(image_status="failed")
  failed["scenario_text"] = "failed"
  pending = _report_row(image_status="pending")
  pending["scenario_text"] = "pending"
  partial = _report_row(image_status="partial")
  partial["scenario_text"] = "partial"

  class PickerDatabase:
    def __init__(self) -> None:
      self.report_query = ""

    async def fetch(self, query: str, *_args):
      normalized = " ".join(query.split())
      if "from makeup_recommendation_reports" in query:
        self.report_query = normalized
        # Deliberately return a failed row to verify the service boundary too;
        # a real PostgreSQL query applies the predicate below.
        return [failed, pending, partial]
      return []

  db = PickerDatabase()
  result = await service.list_owned_makeup_reports(
    db, Settings(), user_id=USER_ID, limit=20, offset=0,
  )
  assert "image_status is distinct from 'failed'" in db.report_query
  assert [report["scenarioText"] for report in result["reports"]] == ["pending", "partial"]
  assert [report["imageStatus"] for report in result["reports"]] == ["pending", "partial"]


@pytest.mark.asyncio
async def test_picker_does_not_expose_incomplete_looks() -> None:
  report = _report_row()
  for look in report["recommendation"]["looks"]:
    look["areaGuides"] = [guide for guide in look["areaGuides"] if guide["area"] != "lip"]

  class IncompletePickerDatabase:
    async def fetch(self, query: str, *_args):
      return [report] if "from makeup_recommendation_reports" in query else []

  result = await service.list_owned_makeup_reports(
    IncompletePickerDatabase(), Settings(), user_id=USER_ID, limit=20, offset=0,
  )
  assert result["reports"] == []


@pytest.mark.asyncio
async def test_picker_does_not_expose_non_base_guides_with_invalid_hex() -> None:
  report = _report_row()
  for look in report["recommendation"]["looks"]:
    next(guide for guide in look["areaGuides"] if guide["area"] == "lip")["color"]["hex"] = "rose"

  class InvalidColorPickerDatabase:
    async def fetch(self, query: str, *_args):
      return [report] if "from makeup_recommendation_reports" in query else []

  result = await service.list_owned_makeup_reports(
    InvalidColorPickerDatabase(), Settings(), user_id=USER_ID, limit=20, offset=0,
  )
  assert result["reports"] == []


@pytest.mark.asyncio
async def test_owner_miss_is_a_non_leaking_404() -> None:
  with pytest.raises(AppError) as error:
    await service.get_makeup_report_product_recommendations(
      _DetailDatabase(None),
      Settings(),
      user_id=USER_ID,
      report_id=REPORT_ID,
      look_id=None,
      categories=["lip"],
      per_category_limit=6,
    )
  assert error.value.status_code == 404
  assert error.value.code == "MAKEUP_RECOMMENDATION_NOT_FOUND"


@pytest.mark.asyncio
async def test_look_and_category_are_validated() -> None:
  with pytest.raises(AppError) as category_error:
    service.parse_categories("lip,mascara")
  assert category_error.value.code == "INVALID_MAKEUP_PRODUCT_CATEGORY"
  assert service.parse_categories("shadow,liner") == ["shadow", "liner"]

  with pytest.raises(AppError) as look_error:
    await service.get_makeup_report_product_recommendations(
      _DetailDatabase(_report_row()),
      Settings(),
      user_id=USER_ID,
      report_id=REPORT_ID,
      look_id="not-owned-by-report",
      categories=["lip"],
      per_category_limit=6,
    )
  assert look_error.value.code == "MAKEUP_RECOMMENDATION_LOOK_INVALID"


def test_eye_application_plan_separates_shadow_and_liner_structured_targets() -> None:
  recommendation, selected = service.resolve_report_look(_report_row()["recommendation"], "anchor-look")
  assert recommendation["looks"] and selected is not None
  eye = next(guide for guide in selected["areaGuides"] if guide["area"] == "eye")

  shadow = service._guide_target(eye, {}, "shadow")
  liner = service._guide_target(eye, {}, "liner")

  assert shadow["productTypes"] == ["shadow"]
  assert liner["productTypes"] == ["liner"]
  assert shadow["colorHex"] == "#B96872"
  assert len(shadow["colors"]) >= 4
  assert liner["colors"] == [
    next(
      color
      for step in eye["applicationPlan"]["steps"]
      if "아이라이너" in step["productType"]
      for color in step["colors"]
    ),
  ]
  assert liner["colorHex"] != shadow["colorHex"]
  assert liner["colorFamily"] == "brown"


def test_missing_product_type_uses_only_safe_category_defaults() -> None:
  lip = service._guide_target(
    {"area": "lip", "color": {"name": "로즈", "hex": "#B85E6D"}},
    {},
    "lip",
  )
  liner = service._guide_target(
    {"area": "eye", "color": {"name": "브라운", "hex": "#49332C"}},
    {},
    "liner",
  )

  assert lip["productTypes"] == ["tint", "lipstick", "lip_gloss", "lip_balm"]
  assert liner["productTypes"] == ["liner"]


@pytest.mark.asyncio
async def test_legacy_v2_guide_steps_and_products_are_enriched_before_matching(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  report = _report_row()
  for look in report["recommendation"]["looks"]:
    for guide in look["areaGuides"]:
      guide.pop("applicationPlan")
      guide["steps"] = ["기존 저장 보고서의 간단한 단계"]
      guide["products"] = ["기존 저장 보고서의 제품 힌트"]

  normalized, selected = service.resolve_report_look(report["recommendation"], "anchor-look")
  assert selected is not None
  eye = next(guide for guide in selected["areaGuides"] if guide["area"] == "eye")
  assert eye["applicationPlan"]["recipeVersion"] == "makeup-application-v1"
  shadow_target = service._guide_target(eye, {}, "shadow")
  liner_target = service._guide_target(eye, {}, "liner")
  assert shadow_target["productTypes"] == ["shadow"]
  assert liner_target["productTypes"] == ["liner"]
  assert normalized == service.normalize_makeup_report_recommendation(report["recommendation"])

  rows = [
    _catalog_row("shadow", shadow_target["colorHex"], product_name="검증 아이섀도"),
    _catalog_row("liner", liner_target["colorHex"], product_name="검증 아이라이너"),
  ]
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(report, rows),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["shadow", "liner"],
    per_category_limit=1,
  )

  assert [group["category"] for group in result["groups"]] == ["shadow", "liner"]
  assert all(group["status"] == "ready" for group in result["groups"])
  assert result["groups"][0]["target"]["productTypes"] == ["shadow"]
  assert result["groups"][1]["target"]["productTypes"] == ["liner"]
  assert result["groups"][1]["items"][0]["colorDistance"] == pytest.approx(0, abs=0.001)


@pytest.mark.asyncio
async def test_missing_anchor_defaults_to_first_complete_look() -> None:
  report = _report_row()
  report["recommendation"]["looks"] = report["recommendation"]["looks"][1:]
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(report, [_catalog_row("lip", "#B85E6D")]),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id=None,
    categories=["lip"],
    per_category_limit=1,
  )
  assert result["selectedLook"]["lookId"] == "bold-look"


@pytest.mark.asyncio
async def test_eye_maps_to_shadow_and_delta_e_orders_then_dedupes_products(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  same_product = uuid4()
  rows = [
    _catalog_row("shadow", "#B96872", product_id=same_product, product_name="정확 shade"),
    _catalog_row("shadow", "#B96973", product_id=same_product, product_name="같은 제품 다른 shade"),
    _catalog_row("shadow", "#A65F69", product_name="조금 먼 shade"),
  ]
  db = _DetailDatabase(_report_row(), rows)
  result = await service.get_makeup_report_product_recommendations(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["shadow"],
    per_category_limit=6,
  )

  group = result["groups"][0]
  assert group["category"] == "shadow"
  assert group["items"][0]["productId"] == str(same_product)
  assert group["items"][0]["colorDistance"] == pytest.approx(0, abs=0.001)
  assert [item["productId"] for item in group["items"]].count(str(same_product)) == 1
  assert result["selectedLook"]["lookId"] == "anchor-look"
  assert result["ranking"]["strategy"] == service.ALGORITHM_VERSION


@pytest.mark.asyncio
async def test_report_bound_verified_discovery_is_primary_and_never_marked_fallback(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  discovered = {
    "productId": "naver-123456",
    "shadeId": None,
    "brandName": "실제 브랜드",
    "productName": "로즈 립 틴트",
    "category": "lip",
    "shadeName": None,
    "shadeHex": "#B85E6D",
    "imageUrl": "https://shopping-phinf.pstatic.net/main/123456.jpg",
    "purchaseUrl": "https://shop.example.com/products/123456",
    "price": {"amount": 18000, "currency": "KRW"},
    "offer": {"offerId": "external-naver-123456", "affiliateType": "none"},
    "viewerState": {"liked": False},
    "externalSource": "naver_shopping_search",
    "canLike": False,
    "reasonCodes": ["REPORT_COLOR_IMAGE_MATCH", "LIVE_OFFER_VERIFIED"],
    "reasonLabels": ["상품 이미지 색상이 보고서 색상과 가까워요"],
    "matchRate": 94,
    "recommendationBasis": "verifiedListingImageColor",
    "colorDistance": 1.2,
    "verification": {
      "contractVersion": "makeup-report-live-product-evidence-v2",
      "provider": "naver_shopping",
      "evidenceType": "listing_image_palette_ciede2000",
      "evidenceConfidence": 0.9,
      "observedColorHex": "#B85E6D",
      "reportTargetHex": "#B85E6D",
      "colorDistance": 1.2,
    },
    "_ruleScore": 94.0,
  }

  async def fake_discovery(*_args, **_kwargs):
    return {"lip": [discovered]}, {
      "contractVersion": "makeup-report-live-product-evidence-v2",
      "provider": "naver_shopping",
      "configured": True,
      "applied": True,
      "verifiedItems": 1,
    }

  monkeypatch.setattr(service, "discover_report_products", fake_discovery)
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row(), []),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=6,
  )

  group = result["groups"][0]
  assert group["source"] == "verifiedLiveDiscovery"
  assert group["items"][0]["productId"] == "naver-123456"
  assert group["items"][0]["matchRate"] == 94
  assert result["ranking"]["discovery"]["applied"] is True
  assert result["ranking"]["fallback"]["mode"] == "none"


@pytest.mark.asyncio
async def test_internal_database_short_circuits_live_discovery_when_sufficient(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def unexpected_discovery(*_args, **_kwargs):
    raise AssertionError("Naver must not be queried when the verified database is sufficient")

  monkeypatch.setattr(service, "discover_report_products", unexpected_discovery)
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row(), [_catalog_row("lip", "#B85E6D")]),
    Settings(naver_shopping_client_id="configured", naver_shopping_client_secret="configured"),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=1,
  )

  assert len(result["groups"][0]["items"]) == 1
  assert result["ranking"]["discovery"]["queriedCategories"] == []
  assert result["ranking"]["discovery"]["skippedReason"] == "database_sufficient"
  assert result["ranking"]["discovery"]["databaseSufficientCategories"] == ["lip"]


@pytest.mark.asyncio
async def test_live_discovery_receives_only_categories_short_in_verified_database(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  requested_categories: list[str] = []

  async def fake_discovery(_settings, *, targets_by_category, per_category_limit):
    requested_categories.extend(targets_by_category)
    assert per_category_limit == 1
    return {"shadow": []}, {
      "contractVersion": "makeup-report-live-product-evidence-v2",
      "provider": "naver_shopping",
      "configured": True,
      "applied": False,
      "queriedCategories": list(targets_by_category),
      "verifiedItems": 0,
      "error": None,
    }

  monkeypatch.setattr(service, "discover_report_products", fake_discovery)
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row(), [_catalog_row("lip", "#B85E6D")]),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["shadow", "lip"],
    per_category_limit=1,
  )

  assert requested_categories == ["shadow"]
  assert result["ranking"]["discovery"]["databaseSufficientCategories"] == ["lip"]
  assert result["ranking"]["discovery"]["shortageCategories"] == ["shadow"]


@pytest.mark.asyncio
async def test_live_discovery_only_fills_the_exact_database_shortage(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  def external(product_id: str, score: int) -> dict:
    return {
      "productId": product_id,
      "brandName": "실제 브랜드",
      "productName": f"검증 립 {product_id}",
      "category": "lip",
      "externalSource": "naver_shopping_search",
      "matchRate": score,
      "_ruleScore": float(score),
    }

  async def fake_discovery(*_args, **_kwargs):
    return {"lip": [external("naver-first", 99), external("naver-second", 98)]}, {
      "contractVersion": "makeup-report-live-product-evidence-v2",
      "provider": "naver_shopping",
      "configured": True,
      "applied": True,
      "queriedCategories": ["lip"],
      "verifiedItems": 2,
      "error": None,
    }

  monkeypatch.setattr(service, "discover_report_products", fake_discovery)
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row(), [_catalog_row("lip", "#B85E6D")]),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=2,
  )

  items = result["groups"][0]["items"]
  assert len(items) == 2
  assert sum(item.get("externalSource") == "naver_shopping_search" for item in items) == 1
  assert {item["productId"] for item in items} != {"naver-first", "naver-second"}


@pytest.mark.asyncio
async def test_base_is_family_level_and_never_claims_color_or_shade(
) -> None:
  db = _DetailDatabase(_report_row(), [_catalog_row("base", "#101010", product_name="글로우 쿠션")])
  result = await service.get_makeup_report_product_recommendations(
    db,
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["base"],
    per_category_limit=1,
  )
  item = result["groups"][0]["items"][0]
  assert item["shadeId"] is None and item["shadeName"] is None and item["shadeHex"] is None
  assert item.get("colorDistance") is None
  assert "CLOSE_REPORT_COLOR" not in item["reasonCodes"]
  assert "VERIFIED_SHADE_EVIDENCE" not in item["reasonCodes"]
  assert item["recommendationBasis"] == "verifiedProductFamily"
  assert "purchaseUrl" not in item  # trusted offer resolves again at click time.
  assert result["ranking"]["fallback"] == {
    "mode": "none",
    "reasonCodes": [],
    "supplementalAuradinApplied": False,
  }


def test_base_hex_cannot_change_rule_or_semantic_score_inputs() -> None:
  first_guide = _guide("base", "#FFFFFF", "쿠션 파운데이션")
  second_guide = _guide("base", "#000000", "쿠션 파운데이션")
  context = {"analysisReport": {"skinType": "복합성"}}
  first_target = service._guide_target(first_guide, context, "base")
  second_target = service._guide_target(second_guide, context, "base")
  row = _catalog_row("base", "#A08070", product_name="글로우 쿠션")
  first = service._internal_candidate(row, first_target, max_delta_e=18)
  second = service._internal_candidate(row, second_target, max_delta_e=18)

  assert first_target == second_target
  assert first is not None and second is not None
  assert first["_ruleScore"] == second["_ruleScore"]
  assert first["_semanticText"] == second["_semanticText"]
  assert "shade=" not in first["_semanticText"] and "color_family=" not in first["_semanticText"]


@pytest.mark.parametrize(
  "product_name",
  ["Brow Pencil", "Eyebrow Pencil", "Eye Brow Pencil", "아이브로우펜슬", "브로우 카라"],
)
def test_product_type_brow_requires_ascii_boundary_but_keeps_legitimate_aliases(
  product_name: str,
) -> None:
  assert service._canonical_product_types(product_name) == ["brow"]


def test_brown_lash_cannot_satisfy_brow_product_type_or_embedding_input() -> None:
  assert service._canonical_product_types("Brown Lash Maker") == []
  assert "product_type=" not in service._embedding_text(
    category="brow",
    color_family="brown",
    product_types=["brown"],
  )


def test_active_snapshot_offer_proof_is_fresh_and_unknown_or_expired_proof_fails() -> None:
  catalog = external_catalog.get_catalog()
  item = catalog.get("auradin-seed-9228b94647924247")
  assert item is not None and catalog.snapshot is not None
  now = datetime(2026, 7, 20, tzinfo=timezone.utc)
  proof = external_catalog._verified_offer_snapshot_proof(
    item,
    catalog.snapshot,
    max_age_hours=168,
    now=now,
  )
  assert proof and proof["_freshnessVerified"] is True
  assert external_catalog._verified_offer_snapshot_proof(
    {key: value for key, value in item.items() if key != "offerRefreshEvidence"},
    catalog.snapshot,
    max_age_hours=168,
    now=now,
  ) is None
  assert external_catalog._verified_offer_snapshot_proof(
    {
      **item,
      "hardFilterEligible": {**item["hardFilterEligible"], "priceKrw": False},
    },
    catalog.snapshot,
    max_age_hours=168,
    now=now,
  ) is None
  assert external_catalog._verified_offer_snapshot_proof(
    item,
    catalog.snapshot,
    max_age_hours=168,
    now=datetime(2026, 8, 20, tzinfo=timezone.utc),
  ) is None


@pytest.mark.asyncio
async def test_semantic_rerank_is_capped_and_embedding_text_is_allowlisted(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  captured: list[str] = []

  def fake_embed(text: str, _settings: Settings):
    captured.append(text)
    if text.startswith("category="):
      return [1.0, 0.0]
    return [-1.0, 0.0] if "strong-rule" in text else [1.0, 0.0]

  monkeypatch.setattr(service, "embed_text", fake_embed)
  with service._EMBEDDING_CACHE_LOCK:
    service._EMBEDDING_CACHE.clear()
  candidates = [
    {"productId": "strong", "matchRate": 95, "_ruleScore": 95.0, "_semanticText": "strong-rule"},
    {"productId": "weak", "matchRate": 65, "_ruleScore": 65.0, "_semanticText": "weak-rule"},
  ]
  target = {
    "category": "lip",
    "colorFamily": "rose",
    "finish": "glow",
    "texture": "liquid",
    "productTypes": ["tint"],
  }
  ranked, meta = await service._semantic_rerank(
    candidates,
    target,
    Settings(aws_access_key_id="test", aws_secret_access_key="test", embedding_dimension=2),
    asyncio.Semaphore(8),
  )
  assert meta["applied"] is True
  assert ranked[0]["productId"] == "strong"
  assert ranked[0]["matchRate"] >= 85  # semantic contribution cannot exceed ten points.
  query = next(text for text in captured if text.startswith("category="))
  assert query == "category=lip color_family=rose finish=glow texture=liquid product_type=tint"
  assert "SECRET" not in " ".join(captured)
  assert service.MAX_RERANK_CANDIDATES_PER_CATEGORY == 8


def test_real_candidate_embedding_text_contains_only_canonical_allowlist_fields() -> None:
  internal_row = _catalog_row(
    "lip",
    "#B85E6D",
    product_name="SECRET 사용자처럼 보이는 상품명 로즈 틴트",
  )
  internal_row.update({
    "brand_name": "PRIVATE BRAND",
    "shade_name": "PRIVATE SHADE",
    "product_payload": {"marketingCopy": "DO NOT SEND"},
  })
  target = service._guide_target(_guide("lip", "#B85E6D", "글로우 틴트"), {}, "lip")
  internal = service._internal_candidate(internal_row, target, max_delta_e=18)

  assert internal is not None
  allowed_keys = {"category", "color_family", "finish", "texture", "product_type"}
  text = internal["_semanticText"]
  assert {part.split("=", 1)[0] for part in text.split()} <= allowed_keys
  assert not any(
    forbidden in text
    for forbidden in ("SECRET", "PRIVATE", "DO NOT SEND", "brand=", "product=", "shade=", "coverage=")
  )


@pytest.mark.asyncio
async def test_embedding_singleflight_and_provider_slot_survive_waiter_cancellation(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  started = Event()
  release_provider = Event()
  calls: list[str] = []

  def blocked_embed(text: str, _settings: Settings):
    calls.append(text)
    started.set()
    assert release_provider.wait(timeout=2)
    return [1.0, 0.0]

  with service._EMBEDDING_CACHE_LOCK:
    assert not service._EMBEDDING_INFLIGHT
    service._EMBEDDING_CACHE.clear()
  monkeypatch.setattr(service, "embed_text", blocked_embed)
  monkeypatch.setattr(service, "_EMBEDDING_PROVIDER_SLOTS", BoundedSemaphore(1))
  settings = Settings(
    aws_access_key_id="test",
    aws_secret_access_key="test",
    embedding_dimension=2,
  )
  first = asyncio.create_task(
    service._cached_embedding(settings, "category=lip", asyncio.Semaphore(8)),
  )
  for _ in range(100):
    if started.is_set():
      break
    await asyncio.sleep(0.001)
  assert started.is_set()
  coalesced = asyncio.create_task(
    service._cached_embedding(settings, "category=lip", asyncio.Semaphore(8)),
  )
  await asyncio.sleep(0)
  first.cancel()
  with pytest.raises(asyncio.CancelledError):
    await first

  saturated = await service._cached_embedding(
    settings,
    "category=cheek",
    asyncio.Semaphore(8),
  )
  assert saturated == (None, False, "embedding_capacity_saturated")
  assert calls == ["category=lip"]

  release_provider.set()
  assert await coalesced == ([1.0, 0.0], True, None)
  for _ in range(100):
    with service._EMBEDDING_CACHE_LOCK:
      if not service._EMBEDDING_INFLIGHT:
        break
    await asyncio.sleep(0.001)
  cached = await service._cached_embedding(
    settings,
    "category=lip",
    asyncio.Semaphore(8),
  )
  assert cached == ([1.0, 0.0], True, None)
  assert calls == ["category=lip"]


@pytest.mark.asyncio
async def test_embedding_failure_keeps_deterministic_rule_order(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(service, "embed_text", lambda *_args: None)
  with service._EMBEDDING_CACHE_LOCK:
    service._EMBEDDING_CACHE.clear()
  candidates = [
    {"productId": "first", "matchRate": 80, "_ruleScore": 80.0, "_semanticText": "first"},
    {"productId": "second", "matchRate": 70, "_ruleScore": 70.0, "_semanticText": "second"},
  ]
  ranked, meta = await service._semantic_rerank(
    candidates,
    {"category": "lip", "productTypes": []},
    Settings(aws_access_key_id="test", aws_secret_access_key="test", embedding_dimension=2),
    asyncio.Semaphore(8),
  )
  assert [item["productId"] for item in ranked] == ["first", "second"]
  assert meta == {
    "applied": False,
    "cacheHits": 0,
    "cacheMisses": 1,
    "degradedReason": "embedding_unavailable",
  }


@pytest.mark.asyncio
async def test_semantic_timeout_returns_rule_order_without_failing(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def slow_rerank(*_args, **_kwargs):
    await asyncio.sleep(1)
    raise AssertionError("wait_for should cancel the slow reranker")

  monkeypatch.setattr(service, "_semantic_rerank", slow_rerank)
  monkeypatch.setattr(service, "SEMANTIC_RERANK_TIMEOUT_SECONDS", 0.001)
  candidates = [
    {"productId": "lower", "matchRate": 50, "_ruleScore": 50.0},
    {"productId": "higher", "matchRate": 90, "_ruleScore": 90.0},
  ]
  ranked, meta = await service._bounded_semantic_rerank(
    candidates,
    {"category": "lip", "productTypes": []},
    Settings(aws_access_key_id="test", aws_secret_access_key="test"),
    asyncio.Semaphore(8),
  )
  assert [item["productId"] for item in ranked] == ["higher", "lower"]
  assert meta == {
    "applied": False,
    "cacheHits": 0,
    "cacheMisses": 0,
    "degradedReason": "embedding_timeout",
  }


@pytest.mark.asyncio
async def test_verified_only_path_does_not_use_catalog_supplement_when_empty(
) -> None:
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row()),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=1,
  )
  assert result["status"] == "noEligibleProducts"
  assert result["groups"][0]["items"] == []
  assert result["groups"][0]["source"] == "none"
  assert result["groups"][0]["degraded"] is False
  assert result["groups"][0]["degradedReason"] is None
  assert result["ranking"]["fallback"] == {
    "mode": "none",
    "reasonCodes": [],
    "supplementalAuradinApplied": False,
  }


@pytest.mark.asyncio
async def test_verified_only_underfilled_group_is_not_marked_as_fallback(
) -> None:
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row(), [_catalog_row("lip", "#B85E6D")]),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=2,
  )
  group = result["groups"][0]
  assert len(group["items"]) == 1
  assert group["source"] == "licensedCatalog"
  assert group["degraded"] is False
  assert group["degradedReason"] is None
  assert result["ranking"]["fallback"] == {
    "mode": "none",
    "reasonCodes": [],
    "supplementalAuradinApplied": False,
  }


@pytest.mark.asyncio
async def test_embedding_success_with_underfilled_group_still_has_no_fallback(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def successful_rerank(candidates, *_args, **_kwargs):
    return candidates, {
      "applied": True,
      "cacheHits": 1,
      "cacheMisses": 0,
      "degradedReason": None,
    }

  monkeypatch.setattr(service, "_bounded_semantic_rerank", successful_rerank)
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row(), [_catalog_row("lip", "#B85E6D")]),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=2,
  )
  assert result["ranking"]["embeddingApplied"] is True
  assert result["ranking"]["fallback"] == {
    "mode": "none",
    "reasonCodes": [],
    "supplementalAuradinApplied": False,
  }


@pytest.mark.asyncio
async def test_base_sql_does_not_require_lab_but_keeps_generic_asset_and_offer() -> None:
  class CaptureDatabase:
    def __init__(self) -> None:
      self.query = ""
      self.args = ()

    async def fetch(self, query: str, *args):
      self.query = " ".join(query.split())
      self.args = args
      return []

  db = CaptureDatabase()
  await service._fetch_internal_candidates(
    db,
    Settings(),
    user_id=USER_ID,
    categories=["base"],
  )
  assert (
    "s.product_region='base' or (s.lab_l is not null and s.lab_a is not null and s.lab_b is not null)"
    in db.query.lower()
  )
  assert db.query.lower().count("s.product_region='base' and candidate.shade_id is null") == 2
  assert "s.evidence_confidence >= $6" in db.query.lower()
  assert "s.reviewed_at is not null and s.reviewed_at <= now()" in db.query.lower()

  exact_product_id = uuid4()
  await service._fetch_internal_candidates(
    db,
    Settings(),
    user_id=USER_ID,
    categories=["base"],
    product_ids=[exact_product_id],
  )
  assert "($7::uuid[] is null or p.id=any($7::uuid[]))" in db.query.lower()
  assert "$7::uuid[] is not null or category_position<=$5" in db.query.lower()
  assert db.args[-1] == [exact_product_id]


def test_internal_candidate_requires_reviewed_high_confidence_evidence() -> None:
  target = service._guide_target(_guide("lip", "#B85E6D", "글로우 틴트"), {}, "lip")
  low_confidence = _catalog_row("lip", "#B85E6D")
  low_confidence["evidence_confidence"] = service.MIN_VERIFIED_SHADE_EVIDENCE_CONFIDENCE - 0.01
  unreviewed = _catalog_row("lip", "#B85E6D")
  unreviewed["reviewed_at"] = None

  assert service._internal_candidate(low_confidence, target, max_delta_e=18) is None
  assert service._internal_candidate(unreviewed, target, max_delta_e=18) is None


def _auth_context() -> AuthContext:
  return AuthContext(
    subject="makeup-product-user",
    provider="cognito",
    email="user@example.com",
    name="User",
    claims={"sub": "makeup-product-user"},
  )


def test_nested_routes_use_mobile_contract_and_private_cache_headers(monkeypatch: pytest.MonkeyPatch) -> None:
  app = create_app(Settings(database_url=None))
  db = type("RouteDatabase", (), {"is_connected": True})()
  app.dependency_overrides[get_current_user] = _auth_context
  app.dependency_overrides[require_database] = lambda: db

  async def fake_ensure_user(*_args):
    return {"id": USER_ID}

  async def fake_rate_limit(*_args, **_kwargs):
    return None

  async def fake_list(*_args, **_kwargs):
    return {"reports": [], "limit": 20, "offset": 0}

  dispatch_calls: list[dict] = []
  response_calls: list[dict] = []

  async def fake_dispatch(*_args, **kwargs):
    dispatch_calls.append(kwargs)
    return [{"id": UUID("33333333-3333-3333-3333-333333333333"), "status": "ready"}]

  async def fake_snapshot_response(*_args, **kwargs):
    response_calls.append(kwargs)
    return {
      "status": "ready",
      "snapshot": {"status": "ready", "runId": "33333333-3333-3333-3333-333333333333"},
      "groups": [],
      "ranking": {"strategy": service.ALGORITHM_VERSION, "embeddingApplied": False},
      "algorithmVersion": service.ALGORITHM_VERSION,
    }

  monkeypatch.setattr(products_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(products_api, "enforce_product_rate_limit", fake_rate_limit)
  monkeypatch.setattr(products_api, "list_owned_makeup_reports", fake_list)
  monkeypatch.setattr(products_api, "dispatch_makeup_report_product_snapshot_jobs", fake_dispatch)
  monkeypatch.setattr(products_api, "makeup_report_product_snapshot_response", fake_snapshot_response)
  client = TestClient(app)

  list_response = client.get("/api/products/recommendations/makeup-reports")
  detail_response = client.get(
    f"/api/products/recommendations/makeup-reports/{REPORT_ID}?lookId=anchor-look&categories=lip,shadow&perCategoryLimit=8",
  )
  rejected_limit = client.get(
    f"/api/products/recommendations/makeup-reports/{REPORT_ID}?perCategoryLimit=9",
  )
  refresh_response = client.post(
    f"/api/products/recommendations/makeup-reports/{REPORT_ID}/refresh?lookId=anchor-look",
  )
  assert list_response.status_code == detail_response.status_code == refresh_response.status_code == 200
  assert rejected_limit.status_code == 422
  assert list_response.headers["cache-control"] == detail_response.headers["cache-control"] == "private, no-store"
  assert detail_response.json()["data"]["ranking"]["strategy"] == service.ALGORITHM_VERSION
  assert dispatch_calls[0]["look_id"] == "anchor-look"
  assert dispatch_calls[0].get("force") is None
  assert dispatch_calls[1]["force"] is True
  assert response_calls[0]["categories"] == ["lip", "shadow"]
  assert response_calls[0]["per_category_limit"] == 8
  assert "/api/products/recommendations/makeup-reports/{report_id}" in app.openapi()["paths"]
  assert "/api/products/recommendations/makeup-reports/{report_id}/refresh" in app.openapi()["paths"]


def test_shadow_region_is_synchronized_across_schema_contracts() -> None:
  repository = Path(__file__).resolve().parents[3]
  schema = (repository / "docs/backend/schema.sql").read_text(encoding="utf-8")
  dbml = (repository / "docs/backend/aws-postgresql-schema.dbml").read_text(encoding="utf-8")
  migration = POST_SCHEMA_MIGRATIONS["schema.sql:product-shades-shadow-region-v1"]

  assert "'shadow'" in schema and "lip | cheek | shadow | liner | base | brow" in dbml
  assert "drop constraint if exists chk_product_shades_region" in migration.lower()
  assert "'shadow'" in migration
  assert "chk_product_shades_region" in EXPECTED_CONSTRAINTS["product_shades"]
  assert "'shadow'::text" in EXPECTED_CONSTRAINT_CONTRACTS["chk_product_shades_region"]
