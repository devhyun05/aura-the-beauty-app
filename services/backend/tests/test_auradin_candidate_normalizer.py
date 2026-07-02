from app.services.auradin_catalog.brand_aliases import normalize_brand
from app.services.auradin_catalog.candidate_normalizer import normalize_naver_item


def test_normalize_brand_handles_aliases() -> None:
  assert normalize_brand("rom&nd") == "롬앤"
  assert normalize_brand("Jung Saem Mool Essential Skin Nuder") == "정샘물 뷰티"
  assert normalize_brand("unlisted brand") is None


def test_normalize_naver_item_accepts_whitelisted_cosmetic() -> None:
  candidate, reason = normalize_naver_item(
    {
      "title": "<b>롬앤</b> 글래스팅 워터 틴트",
      "link": "https://search.shopping.naver.com/catalog/100",
      "image": "https://shopping-phinf.pstatic.net/main_100/100.jpg",
      "productId": "100",
      "lprice": "9900",
      "brand": "rom&nd",
      "maker": "",
      "mallName": "공식스토어",
      "category1": "화장품/미용",
      "category2": "색조메이크업",
      "category3": "립틴트",
      "category4": "",
    },
    collected_at="2026-07-02T00:00:00+09:00",
    query="롬앤 립틴트",
    query_rank=1,
    requested_category="lip",
  )

  assert reason is None
  assert candidate is not None
  assert candidate["id"] == "naver-100"
  assert candidate["brandNormalized"] == "롬앤"
  assert candidate["category"] == "lip"
  assert candidate["title"] == "롬앤 글래스팅 워터 틴트"


def test_normalize_naver_item_rejects_non_cosmetic_noise() -> None:
  candidate, reason = normalize_naver_item(
    {
      "title": "롬앤 로고 티셔츠",
      "link": "https://example.com/fashion",
      "image": "https://example.com/fashion.jpg",
      "productId": "200",
      "lprice": "19900",
      "brand": "롬앤",
      "maker": "",
      "mallName": "패션몰",
      "category1": "패션의류",
      "category2": "여성의류",
      "category3": "티셔츠",
      "category4": "",
    },
    collected_at="2026-07-02T00:00:00+09:00",
    query="롬앤 립틴트",
    query_rank=2,
    requested_category="lip",
  )

  assert candidate is None
  assert reason == "non_cosmetic_noise"
