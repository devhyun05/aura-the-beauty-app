"""M1 cross-stage contracts that are easy to lose at integration boundaries."""

import pytest

from app.core.settings import Settings
from app.services.auradin_agent import enrichment
from app.services.auradin_agent.retrieval_service import apply_hard_filters


def _item(item_id: str, finish: str, *, eligible: bool) -> dict:
  return {
    "id": item_id,
    "category": "lip",
    "attributes": {"finish": finish},
    "hardFilterEligible": {"finish": eligible},
    "liveOffer": {
      "priceKrw": 10000,
      "purchaseUrl": f"https://example.test/{item_id}",
      "imageUrl": f"https://example.test/{item_id}.jpg",
    },
  }


QUESTION_FINISH = {
  "attribute": "finish",
  "op": "in",
  "values": ["matte"],
  "source": "question",
  "mode": "hard",
}


def test_question_hard_filter_drops_only_known_mismatch() -> None:
  known_match = _item("known-match", "matte", eligible=True)
  known_mismatch = _item("known-mismatch", "glossy", eligible=True)
  unknown = _item("unknown", "glossy", eligible=False)

  filtered = apply_hard_filters(
    [known_match, known_mismatch, unknown],
    [QUESTION_FINISH],
  )

  assert [item["id"] for item in filtered] == ["known-match", "unknown"]


def test_final_question_coverage_marks_unknown_without_calling_it_a_match(monkeypatch) -> None:
  known_match = _item("known-match", "matte", eligible=True)
  unknown = _item("unknown", "matte", eligible=False)

  class FakeCatalog:
    by_id = {known_match["id"]: known_match, unknown["id"]: unknown}

  monkeypatch.setattr(enrichment, "get_catalog", lambda: FakeCatalog())
  question_filter = dict(QUESTION_FINISH)
  state = {"hardFilters": [question_filter]}
  result = {
    "products": [
      {"id": "known-match", "reason": {"caveat": []}},
      {"id": "unknown", "reason": {"caveat": []}},
    ],
    "diagnostics": {},
  }

  enrichment._annotate_question_filter_coverage(state, result)

  summary = result["questionFilterCoverage"][0]
  assert summary["coverage"] == "partial_unknown"
  assert summary["cards"] == [
    {"productId": "known-match", "status": "match"},
    {"productId": "unknown", "status": "unknown"},
  ]
  assert result["products"][0]["reason"]["caveat"] == []
  assert result["products"][1]["reason"]["caveat"] == ["정보 미상이라 제외하지 않음"]
  assert question_filter["coverage"] == "partial_unknown"
  assert question_filter["coverageCaveat"] == "정보 미상 포함"


def test_final_question_coverage_exposes_impossible_known_violation(monkeypatch) -> None:
  mismatch = _item("known-mismatch", "glossy", eligible=True)

  class FakeCatalog:
    by_id = {mismatch["id"]: mismatch}

  monkeypatch.setattr(enrichment, "get_catalog", lambda: FakeCatalog())
  question_filter = dict(QUESTION_FINISH)
  state = {"hardFilters": [question_filter]}
  result = {
    "products": [{"id": "known-mismatch", "reason": {"caveat": []}}],
    "diagnostics": {},
  }

  enrichment._annotate_question_filter_coverage(state, result)

  assert result["questionFilterCoverage"][0]["coverage"] == "violation"
  assert result["products"][0]["reason"]["caveat"] == []
  assert question_filter["coverage"] == "violation"


@pytest.mark.asyncio
async def test_live_path_applies_guard_floor_seeded_mmr_dedupe_role_fill_and_cache(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  """F18 전체 경로: A4 → floor → curated seed MMR → dedupe → role fill/cache."""
  anchor = _item("curated-anchor", "glossy", eligible=True)
  anchor.update({"brandName": "Brand A", "productName": "Glow Lip"})

  def live(
    item_id: str,
    *,
    brand: str,
    product: str,
    finish: str,
    eligible: bool,
  ) -> dict:
    item = _item(item_id, finish, eligible=eligible)
    item.update({"brandName": brand, "productName": product})
    return item

  live_items = {
    # 같은 상품의 다른 listing: curated seed와 brand+product key가 같아 제거돼야 한다.
    "duplicate": live(
      "live-duplicate",
      brand=" brand-a ",
      product="brand-a Glow-Lip",
      finish="glossy",
      eligible=True,
    ),
    # glossy 명시 선호에 대한 known opposite: A4에서 제거.
    "conflict": live(
      "live-conflict", brand="Brand B", product="Matte Lip", finish="matte", eligible=True,
    ),
    # 명시 매치·known hard·semantic/evidence가 모두 없어 floor에서 제거.
    "weak": live(
      "live-weak", brand="Brand C", product="Satin Lip", finish="satin", eligible=True,
    ),
    "pick-a": live(
      "live-pick-a", brand="Brand D", product="Shine Lip", finish="glossy", eligible=True,
    ),
    "pick-b": live(
      "live-pick-b", brand="Brand E", product="Glass Lip", finish="glossy", eligible=True,
    ),
  }

  async def fake_fetch(*_args, **_kwargs):
    return [{"key": key} for key in live_items]

  def fake_build(raw, **_kwargs):
    return live_items[raw["key"]]

  monkeypatch.setattr(enrichment, "_fetch_raw_naver_items", fake_fetch)
  monkeypatch.setattr(enrichment, "_live_catalog_item", fake_build)
  monkeypatch.setattr(enrichment, "get_catalog", lambda: {anchor["id"]: anchor})

  state = {
    "hardFilters": [],
    "softPreferences": [
      {"attribute": "finish", "values": ["glossy"], "source": "prompt", "confidence": 1.0},
    ],
  }
  result = {
    "products": [
      {"id": anchor["id"], "category": "lip", "role": "anchor"},
      {"id": "old-discovery", "category": "lip", "role": "discovery"},
    ],
  }
  settings = Settings(
    database_url=None,
    # dev 병합: 배포 기본은 trusted-catalog 서빙(라이브 네이버 발견 비활성)이다. 라이브
    # 발견 경로(M1 §5 floor·MMR·role-fill)를 검증하려면 legacy 플래그를 명시 활성화한다.
    legacy_naver_product_search=True,
    auradin_live_discovery_enabled=True,
    naver_shopping_client_id="test-id",
    naver_shopping_client_secret="test-secret",
  )

  diagnostic = await enrichment._enrich_live_discovery(state, settings, result, None)

  assert diagnostic["status"] == "filled"
  assert diagnostic["filledCount"] == 2
  assert [product["role"] for product in result["products"]] == [
    "anchor",
    "diverse",
    "discovery",
  ]
  picked_ids = {product["id"] for product in result["products"][1:]}
  assert picked_ids == {"live-pick-a", "live-pick-b"}
  assert picked_ids.isdisjoint({"live-duplicate", "live-conflict", "live-weak"})
  assert state["liveDiscoveryCache"]["items"]
