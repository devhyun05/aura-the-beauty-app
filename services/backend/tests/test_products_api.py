from uuid import UUID, uuid4

import pytest

from app.api.products import _resolve_product_id_for_like


class ProductLikeDatabase:
  def __init__(self) -> None:
    self.product_id = uuid4()
    self.upsert_args = None

  async def fetchrow(self, _query: str, *args):
    self.upsert_args = args

    return {"id": self.product_id}


@pytest.mark.asyncio
async def test_external_product_like_upserts_naver_payload() -> None:
  db = ProductLikeDatabase()
  product_id = await _resolve_product_id_for_like(
    db,
    "naver-10529189729",
    {
      "brandName": "삐아",
      "category": "lip",
      "id": "naver-10529189729",
      "imageUrl": "https://shopping-phinf.pstatic.net/product.jpg",
      "matchRate": 94,
      "palette": ["#C95E68"],
      "price": 12000,
      "productInfo": {"productNumber": "10529189729"},
      "productName": "매트 립틴트",
      "purchaseUrl": "https://smartstore.naver.com/example/products/10529189729",
      "reason": "코랄 베이지 조건과 맞아요.",
      "tags": ["코랄", "매트"],
    },
  )

  assert isinstance(product_id, UUID)
  assert product_id == db.product_id
  assert db.upsert_args is not None
  assert db.upsert_args[0] == "naver-10529189729"
  assert db.upsert_args[1] == "삐아"
  assert db.upsert_args[2] == "매트 립틴트"
  assert db.upsert_args[4] == "lip"
  assert db.upsert_args[5] == 12000
