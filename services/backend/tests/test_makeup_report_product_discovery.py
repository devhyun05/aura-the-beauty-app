from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw
import pytest

from app.core.settings import Settings
from app.services import makeup_report_product_discovery as discovery


def _image_bytes(color: str) -> bytes:
  image = Image.new("RGB", (160, 160), "white")
  draw = ImageDraw.Draw(image)
  draw.rectangle((28, 28, 132, 132), fill=color)
  output = BytesIO()
  image.save(output, format="PNG")
  return output.getvalue()


def _palette_image_bytes(colors: list[str]) -> bytes:
  image = Image.new("RGB", (240, 160), "white")
  draw = ImageDraw.Draw(image)
  width = 180 // max(1, len(colors))
  for index, color in enumerate(colors):
    left = 25 + index * width
    draw.rectangle((left, 35, left + width - 6, 125), fill=color)
  output = BytesIO()
  image.save(output, format="PNG")
  return output.getvalue()


def _target() -> dict[str, Any]:
  return {
    "category": "lip",
    "colorName": "뮤티드 로즈",
    "colorHex": "#B85E6D",
    "colors": [{"name": "뮤티드 로즈", "hex": "#B85E6D"}],
    "colorFamily": "rose",
    "finish": "glow",
    "productTypes": ["tint"],
  }


class _ImageResponse:
  def __init__(self, content: bytes) -> None:
    self.content = content
    self.headers = {"content-type": "image/png"}

  def raise_for_status(self) -> None:
    return None


class _ImageClient:
  def __init__(self, content: bytes) -> None:
    self.content = content
    self.urls: list[str] = []

  async def get(self, url: str, **_kwargs: Any) -> _ImageResponse:
    self.urls.append(url)
    return _ImageResponse(self.content)


def test_build_query_uses_report_color_and_category_without_user_context() -> None:
  query = discovery.build_report_product_query("lip", _target())
  assert "뮤티드 로즈" in query
  assert "립 틴트" in query
  assert len(query) <= 80


def test_shadow_builds_separate_queries_for_partial_palette_colors() -> None:
  target = {
    "colorName": "소프트 토프",
    "colorFamily": "brown",
    "colors": [
      {"name": "라이트 토프", "hex": "#9B7F74"},
      {"name": "웜 베이지", "hex": "#D5C5BC"},
      {"name": "딥 브라운", "hex": "#735C55"},
    ],
  }
  queries = discovery.build_report_product_queries("shadow", target)
  assert 2 <= len(queries) <= 4
  assert any("라이트 토프" in query for query in queries)
  assert any("웜 베이지" in query for query in queries)
  assert all("아이섀도우" in query for query in queries)


def test_listing_image_palette_computes_real_ciede2000_evidence() -> None:
  evidence = discovery.extract_listing_image_color_evidence(
    _image_bytes("#B85E6D"),
    category="lip",
    target_colors=_target()["colors"],
  )
  assert evidence is not None
  assert evidence.color_hex == "#B85E6D"
  assert evidence.target_hex == "#B85E6D"
  assert evidence.delta_e < 0.1
  assert evidence.coverage > 0.3


def test_shadow_palette_matches_independent_subset_of_report_colors() -> None:
  targets = [
    {"name": "토프", "hex": "#9B7F74"},
    {"name": "베이지", "hex": "#D5C5BC"},
    {"name": "딥 브라운", "hex": "#735C55"},
  ]
  evidence = discovery.extract_listing_image_color_evidence(
    _palette_image_bytes(["#9B7F74", "#735C55", "#E8A9B0"]),
    category="shadow",
    target_colors=targets,
  )
  assert evidence is not None
  close_matches = [match for match in evidence.matches if match.delta_e <= 1]
  assert {match.target_hex for match in close_matches} == {"#9B7F74", "#735C55"}
  assert len({match.observed_hex for match in close_matches}) == 2


def test_same_external_product_keeps_only_lowest_price_verified_offer() -> None:
  items = [
    {
      "productId": "naver-expensive",
      "externalSource": discovery.DISCOVERY_SOURCE,
      "category": "shadow",
      "productName": "소프트 무드 아이섀도우 팔레트 2개 04 쿨 애쉬 토프",
      "price": {"amount": 21500},
      "matchRate": 98,
      "purchaseUrl": "https://shop.example.com/expensive",
    },
    {
      "productId": "naver-cheapest",
      "externalSource": discovery.DISCOVERY_SOURCE,
      "category": "shadow",
      "productName": "소프트 무드 아이섀도우 팔레트 1개 04 쿨 애쉬 토프",
      "price": {"amount": 11800},
      "matchRate": 94,
      "purchaseUrl": "https://shop.example.com/cheapest",
    },
    {
      "productId": "naver-other-shade",
      "externalSource": discovery.DISCOVERY_SOURCE,
      "category": "shadow",
      "productName": "소프트 무드 아이섀도우 팔레트 1개 05 로지 토프",
      "price": {"amount": 9900},
      "matchRate": 93,
      "purchaseUrl": "https://shop.example.com/other-shade",
    },
  ]

  deduped = discovery.dedupe_lowest_price_product_offers(items)

  assert [item["productId"] for item in deduped] == ["naver-cheapest", "naver-other-shade"]
  assert deduped[0]["purchaseUrl"].endswith("/cheapest")


def test_internal_products_are_not_name_collapsed() -> None:
  items = [
    {"productId": "internal-a", "category": "lip", "productName": "같은 표시명", "price": {"amount": 10000}},
    {"productId": "internal-b", "category": "lip", "productName": "같은 표시명", "price": {"amount": 9000}},
  ]
  assert discovery.dedupe_lowest_price_product_offers(items) == items


@pytest.mark.asyncio
async def test_naver_candidate_requires_and_persists_image_color_evidence() -> None:
  client = _ImageClient(_image_bytes("#B85E6D"))
  item = {
    "productId": "123456",
    "title": "검증브랜드 로즈 글로우 립 틴트 01",
    "brand": "검증브랜드",
    "mallName": "공식 판매처",
    "category2": "색조메이크업",
    "category3": "립틴트",
    "link": "https://shop.example.com/products/123456",
    "image": "https://shopping-phinf.pstatic.net/main_123/123456.jpg",
    "lprice": "18900",
  }
  result = await discovery._map_naver_candidate(
    client,  # type: ignore[arg-type]
    Settings(),
    item,
    category="lip",
    target=_target(),
    captured_at=datetime(2026, 7, 20, tzinfo=timezone.utc),
    semaphore=asyncio.Semaphore(1),
  )
  assert result is not None
  assert result["productId"] == "naver-123456"
  assert result["externalSource"] == "naver_shopping_search"
  assert result["recommendationBasis"] == "verifiedListingImageColor"
  assert result["verification"]["evidenceType"] == discovery.IMAGE_EVIDENCE_TYPE
  assert result["verification"]["observedColorHex"] == "#B85E6D"
  assert result["colorDistance"] < 0.1
  assert result["matchRate"] == 99
  assert discovery.is_verified_report_discovery_item(result) is True


@pytest.mark.asyncio
async def test_shadow_candidate_accepts_partial_palette_and_records_each_real_match() -> None:
  target = {
    "category": "shadow",
    "colorName": "소프트 토프",
    "colorHex": "#9B7F74",
    "colors": [
      {"name": "소프트 토프", "hex": "#9B7F74"},
      {"name": "웜 베이지", "hex": "#D5C5BC"},
      {"name": "딥 브라운", "hex": "#735C55"},
      {"name": "로즈", "hex": "#B09385"},
    ],
    "colorFamily": "brown",
    "finish": "matte",
    "productTypes": ["shadow"],
  }
  client = _ImageClient(_palette_image_bytes(["#9B7F74", "#735C55", "#E8A9B0"]))
  item = {
    "productId": "shadow-palette",
    "title": "검증브랜드 소프트 토프 아이섀도우 팔레트",
    "brand": "검증브랜드",
    "mallName": "공식 판매처",
    "category3": "아이섀도우",
    "link": "https://shop.example.com/products/shadow-palette",
    "image": "https://shopping-phinf.pstatic.net/main_123/shadow-palette.jpg",
    "lprice": "24000",
  }
  result = await discovery._map_naver_candidate(
    client,  # type: ignore[arg-type]
    Settings(makeup_report_shadow_palette_max_delta_e=26),
    item,
    category="shadow",
    target=target,
    captured_at=datetime(2026, 7, 20, tzinfo=timezone.utc),
    semaphore=asyncio.Semaphore(1),
  )
  assert result is not None
  assert result["recommendationBasis"] == "verifiedListingImagePalettePartial"
  assert result["verification"]["matchPolicy"] == "partial_palette_any_v1"
  assert result["verification"]["matchedColorCount"] >= 2
  assert result["verification"]["targetColorCount"] == 4
  assert "REPORT_PALETTE_PARTIAL_MATCH" in result["reasonCodes"]
  assert discovery.is_verified_report_discovery_item(result) is True


@pytest.mark.asyncio
async def test_naver_candidate_rejects_wrong_product_image_color() -> None:
  client = _ImageClient(_image_bytes("#3E6FC5"))
  item = {
    "productId": "wrong-color",
    "title": "검증브랜드 로즈 립 틴트",
    "category3": "립틴트",
    "link": "https://shop.example.com/products/wrong-color",
    "image": "https://shopping-phinf.pstatic.net/main_123/wrong-color.jpg",
    "lprice": "12000",
  }
  result = await discovery._map_naver_candidate(
    client,  # type: ignore[arg-type]
    Settings(),
    item,
    category="lip",
    target=_target(),
    captured_at=datetime(2026, 7, 20, tzinfo=timezone.utc),
    semaphore=asyncio.Semaphore(1),
  )
  assert result is None


@pytest.mark.asyncio
async def test_missing_naver_credentials_returns_empty_without_fallback() -> None:
  products, meta = await discovery.discover_report_products(
    Settings(naver_shopping_client_id=None, naver_shopping_client_secret=None),
    targets_by_category={"lip": _target()},
    per_category_limit=8,
  )
  assert products == {"lip": []}
  assert meta["configured"] is False
  assert meta["applied"] is False
  assert meta["verifiedItems"] == 0


def test_legacy_external_item_is_not_accepted_as_verified_discovery() -> None:
  assert discovery.is_verified_report_discovery_item({
    "productId": "naver-old",
    "externalSource": "naver_shopping_search",
    "imageUrl": "https://shopping-phinf.pstatic.net/old.jpg",
    "purchaseUrl": "https://shop.example.com/old",
    "matchRate": 99,
  }) is False
