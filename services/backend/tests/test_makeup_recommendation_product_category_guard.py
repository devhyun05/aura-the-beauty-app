from app.services import makeup_recommendation_products as product_service


def _catalog_product(product_id: str, category: str) -> dict:
  return {
    "id": product_id,
    "category": category,
    "brandName": "Verified Brand",
    "productName": product_id,
    "imageUrl": f"https://cdn.example.com/{product_id}.png",
    "purchaseUrl": f"https://shop.example.com/{product_id}",
  }


def test_makeup_product_mapping_rejects_a_different_catalog_category() -> None:
  mapped = product_service._map_product(
    _catalog_product("eye-shadow", "shadow"),
    "base",
    "base",
    {},
  )

  assert mapped is None


def test_makeup_product_selection_filters_category_before_applying_limit() -> None:
  mapped = product_service._map_products(
    [
      _catalog_product("wrong-eye-shadow", "shadow"),
      _catalog_product("correct-base-cushion", "base"),
      _catalog_product("second-base-foundation", "base"),
    ],
    "base",
    "base",
    {},
  )

  assert [product["id"] for product in mapped] == ["correct-base-cushion"]
  assert mapped[0]["area"] == "base"
