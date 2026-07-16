from scripts.report_auradin_crawl_coverage import diff_catalogs


def _row(
  row_id: str,
  product: str,
  *,
  price: int = 10000,
  tier: str = "under_15k",
  status: str = "partial",
) -> dict:
  return {
    "catalogItemId": row_id,
    "brandName": "3CE",
    "productName": product,
    "liveOffer": {"priceKrw": price, "priceTier": tier},
    "collectionStatus": status,
  }


def test_diff_uses_normalized_identity_for_membership_and_id_for_mutations() -> None:
  previous = [_row("old-listing", "베어 커버 쿠션")]
  current = [_row("new-listing", "베어 커버 쿠션")]
  diff = diff_catalogs(previous, current)
  assert diff["added"] == []
  assert diff["removed"] == []
  assert diff["priceChanged"] == 0
  assert diff["priceTierMoved"] == 0

  previous = [_row("stable", "베어 커버 쿠션")]
  current = [_row("stable", "베어 커버 쿠션", price=26000, tier="25k_40k", status="stale")]
  diff = diff_catalogs(previous, current)
  assert diff["priceChanged"] == 1
  assert diff["priceTierMoved"] == 1
  assert diff["staleCount"] == 1


def test_diff_preserves_duplicate_normalized_keys_as_a_multiset() -> None:
  previous = [
    _row("duplicate-1", "베어 커버 쿠션"),
    _row("duplicate-2", "베어 커버 쿠션"),
  ]
  current = [_row("duplicate-1", "베어 커버 쿠션")]
  diff = diff_catalogs(previous, current)
  assert diff["added"] == []
  assert len(diff["removed"]) == 1
  assert diff["removed"][0].startswith("3ce|")
