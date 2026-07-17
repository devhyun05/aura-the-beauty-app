from app.services.product_trend_regions import (
  KMA_REGION_GRIDS,
  LOCAL_TREND_REGION_CODES,
  NATIONAL_REGION_CODE,
  TREND_REGION_CODES,
  normalize_trend_region_code,
)


def test_region_contract_contains_national_and_all_17_first_level_regions() -> None:
  assert NATIONAL_REGION_CODE == "KR-00"
  assert len(LOCAL_TREND_REGION_CODES) == 17
  assert len(TREND_REGION_CODES) == 18
  assert set(KMA_REGION_GRIDS) == set(LOCAL_TREND_REGION_CODES)
  assert "KR-49" in LOCAL_TREND_REGION_CODES  # 제주
  assert "KR-50" in LOCAL_TREND_REGION_CODES  # 세종


def test_unknown_or_coordinate_like_region_never_reaches_the_backend_contract() -> None:
  assert normalize_trend_region_code("kr-11") == "KR-11"
  assert normalize_trend_region_code("37.5665,126.9780") == "KR-00"
  assert normalize_trend_region_code(None) == "KR-00"
