import csv
from pathlib import Path

import pytest

import scripts.build_auradin_base_supplement_seed as supplement


def _candidate(
  product_id: str,
  *,
  brand: str = "테스트브랜드",
  title: str = "매트 핑크 쿠션",
) -> dict:
  return {
    "id": product_id,
    "brandNormalized": brand,
    "category": "base",
    "title": title,
    "rawTitle": f"{brand} {title}",
    "lprice": 19000,
    "link": f"https://example.test/{product_id}",
    "imageUrl": f"https://example.test/{product_id}.jpg",
  }


def _seed(item_id: str, *, brand: str, product: str) -> dict:
  return {
    "catalogItemId": item_id,
    "brandName": brand,
    "productName": product,
  }


def test_existing_normalized_key_collision_is_excluded() -> None:
  existing = [_seed("existing", brand="테스트브랜드", product="매트 핑크 쿠션")]

  rows = supplement.build_supplement_rows(
    [_candidate("naver-1")],
    existing,
    run_date="20260718",
  )

  assert rows == []


def test_seed_uses_only_field_specific_title_confidence_and_soft_attributes() -> None:
  row = supplement.candidate_to_seed(_candidate("naver-1"), run_date="20260718")

  assert row is not None
  assert row["attributes"] == {
    "colorFamily": "pink",
    "finish": "matte",
    "texture": "cushion",
  }
  assert set(row["attributeConfidence"]) == set(row["attributes"])
  assert row["hardFilterEligible"] == {
    "colorFamily": False,
    "finish": False,
    "texture": False,
  }
  assert row["liveOffer"] == {
    "priceKrw": 19000,
    "purchaseUrl": "https://example.test/naver-1",
    "imageUrl": "https://example.test/naver-1.jpg",
  }
  assert "priceTier" not in row["liveOffer"]


def test_post_cut_target_is_blocking(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(
    supplement,
    "build_mvp_catalog",
    lambda _rows: [{"id": "one", "category": "base", "qualityFlags": []}],
  )
  monkeypatch.setattr(
    supplement,
    "a8_quality_summary",
    lambda _rows: {
      "invalidCoolCount": 0,
      "positiveControls": {"여쿨라": True, "그레이쉬쿨": True, "앙쿨모브": True},
    },
  )

  with pytest.raises(supplement.SupplementBuildError, match="target not met"):
    supplement.validate_supplement([], [], target_post_cut=2)


def test_blank_spotcheck_verdict_is_blocking(tmp_path: Path) -> None:
  rows = supplement.build_supplement_rows(
    [_candidate("naver-1")],
    [],
    run_date="20260718",
  )
  path = tmp_path / "review.csv"
  supplement.write_spotcheck(path, rows)

  with pytest.raises(supplement.SupplementBuildError, match="requires verdict"):
    supplement.read_spotcheck_decisions(
      path,
      expected_ids={rows[0]["catalogItemId"]},
    )


def test_fix_and_drop_spotcheck_decisions_are_applied(tmp_path: Path) -> None:
  rows = supplement.build_supplement_rows(
    [
      _candidate("naver-1", brand="브랜드A", title="매트 쿠션"),
      _candidate("naver-2", brand="브랜드B", title="글로우 쿠션"),
    ],
    [],
    run_date="20260718",
  )
  path = tmp_path / "review.csv"
  supplement.write_spotcheck(path, rows)
  with path.open(encoding="utf-8", newline="") as file:
    review_rows = list(csv.DictReader(file))
  review_rows[0].update(
    verdict="fix",
    correctedField="finish",
    correctedValue="satin",
    checkedBy="reviewer",
  )
  review_rows[1].update(verdict="drop", checkedBy="reviewer")
  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=supplement.SPOTCHECK_FIELDS)
    writer.writeheader()
    writer.writerows(review_rows)

  decisions = supplement.read_spotcheck_decisions(
    path,
    expected_ids={row["catalogItemId"] for row in rows},
  )
  applied = supplement.apply_spotcheck(rows, decisions)

  assert len(applied) == 1
  assert applied[0]["attributes"]["finish"] == "satin"
  assert applied[0]["attributeConfidence"]["finish"] == 1.0
  assert applied[0]["hardFilterEligible"]["finish"] is False


def test_combined_catalog_a8_pre_gate_rejects_invalid_cool(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  combined = [{"id": "existing-control"}, {"id": "new-row"}]
  monkeypatch.setattr(supplement, "build_mvp_catalog", lambda rows: combined if len(rows) == 2 else [])
  monkeypatch.setattr(
    supplement,
    "a8_quality_summary",
    lambda rows: {
      "invalidCoolCount": 1 if rows is combined else 0,
      "positiveControls": {"여쿨라": True, "그레이쉬쿨": True, "앙쿨모브": True},
    },
  )

  with pytest.raises(supplement.SupplementBuildError, match="A8 pre-gate"):
    supplement.validate_supplement(
      [{"catalogItemId": "existing"}],
      [{"catalogItemId": "new"}],
      target_post_cut=0,
    )


def test_a8_pre_gate_flags_brand_only_cool_new_row(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  # mock 없는 감지 경로: 실제 a8_quality_summary가 브랜드-단독-근거 cool 신규 행을 차단한다
  # ("투쿨포스쿨"은 브랜드 화이트리스트 항목이라 브랜드 스팬 안의 "쿨"만이 cool 근거)
  monkeypatch.setattr(supplement, "build_mvp_catalog", lambda rows: rows)
  bad_row = {
    "id": "new-bad",
    "brandName": "투쿨포스쿨",
    "productName": "투쿨포스쿨 아트클래스 파운데이션",
    "rawTitle": "투쿨포스쿨 아트클래스 파운데이션",
    "category": "base",
    "attributes": {"undertone": "cool"},
    "evidence": [],
  }

  with pytest.raises(supplement.SupplementBuildError, match="invalid cool"):
    supplement.validate_supplement([], [bad_row], target_post_cut=0)
