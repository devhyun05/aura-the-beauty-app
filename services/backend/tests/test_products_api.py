from uuid import UUID, uuid4

import pytest

from app.api.products import _resolve_product_id_for_like, _resolve_product_id_for_unlike


class ProductLikeDatabase:
  def __init__(self) -> None:
    self.product_id = uuid4()
    self.upsert_args = None

  async def fetchrow(self, _query: str, *args):
    self.upsert_args = args

    return {"id": self.product_id}


class ProductLikeRoundtripDatabase:
  """like 업서트(external_key) → unlike 조회 왕복을 흉내내는 최소 fake."""

  def __init__(self) -> None:
    self.products_by_external_key: dict[str, UUID] = {}
    self.upsert_args = None

  async def fetchrow(self, query: str, *args):
    if query.strip().lower().startswith("insert into products"):
      self.upsert_args = args
      external_key = args[0]
      product_id = self.products_by_external_key.setdefault(external_key, uuid4())

      return {"id": product_id}

    external_key = args[0]

    if external_key not in self.products_by_external_key:
      return None

    return {"id": self.products_by_external_key[external_key]}


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


@pytest.mark.asyncio
async def test_auradin_catalog_item_like_unlike_roundtrip() -> None:
  """R1 게이트 1: Auradin catalogItemId(비-UUID)가 external_key 업서트 경로로
  like 되고, 같은 id로 unlike 시 동일 products 행이 해소되는지(왕복) 검증."""
  db = ProductLikeRoundtripDatabase()
  catalog_item_id = "auradin-lip-0007"

  liked_product_id = await _resolve_product_id_for_like(
    db,
    catalog_item_id,
    {
      "brandName": "롬앤",
      "category": "lip",
      "id": catalog_item_id,
      "imageUrl": "https://example.com/tint.jpg",
      "matchRate": 88,
      "palette": ["#B95E76"],
      "price": 9900,
      "productName": "쥬시 래스팅 틴트",
      "purchaseUrl": "https://example.com/buy/auradin-lip-0007",
      "reason": "쿨톤 보고서 조건과 맞아요.",
      "tags": ["쿨톤", "매트"],
    },
  )

  assert isinstance(liked_product_id, UUID)
  assert db.upsert_args is not None
  assert db.upsert_args[0] == catalog_item_id  # external_key = catalogItemId
  assert db.upsert_args[2] == "쥬시 래스팅 틴트"
  assert db.upsert_args[4] == "lip"
  assert db.upsert_args[5] == 9900

  # unlike: 같은 catalogItemId로 external_key 조회 → like가 만든 행과 동일해야 한다
  unliked_product_id = await _resolve_product_id_for_unlike(db, catalog_item_id)

  assert unliked_product_id == liked_product_id

  # 존재하지 않는 catalogItemId는 None (unlike는 no-op)
  assert await _resolve_product_id_for_unlike(db, "auradin-unknown-999") is None


@pytest.mark.asyncio
async def test_auradin_like_requires_product_payload() -> None:
  """비-UUID id에 payload 없이 like 하면 400 — 어댑터가 payload를 실어야 하는 계약."""
  from app.core.errors import AppError

  db = ProductLikeRoundtripDatabase()

  with pytest.raises(AppError) as exc_info:
    await _resolve_product_id_for_like(db, "auradin-lip-0007", {})

  assert exc_info.value.status_code == 400
