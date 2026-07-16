from __future__ import annotations

import json
from pathlib import Path

from app.services.auradin_agent.knowledge_chunk_builder import build_mvp_catalog_item
from app.services.auradin_agent.snapshot_manifest import a8_quality_summary
from app.services.auradin_agent.title_keyword_extractor import extract_residual_keywords
from app.services.auradin_catalog.brand_aliases import find_brand_alias_spans
from app.services.auradin_catalog.metadata_extractor import infer_title_metadata


def _undertones(title: str, brand: str) -> list[str]:
  return [
    str(keyword["value"])
    for keyword in extract_residual_keywords(title, title, brand)
    if keyword["field"] == "undertone"
  ]


def _catalog_seed(
  title: str,
  brand: str,
  *,
  undertone: str | None,
  evidence: list[dict] | None = None,
) -> dict:
  return {
    "sourceCandidateId": f"seed-{title}",
    "brandName": brand,
    "productName": title,
    "category": "lip",
    "attributes": {"undertone": undertone},
    "attributeConfidence": {"undertone": 0.5} if undertone else {},
    "hardFilterEligible": {"undertone": False} if undertone else {},
    "evidence": evidence or [],
    "liveOffer": {
      "priceKrw": 18000,
      "purchaseUrl": "https://example.test/buy",
      "imageUrl": "https://example.test/image.jpg",
    },
  }


def test_brand_alias_spans_are_raw_bounded_and_brand_scoped() -> None:
  title = "[정샘물 뷰티] 롬앤 무드 팔레트"
  spans = find_brand_alias_spans(title, "정샘물 뷰티")

  assert spans == [
    {
      "matchedToken": "정샘물 뷰티",
      "start": title.index("정샘물 뷰티"),
      "end": title.index("정샘물 뷰티") + len("정샘물 뷰티"),
    },
  ]
  assert "롬앤" not in {span["matchedToken"] for span in spans}
  assert find_brand_alias_spans("슈퍼롬앤틱 팔레트", "롬앤") == []


def test_brand_name_and_cooling_do_not_infer_cool_undertone() -> None:
  assert _undertones("NEW 투쿨포스쿨 픽싱 커버 핏 쿠션", "투쿨포스쿨") == []
  assert _undertones("투쿨포스쿨 쿨링 픽싱 쿠션", "투쿨포스쿨") == []


def test_legitimate_cool_compound_controls_survive_brand_removal() -> None:
  assert "cool" in _undertones("하트퍼센트 여쿨라 인생템 도트 온 무드 아이팔레트", "하트퍼센트")
  assert "cool" in _undertones("[페리페라] 브이쉐딩 디테일 003 그레이쉬쿨", "페리페라")
  assert "cool" in _undertones("컬러그램 틴토리 솜 블러셔 앙쿨모브 8호", "컬러그램")


def test_rebuild_preserves_all_three_legitimate_cool_controls() -> None:
  cases = (
    ("하트퍼센트 여쿨라 인생템 팔레트", "하트퍼센트"),
    ("페리페라 브이쉐딩 003 그레이쉬쿨", "페리페라"),
    ("컬러그램 틴토리 솜 블러셔 앙쿨모브 8호", "컬러그램"),
  )
  for title, brand in cases:
    rebuilt = build_mvp_catalog_item(_catalog_seed(title, brand, undertone="cool"))

    assert rebuilt is not None
    assert rebuilt["attributes"]["undertone"] == "cool"


def test_live_metadata_extractor_removes_only_current_brand_and_keeps_span_evidence() -> None:
  title = "too cool for school matte fixing cushion"
  metadata, evidence, _confidence = infer_title_metadata(
    title=title,
    category="base",
    source_url="https://example.test/product",
    brand="투쿨포스쿨",
  )

  assert metadata.get("undertone") is None
  assert metadata["finish"] == "matte"
  finish_evidence = next(row for row in evidence if row["field"] == "finish")
  assert finish_evidence["matchedToken"] == "matte"
  assert title[finish_evidence["matchedStart"]:finish_evidence["matchedEnd"]] == "matte"
  assert finish_evidence["removedBrandSpans"][0]["matchedToken"] == "too cool for school"


def test_rebuild_removes_legacy_seed_value_whose_only_evidence_is_brand() -> None:
  seed_path = (
    Path(__file__).resolve().parents[3]
    / "data/auradin/catalog/catalog_items_seed_20260708.jsonl"
  )
  contaminated = next(
    json.loads(line)
    for line in seed_path.read_text(encoding="utf-8").splitlines()
    if "투쿨포스쿨 픽싱 커버 핏 쿠션" in line
  )
  contaminated["attributes"] = {**contaminated["attributes"], "undertone": "cool"}
  contaminated["attributeConfidence"] = {
    **contaminated["attributeConfidence"],
    "undertone": 0.5,
  }
  contaminated["evidence"] = [
    *contaminated["evidence"],
    {
      "field": "undertone",
      "value": "cool",
      "sourceType": "title_residual_rule_inferred",
      "matchedToken": "쿨",
    },
  ]

  rebuilt = build_mvp_catalog_item(contaminated)

  assert rebuilt is not None
  assert rebuilt["attributes"]["undertone"] is None
  assert not [row for row in rebuilt["residualTitleKeywords"] if row["field"] == "undertone"]
  assert any(
    row.get("sourceType") == "brand_alias_sanitization"
    for row in rebuilt["evidence"]
  )


def test_rebuild_preserves_legacy_coral_warm_and_beige_neutral_signals() -> None:
  cases = (
    ("페리페라 코랄 립", "페리페라", "warm", "코랄"),
    ("더샘 클리어 베이지 컨실러", "더샘", "neutral", "베이지"),
  )
  for title, brand, expected, token in cases:
    rebuilt = build_mvp_catalog_item(
      _catalog_seed(
        title,
        brand,
        undertone=expected,
        evidence=[
          {
            "field": "undertone",
            "value": expected,
            "sourceType": "title_rule_inferred",
            "matchedToken": token,
          },
        ],
      ),
    )

    assert rebuilt is not None
    assert rebuilt["attributes"]["undertone"] == expected
    assert not [
      row for row in rebuilt["evidence"] if row.get("sourceType") == "brand_alias_sanitization"
    ]


def test_rebuild_uses_raw_offsets_to_remove_brand_overlapping_cool_evidence() -> None:
  title = "too cool for school fixing cushion"
  start = title.index("cool")
  rebuilt = build_mvp_catalog_item(
    _catalog_seed(
      title,
      "투쿨포스쿨",
      undertone="cool",
      evidence=[
        {
          "field": "undertone",
          "value": "cool",
          "sourceType": "title_rule_inferred",
          "matchedToken": "cool",
          "matchedStart": start,
          "matchedEnd": start + len("cool"),
        },
      ],
    ),
  )

  assert rebuilt is not None
  assert rebuilt["attributes"]["undertone"] is None
  assert any(row.get("sourceType") == "brand_alias_sanitization" for row in rebuilt["evidence"])


def test_rebuild_removes_legacy_cooling_false_positive_and_its_stale_evidence() -> None:
  rebuilt = build_mvp_catalog_item(
    _catalog_seed(
      "에스쁘아 쿨링 쿠션",
      "에스쁘아",
      undertone="cool",
      evidence=[
        {
          "field": "undertone",
          "value": "cool",
          "sourceType": "title_residual_rule_inferred",
          "matchedToken": "쿨",
        },
      ],
    ),
  )

  assert rebuilt is not None
  assert rebuilt["attributes"]["undertone"] is None
  assert not [
    row
    for row in rebuilt["evidence"]
    if row.get("field") == "undertone" and row.get("sourceType") == "title_residual_rule_inferred"
  ]


def test_a8_gate_reads_final_attribute_and_catches_evidence_free_brand_contamination() -> None:
  controls = [
    {
      "id": "control-1",
      "brandName": "하트퍼센트",
      "productName": "하트퍼센트 여쿨라 팔레트",
      "category": "shadow",
      "attributes": {"undertone": "cool"},
    },
    {
      "id": "control-2",
      "brandName": "페리페라",
      "productName": "페리페라 그레이쉬쿨 셰딩",
      "category": "cheek",
      "attributes": {"undertone": "cool"},
    },
    {
      "id": "control-3",
      "brandName": "컬러그램",
      "productName": "컬러그램 앙쿨모브 블러셔",
      "category": "cheek",
      "attributes": {"undertone": "cool"},
    },
  ]
  injected = {
    "id": "bad-brand-only",
    "brandName": "투쿨포스쿨",
    "productName": "투쿨포스쿨 쿠션",
    "category": "base",
    "attributes": {"undertone": "cool"},
    "evidence": [
      {
        "field": "undertone",
        "value": "cool",
        "sourceType": "naver_api",
        "rawLabel": "productName",
        "rawText": "투쿨포스쿨 쿠션",
      },
    ],
  }

  summary = a8_quality_summary([*controls, injected])

  assert summary["positiveControls"] == {
    "여쿨라": True,
    "그레이쉬쿨": True,
    "앙쿨모브": True,
  }
  assert summary["brandOnlyCoolCount"] == 1
  assert summary["brandOnlyCoolIds"] == ["bad-brand-only"]


def test_a8_gate_allows_verified_non_title_cool_evidence() -> None:
  row = {
    "id": "verified-cool",
    "brandName": "투쿨포스쿨",
    "productName": "투쿨포스쿨 쿠션",
    "category": "base",
    "attributes": {"undertone": "cool"},
    "evidence": [
      {
        "field": "undertone",
        "value": "cool",
        "sourceType": "official_product_spec",
      },
    ],
  }

  assert a8_quality_summary([row])["brandOnlyCoolCount"] == 0


def test_a8_gate_rejects_cooling_only_final_cool_value() -> None:
  row = {
    "id": "cooling-false-positive",
    "brandName": "에스쁘아",
    "productName": "에스쁘아 쿨링 쿠션",
    "category": "base",
    "attributes": {"undertone": "cool"},
    "evidence": [
      {
        "field": "undertone",
        "value": "cool",
        "sourceType": "title_residual_rule_inferred",
        "matchedToken": "쿨",
      },
    ],
  }

  summary = a8_quality_summary([row])

  assert summary["brandOnlyCoolCount"] == 0
  assert summary["coolingOnlyCoolCount"] == 1
  assert summary["invalidCoolIds"] == ["cooling-false-positive"]
