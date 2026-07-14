from app.core.settings import get_settings
from app.services.auradin_agent.catalog_loader import read_jsonl
from app.services.auradin_agent.snapshot_manifest import resolve_and_validate_snapshot


def _active_paths():
  descriptor = resolve_and_validate_snapshot(get_settings())
  return descriptor.catalog_path, descriptor.chunks_path


def test_mvp_preprocessing_outputs_are_purchasable() -> None:
  catalog_path, chunk_path = _active_paths()
  catalog = read_jsonl(catalog_path)
  chunks = read_jsonl(chunk_path)

  # 618 unique products across all 6 served categories in the enriched 20260708 seed
  # (official-name attribute extraction folded in; base/brow/liner serving opened).
  assert len(catalog) == 618
  assert len(chunks) >= len(catalog)
  assert {item["category"] for item in catalog} == {"lip", "cheek", "shadow", "base", "brow", "liner"}

  for item in catalog:
    live_offer = item["liveOffer"]
    assert live_offer["priceKrw"] > 0
    assert live_offer["imageUrl"]
    assert live_offer["purchaseUrl"]


def test_title_residual_keywords_remain_soft_only() -> None:
  catalog_path, _chunk_path = _active_paths()
  catalog = read_jsonl(catalog_path)
  inferred_items = [item for item in catalog if item.get("residualTitleKeywords")]

  assert inferred_items
  for item in inferred_items[:20]:
    for keyword in item["residualTitleKeywords"]:
      assert keyword["sourceType"] == "title_residual_rule_inferred"
      assert keyword["hardFilterEligible"] is False
