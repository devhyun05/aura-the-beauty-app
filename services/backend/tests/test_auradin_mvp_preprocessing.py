from app.services.auradin_agent.catalog_loader import MVP_CATALOG_PATH, MVP_CHUNK_PATH, read_jsonl


def test_mvp_preprocessing_outputs_are_purchasable() -> None:
  catalog = read_jsonl(MVP_CATALOG_PATH)
  chunks = read_jsonl(MVP_CHUNK_PATH)

  # 337 unique lip/cheek/shadow products in the refined 20260706 seed (was 501
  # before variant dedup collapsed 1+1 / mall duplicates of the same product).
  assert len(catalog) == 337
  assert len(chunks) >= len(catalog)
  assert {item["category"] for item in catalog} == {"lip", "cheek", "shadow"}

  for item in catalog:
    live_offer = item["liveOffer"]
    assert live_offer["priceKrw"] > 0
    assert live_offer["imageUrl"]
    assert live_offer["purchaseUrl"]


def test_title_residual_keywords_remain_soft_only() -> None:
  catalog = read_jsonl(MVP_CATALOG_PATH)
  inferred_items = [item for item in catalog if item.get("residualTitleKeywords")]

  assert inferred_items
  for item in inferred_items[:20]:
    for keyword in item["residualTitleKeywords"]:
      assert keyword["sourceType"] == "title_residual_rule_inferred"
      assert keyword["hardFilterEligible"] is False
