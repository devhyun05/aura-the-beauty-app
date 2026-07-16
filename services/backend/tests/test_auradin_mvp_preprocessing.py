from app.core.settings import get_settings
from app.services.auradin_agent.catalog_loader import read_jsonl
from app.services.auradin_agent.snapshot_manifest import resolve_and_validate_snapshot


def _active_paths():
  descriptor = resolve_and_validate_snapshot(get_settings())
  return descriptor.catalog_path, descriptor.chunks_path, descriptor


def test_mvp_preprocessing_outputs_are_purchasable() -> None:
  catalog_path, chunk_path, descriptor = _active_paths()
  catalog = read_jsonl(catalog_path)
  chunks = read_jsonl(chunk_path)

  # 카탈로그 행수는 활성 manifest의 catalogCount와 자기정합해야 한다 — 스냅샷 승격(C급
  # baseline 재승인)마다 절대 수치를 고쳐 쓰지 않는다. 최초 6카테고리 시드(618) 미만으로
  # 줄어드는 퇴행만 절대 하한으로 잡는다.
  assert len(catalog) == descriptor.catalog_count
  assert len(catalog) >= 618
  assert len(chunks) >= len(catalog)
  assert {item["category"] for item in catalog} == {"lip", "cheek", "shadow", "base", "brow", "liner"}

  for item in catalog:
    live_offer = item["liveOffer"]
    assert live_offer["priceKrw"] > 0
    assert live_offer["imageUrl"]
    assert live_offer["purchaseUrl"]


def test_title_residual_keywords_remain_soft_only() -> None:
  catalog_path, _chunk_path, _descriptor = _active_paths()
  catalog = read_jsonl(catalog_path)
  inferred_items = [item for item in catalog if item.get("residualTitleKeywords")]

  assert inferred_items
  for item in inferred_items[:20]:
    for keyword in item["residualTitleKeywords"]:
      assert keyword["sourceType"] == "title_residual_rule_inferred"
      assert keyword["hardFilterEligible"] is False
