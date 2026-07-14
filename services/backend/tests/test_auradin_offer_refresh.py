import re

from app.services.auradin_agent.knowledge_chunk_builder import build_mvp_catalog_item, price_tier_for
from app.services.auradin_catalog.offer_refresh import (
  OfferMatchResult,
  apply_refresh_to_seed,
  build_offer_query,
  compute_offer_diff,
  extract_variant_signature,
  match_offer_for_seed,
  score_offer_against_seed,
)


SEED = {
  "catalogItemId": "auradin-seed-abc",
  "brandName": "3CE",
  "productName": "베어 커버 쿠션",
  "sourceCandidateId": "naver-40083154013",
  "collectionStatus": "partial",
  "updatedAt": "2026-07-08T00:00:00+09:00",
  "liveOffer": {
    "priceKrw": 22080,
    "priceTier": "15k_25k",
    "purchaseUrl": "https://www.hmall.com/md/pda/itemPtc?slitmCd=1",
    "imageUrl": "https://img/1.jpg",
  },
  "attributes": {"finish": {"value": "matte"}},
}


def _offer(*, price: str = "23000", product_id: str = "40083154013") -> dict:
  return {
    "productId": product_id,
    "title": "<b>3CE</b> 베어 커버 쿠션",
    "lprice": price,
    "link": "https://new.example/item?q=tracking",
    "image": "https://new.example/image.jpg",
    "brand": "3CE",
  }


def _leaf_paths(a: object, b: object, prefix: str = "") -> set[str]:
  if isinstance(a, dict) and isinstance(b, dict):
    keys = set(a) | set(b)
    return set().union(
      *(_leaf_paths(a.get(key), b.get(key), f"{prefix}.{key}".lstrip(".")) for key in keys),
    ) if keys else set()
  return {prefix} if a != b else set()


def test_listing_id_exact_match_and_query_scoring_use_seed_fields() -> None:
  result = match_offer_for_seed(SEED, [_offer()])
  assert result.status == "matched"
  assert result.match_level == "listing_id"
  assert build_offer_query(SEED).startswith("3CE ")
  same = {**_offer(product_id="x"), "title": "3CE 베어 커버 쿠션"}
  other = {**_offer(product_id="y"), "title": "3CE 벨벳 틴트"}
  assert score_offer_against_seed(SEED, same) > score_offer_against_seed(SEED, other)


def test_title_ladder_requires_brand_variant_and_margin() -> None:
  refill = {**_offer(product_id="999"), "title": "3CE 베어 커버 쿠션 리필"}
  assert match_offer_for_seed(SEED, [refill]).status == "no_match"
  assert match_offer_for_seed(SEED, []).status == "no_match"
  other_brand = {**_offer(product_id="998"), "title": "롬앤 베어 커버 쿠션", "brand": "롬앤"}
  assert match_offer_for_seed(SEED, [other_brand]).status == "no_match"
  tied = [_offer(product_id="998"), _offer(product_id="999")]
  assert match_offer_for_seed(SEED, tied).status == "ambiguous"


def test_variant_signature_markers() -> None:
  signature = extract_variant_signature("베어 커버 쿠션 리필 15g 1+1 기획")
  assert signature == {"volume": "15g", "count": 2, "isRefill": True, "isMini": False, "isSet": True}


def test_compute_offer_diff_ignores_query_string_for_link_identity() -> None:
  same_path = {**_offer(), "link": "https://www.hmall.com/md/pda/itemPtc?other=2"}
  diff = compute_offer_diff(SEED, same_path)
  assert diff["linkChanged"] is False
  assert diff["imageChanged"] is True
  assert diff["priceDeltaPct"] > 0


def test_apply_refresh_touches_only_allowed_leaf_paths_and_passes_evidence() -> None:
  results = {"auradin-seed-abc": OfferMatchResult("matched", _offer(), "listing_id", 1.0, 0.0)}
  rows, queue, _ = apply_refresh_to_seed(
    [SEED], results, run_ts="2026-07-20T03:00:00+09:00", stale_state={}, review_decisions={},
  )
  assert not queue
  allowed = {
    "liveOffer.priceKrw",
    "liveOffer.priceTier",
    "liveOffer.purchaseUrl",
    "liveOffer.imageUrl",
    "updatedAt",
    "offerRefreshEvidence",
  }
  assert _leaf_paths(SEED, rows[0]) <= allowed
  evidence = rows[0]["offerRefreshEvidence"]
  assert set(evidence) == {"productId", "query", "fetchedAt", "matchLevel", "matchScore", "resultsSha"}
  assert evidence["productId"] and evidence["query"] and evidence["fetchedAt"]
  assert evidence["matchLevel"] in {"listing_id", "title_variant"}
  assert isinstance(evidence["matchScore"], (int, float))
  assert re.fullmatch(r"[0-9a-f]{64}", evidence["resultsSha"])

  catalog_seed = {**rows[0], "category": "base"}
  catalog_item = build_mvp_catalog_item(catalog_seed)
  assert catalog_item is not None
  assert catalog_item["offerRefreshEvidence"] == evidence


def test_price_tier_recomputed_on_boundary_cross() -> None:
  results = {"auradin-seed-abc": OfferMatchResult("matched", _offer(price="26000"), "listing_id", 1.0, 0.0)}
  rows, _, _ = apply_refresh_to_seed([SEED], results, run_ts="t", stale_state={}, review_decisions={})
  assert rows[0]["liveOffer"]["priceTier"] == price_tier_for(26000) != "15k_25k"


def test_price_gate_keep_old_is_fully_immutable_until_accept_new() -> None:
  jump = _offer(price="60000")
  results = {"auradin-seed-abc": OfferMatchResult("matched", jump, "listing_id", 1.0, 0.0)}
  rows, queue, _ = apply_refresh_to_seed([SEED], results, run_ts="t", stale_state={}, review_decisions={})
  assert queue and queue[0]["reason"] == "price_jump"
  assert rows[0] == SEED

  accepted, queue, _ = apply_refresh_to_seed(
    [SEED], results, run_ts="t", stale_state={}, review_decisions={"auradin-seed-abc": "accept_new"},
  )
  assert not queue
  assert accepted[0]["liveOffer"]["priceKrw"] == 60000


def test_no_match_twice_requires_human_mark_stale() -> None:
  results = {"auradin-seed-abc": OfferMatchResult("no_match", None, "", 0.0, 0.0)}
  _, queue1, state1 = apply_refresh_to_seed(
    [SEED], results, run_ts="t1", stale_state={}, review_decisions={},
  )
  assert not queue1
  rows2, queue2, _ = apply_refresh_to_seed(
    [SEED], results, run_ts="t2", stale_state=state1, review_decisions={},
  )
  assert rows2[0]["collectionStatus"] == "partial"
  assert any(row["reason"] == "possible_stale" for row in queue2)
  rows3, _, _ = apply_refresh_to_seed(
    [SEED],
    results,
    run_ts="t2",
    stale_state=state1,
    review_decisions={"auradin-seed-abc": "mark_stale"},
  )
  assert rows3[0]["collectionStatus"] == "stale"
