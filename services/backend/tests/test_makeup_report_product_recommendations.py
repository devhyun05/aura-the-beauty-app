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


def _fresh_external_item(category: str, *, product_name: str, color_family: str | None) -> dict:
  return {
    "productId": f"external-{category}",
    "brandName": "External Brand",
    "productName": product_name,
    "shadeName": "Rose",
    "category": category,
    "colorFamily": color_family,
    "finish": "glow",
    "texture": "liquid" if category != "base" else "cream",
    "imageUrl": "https://images.example.com/product.png",
    "purchaseUrl": "https://shop.example.com/product",
    "price": {"amount": 25000, "currency": "KRW"},
    "offer": {"offerId": f"external-{category}-offer"},
    "externalSource": external_catalog.AURADIN_CATALOG_SOURCE,
    "_freshnessVerified": True,
    "_offerVerifiedAt": "2026-07-20T00:00:00+00:00",
    "_snapshotRunDate": "20260720",
    "_hardFilterEligible": {
      "category": True,
      "purchaseUrl": True,
      "imageUrl": True,
      "priceKrw": True,
      "colorFamily": True,
      "finish": True,
      "texture": True,
    },
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
  monkeypatch.setattr(service, "get_auradin_catalog_products", _empty_external)
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
async def test_missing_anchor_defaults_to_first_complete_look(monkeypatch: pytest.MonkeyPatch) -> None:
  report = _report_row()
  report["recommendation"]["looks"] = report["recommendation"]["looks"][1:]
  monkeypatch.setattr(service, "get_auradin_catalog_products", _empty_external)
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
  monkeypatch.setattr(service, "get_auradin_catalog_products", _empty_external)
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


async def _empty_external(*_args, **_kwargs):
  return []


@pytest.mark.asyncio
async def test_base_is_family_level_and_never_claims_color_or_shade(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  db = _DetailDatabase(_report_row(), [_catalog_row("base", "#101010", product_name="글로우 쿠션")])
  monkeypatch.setattr(service, "get_auradin_catalog_products", _empty_external)
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
    "mode": "rules_only",
    "reasonCodes": ["EMBEDDING_NOT_CONFIGURED"],
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


def test_external_supplement_accepts_only_verified_exact_or_adjacent_broad_color() -> None:
  target = {
    "category": "lip",
    "colorFamily": "rose",
    "finish": "glow",
    "texture": "liquid",
    "productTypes": ["tint"],
  }
  product = _fresh_external_item("lip", product_name="Rose Tint", color_family=None)
  assert service._external_candidate({**product, "colorFamily": None}, target) is None
  assert service._external_candidate({**product, "colorFamily": "peach"}, target) is None
  assert service._external_candidate({**product, "colorFamily": "brown"}, target) is None
  exact = service._external_candidate({**product, "colorFamily": "rose"}, target)
  adjacent = service._external_candidate({**product, "colorFamily": "mauve"}, target)
  assert exact is not None and adjacent is not None
  assert exact["_ruleScore"] > adjacent["_ruleScore"]
  assert exact["shadeHex"] is None and exact["colorDistance"] is None
  assert adjacent["shadeHex"] is None and adjacent["colorDistance"] is None
  assert "MATCHING_COLOR_FAMILY" in exact["reasonCodes"]
  assert "ADJACENT_COLOR_FAMILY" in adjacent["reasonCodes"]
  assert "인접" in adjacent["reasonLabels"][1]


@pytest.mark.parametrize(
  ("target_family", "candidate_family"),
  [
    ("orange", "coral"),
    ("orange", "peach"),
    ("rose", "pink"),
    ("rose", "coral"),
  ],
)
def test_reviewed_adjacent_color_graph_is_non_transitive(
  target_family: str,
  candidate_family: str,
) -> None:
  target = {
    "category": "lip",
    "colorFamily": target_family,
    "finish": "glow",
    "texture": "liquid",
    "productTypes": ["tint"],
  }
  product = _fresh_external_item("lip", product_name="Color Tint", color_family=candidate_family)
  accepted = service._external_candidate(product, target)
  assert accepted is not None
  assert accepted["reasonCodes"][1] == "ADJACENT_COLOR_FAMILY"

  far = service._external_candidate({**product, "colorFamily": "purple"}, target)
  assert far is None


def test_external_base_is_always_product_family_level() -> None:
  accepted = service._external_candidate(
    {
      **_fresh_external_item("base", product_name="Glow Cushion", color_family="warm-beige"),
      "shadeName": "Warm Beige 23",
    },
    {
      "category": "base",
      "colorFamily": None,
      "finish": "glow",
      "texture": "cream",
      "productTypes": ["cushion"],
    },
  )
  assert accepted is not None
  assert accepted["shadeId"] is None and accepted["shadeName"] is None
  assert accepted["shadeHex"] is None and accepted["colorDistance"] is None
  assert accepted["recommendationBasis"] == "semanticCatalogProductFamily"
  assert accepted["degradedReason"] == "external_catalog_unverified_product_family"
  assert "color_family=" not in accepted["_semanticText"]
  assert "검증 제품군" in accepted["reasonLabels"][0]


def test_external_candidate_rejects_missing_freshness_or_real_offer() -> None:
  target = {
    "category": "lip",
    "colorFamily": "rose",
    "finish": "glow",
    "texture": "liquid",
    "productTypes": ["tint"],
  }
  product = _fresh_external_item("lip", product_name="Rose Tint", color_family="rose")
  assert service._external_candidate({**product, "_freshnessVerified": False}, target) is None
  assert service._external_candidate({**product, "purchaseUrl": "http://shop.example.com"}, target) is None
  assert service._external_candidate({**product, "price": {"amount": 0}}, target) is None


def test_external_candidate_uses_only_hard_filter_eligible_attributes() -> None:
  target = {
    "category": "lip",
    "colorFamily": "rose",
    "finish": "glow",
    "texture": "liquid",
    "productTypes": ["tint"],
  }
  product = _fresh_external_item("lip", product_name="Rose Tint", color_family="rose")
  rejected = {**product, "_hardFilterEligible": {**product["_hardFilterEligible"], "colorFamily": False}}
  assert service._external_candidate(rejected, target) is None

  eligible_without_soft_fields = {
    **product,
    "_hardFilterEligible": {
      **product["_hardFilterEligible"],
      "finish": False,
      "texture": False,
    },
  }
  accepted = service._external_candidate(eligible_without_soft_fields, target)
  assert accepted is not None
  assert "MATCHING_FINISH" not in accepted["reasonCodes"]
  assert "MATCHING_TEXTURE" not in accepted["reasonCodes"]
  assert accepted["finish"] is None and accepted["texture"] is None
  assert "finish=" not in accepted["_semanticText"]
  assert "texture=" not in accepted["_semanticText"]


def test_external_candidate_accepts_legitimate_korean_blush_alias() -> None:
  accepted = service._external_candidate(
    _fresh_external_item("cheek", product_name="로즈 블러쉬", color_family="rose"),
    {
      "category": "cheek",
      "colorFamily": "rose",
      "finish": "glow",
      "texture": "liquid",
      "productTypes": ["blush"],
    },
  )
  assert accepted is not None
  assert "MATCHING_PRODUCT_TYPE" in accepted["reasonCodes"]


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
  assert service._external_candidate(
    _fresh_external_item("brow", product_name="Brown Lash Maker", color_family="brown"),
    {
      "category": "brow",
      "colorFamily": "brown",
      "finish": "glow",
      "texture": "liquid",
      "productTypes": ["brow"],
    },
  ) is None


def test_actual_industrial_base_fixture_is_rejected_by_cosmetic_type_gate() -> None:
  # This active snapshot row was misclassified as base because its industrial
  # product title contains "마그네틱 베이스" and the brand token "3CE".
  product = external_catalog.resolve_auradin_catalog_product("auradin-seed-38c1602f279ef2ea")
  assert product is not None and "마그네틱 베이스" in product["productName"]
  product["_freshnessVerified"] = True  # isolate the independent cosmetic-type gate.
  raw_product = external_catalog.get_catalog().get("auradin-seed-38c1602f279ef2ea")
  assert raw_product is not None
  product["_hardFilterEligible"] = raw_product["hardFilterEligible"]
  assert service._external_candidate(
    product,
    {
      "category": "base",
      "colorFamily": None,
      "finish": "glow",
      "texture": "cream",
      "productTypes": ["cushion", "foundation"],
    },
  ) is None


@pytest.mark.parametrize(
  ("product_id", "category", "color_family", "target_type", "title_token"),
  [
    ("auradin-seed-eb3b65093cd71d03", "brow", "black", "brow", "래쉬 메이커"),
    ("auradin-seed-99180d0c667df201", "shadow", "brown", "shadow", "슬림라이너"),
  ],
)
def test_actual_nonmatching_cosmetic_type_fixtures_are_rejected(
  product_id: str,
  category: str,
  color_family: str,
  target_type: str,
  title_token: str,
) -> None:
  product = external_catalog.resolve_auradin_catalog_product(product_id)
  assert product is not None and title_token in product["productName"]
  raw_product = external_catalog.get_catalog().get(product_id)
  assert raw_product is not None
  product.update({
    "_freshnessVerified": True,
    "_hardFilterEligible": raw_product["hardFilterEligible"],
  })
  assert service._external_candidate(
    product,
    {
      "category": category,
      "colorFamily": color_family,
      "finish": None,
      "texture": None,
      "productTypes": [target_type],
    },
  ) is None


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
async def test_active_rose_cheek_match_survives_broad_pool_before_report_gate() -> None:
  class OfflineDatabase:
    is_connected = False

  kwargs = {
    "user_id": None,
    "categories": ["cheek"],
    "strategy": "popular",
    "verified_offer_max_age_hours": 168,
    "verified_offer_now": datetime(2026, 7, 20, tzinfo=timezone.utc),
  }
  popular_eight = await external_catalog.get_auradin_catalog_products(
    OfflineDatabase(), limit=8, **kwargs,
  )
  broad_pool = await external_catalog.get_auradin_catalog_products(
    OfflineDatabase(), limit=service.MAX_EXTERNAL_PREFILTER_PER_CATEGORY, **kwargs,
  )
  assert not any(item.get("colorFamily") == "rose" for item in popular_eight)
  target = service._guide_target(_guide("cheek", "#D98A91", "크림 블러셔"), {}, "cheek")
  accepted = [item for item in broad_pool if service._external_candidate(item, target)]
  assert "auradin-seed-9228b94647924247" in {item["productId"] for item in accepted}


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
  external = service._external_candidate(
    _fresh_external_item(
      "lip",
      product_name="SECRET 외부 상품 로즈 틴트",
      color_family="rose",
    ),
    target,
  )

  assert internal is not None and external is not None
  allowed_keys = {"category", "color_family", "finish", "texture", "product_type"}
  for text in (internal["_semanticText"], external["_semanticText"]):
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
async def test_fallback_metadata_reports_rules_and_catalog_supplement(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  captured: dict = {}

  async def external(*_args, **_kwargs):
    captured.update(_kwargs)
    return [_fresh_external_item("lip", product_name="Rose Glow Tint", color_family="rose")]

  monkeypatch.setattr(service, "get_auradin_catalog_products", external)
  result = await service.get_makeup_report_product_recommendations(
    _DetailDatabase(_report_row()),
    Settings(),
    user_id=USER_ID,
    report_id=REPORT_ID,
    look_id="anchor-look",
    categories=["lip"],
    per_category_limit=1,
  )
  assert captured["limit"] == service.MAX_EXTERNAL_PREFILTER_PER_CATEGORY
  assert captured["verified_offer_max_age_hours"] == Settings().product_offer_max_age_hours
  assert result["ranking"]["fallback"] == {
    "mode": "rules_only_with_catalog_supplement",
    "reasonCodes": [
      "EMBEDDING_NOT_CONFIGURED",
      "VERIFIED_CATALOG_SHORTAGE",
      "SUPPLEMENTAL_AURADIN_APPLIED",
    ],
    "supplementalAuradinApplied": True,
  }


@pytest.mark.asyncio
async def test_filtered_supplement_reports_shortage_and_rules_only(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def mismatched(*_args, **_kwargs):
    return [_fresh_external_item("lip", product_name="Peach Tint", color_family="peach")]

  monkeypatch.setattr(service, "get_auradin_catalog_products", mismatched)
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
  assert group["degraded"] is True
  assert group["degradedReason"] == "external_catalog_filtered_or_stale"
  assert result["ranking"]["fallback"] == {
    "mode": "catalog_shortage",
    "reasonCodes": [
      "EMBEDDING_NOT_CONFIGURED",
      "SUPPLEMENTAL_CATALOG_FILTERED",
      "VERIFIED_CATALOG_SHORTAGE",
    ],
    "supplementalAuradinApplied": False,
  }


@pytest.mark.asyncio
async def test_unavailable_supplement_reports_shortage_and_rules_only(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def unavailable(*_args, **_kwargs):
    raise RuntimeError("snapshot unavailable")

  monkeypatch.setattr(service, "get_auradin_catalog_products", unavailable)
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
  assert group["degraded"] is True
  assert group["degradedReason"] == "external_catalog_unavailable"
  assert result["ranking"]["fallback"] == {
    "mode": "catalog_shortage",
    "reasonCodes": [
      "EMBEDDING_NOT_CONFIGURED",
      "SUPPLEMENTAL_CATALOG_UNAVAILABLE",
      "VERIFIED_CATALOG_SHORTAGE",
    ],
    "supplementalAuradinApplied": False,
  }


@pytest.mark.asyncio
async def test_embedding_success_with_underfilled_group_uses_catalog_shortage_mode(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def successful_rerank(candidates, *_args, **_kwargs):
    return candidates, {
      "applied": True,
      "cacheHits": 1,
      "cacheMisses": 0,
      "degradedReason": None,
    }

  monkeypatch.setattr(service, "get_auradin_catalog_products", _empty_external)
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
  assert result["ranking"]["fallback"]["mode"] == "catalog_shortage"
  assert "VERIFIED_CATALOG_SHORTAGE" in result["ranking"]["fallback"]["reasonCodes"]


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
