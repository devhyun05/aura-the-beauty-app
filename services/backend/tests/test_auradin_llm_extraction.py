"""B3 LLM 배치 속성 추출기 게이트 테스트 (§6.4-2).

비협상 게이트: ① evidenceSpan substring 실재 검증, ② field-specific confidence만
(전체 confidence 폴백 금지), ③ allowlist 밖 값 리젝, ④ dry-run 왕복(review 큐 파일).
"""

import json
from pathlib import Path

import scripts.run_auradin_llm_attribute_extraction as extractor


INPUT_TEXT = "롬앤 쥬시 래스팅 틴트 06 핑크 윈터 pink tint glossy"
ALLOWLIST = {
  "colorFamily": ["pink", "red"],
  "finish": ["glossy", "matte"],
  "texture": ["tint"],
  "undertone": ["cool", "neutral", "warm"],
}


def _field(value, confidence, evidence_span):
  return {"value": value, "confidence": confidence, "evidenceSpan": evidence_span}


def test_evidence_span_not_in_input_text_is_rejected() -> None:
  raw = {"colorFamily": _field("pink", 0.9, "존재하지 않는 스팬")}
  gated = extractor.apply_field_gates(raw, input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  assert gated["colorFamily"]["status"] == "rejected"
  assert gated["colorFamily"]["rejectReason"] == extractor.REJECT_EVIDENCE_SPAN


def test_missing_or_paraphrased_evidence_span_is_rejected() -> None:
  raw = {
    "finish": {"value": "glossy", "confidence": 0.8},
    "texture": _field("tint", 0.8, ""),
  }
  gated = extractor.apply_field_gates(raw, input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  assert gated["finish"]["rejectReason"] == extractor.REJECT_EVIDENCE_SPAN
  assert gated["texture"]["rejectReason"] == extractor.REJECT_EVIDENCE_SPAN


def test_field_specific_confidence_required_no_overall_fallback() -> None:
  # top-level(전체) confidence가 있어도 필드 confidence 폴백으로 쓰지 않는다.
  raw = {
    "confidence": 0.99,
    "colorFamily": {"value": "pink", "evidenceSpan": "핑크 윈터 pink"[6:10]},
  }
  raw["colorFamily"]["evidenceSpan"] = "pink"
  gated = extractor.apply_field_gates(raw, input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  assert gated["colorFamily"]["status"] == "rejected"
  assert gated["colorFamily"]["rejectReason"] == extractor.REJECT_MISSING_FIELD_CONFIDENCE


def test_non_numeric_or_out_of_range_confidence_is_rejected() -> None:
  raw = {
    "colorFamily": _field("pink", "high", "pink"),
    "finish": _field("glossy", 1.4, "glossy"),
    "texture": _field("tint", True, "tint"),
  }
  gated = extractor.apply_field_gates(raw, input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  for field in ("colorFamily", "finish", "texture"):
    assert gated[field]["status"] == "rejected"
    assert gated[field]["rejectReason"] == extractor.REJECT_MISSING_FIELD_CONFIDENCE


def test_value_outside_category_allowlist_is_rejected() -> None:
  raw = {"colorFamily": _field("hologram", 0.95, "pink")}
  gated = extractor.apply_field_gates(raw, input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  assert gated["colorFamily"]["status"] == "rejected"
  assert gated["colorFamily"]["rejectReason"] == extractor.REJECT_VALUE_NOT_IN_ALLOWLIST


def test_confidence_threshold_marks_promotion_candidate_only() -> None:
  raw = {
    "colorFamily": _field("pink", 0.69, "pink"),
    "finish": _field("glossy", 0.70, "glossy"),
  }
  gated = extractor.apply_field_gates(raw, input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  assert gated["colorFamily"]["status"] == "accepted"
  assert gated["colorFamily"]["promotionCandidate"] is False
  assert gated["finish"]["status"] == "accepted"
  assert gated["finish"]["promotionCandidate"] is True


def test_filter_by_categories_excludes_base() -> None:
  rows = [
    {"category": "lip", "attributes": {}},
    {"category": "base", "attributes": {}},
    {"category": "cheek", "attributes": {}},
  ]
  filtered = extractor.filter_input_rows(rows, categories={"lip", "cheek", "shadow", "liner", "brow"})
  assert [r["category"] for r in filtered] == ["lip", "cheek"]


def test_filter_only_missing_keeps_rows_without_field() -> None:
  rows = [
    {"category": "lip", "attributes": {"colorFamily": "pink"}},
    {"category": "lip", "attributes": {"colorFamily": None}},
    {"category": "lip", "attributes": {}},
  ]
  filtered = extractor.filter_input_rows(rows, only_missing="colorFamily")
  assert len(filtered) == 2
  assert all(not (r["attributes"].get("colorFamily")) for r in filtered)


def test_filter_categories_and_only_missing_compose() -> None:
  rows = [
    {"category": "lip", "attributes": {}},               # kept
    {"category": "base", "attributes": {}},              # dropped: base
    {"category": "cheek", "attributes": {"colorFamily": "coral"}},  # dropped: has color
  ]
  filtered = extractor.filter_input_rows(
    rows, categories={"lip", "cheek"}, only_missing="colorFamily"
  )
  assert [r["category"] for r in filtered] == ["lip"]


def test_dry_run_round_trip_writes_review_queue_not_seed(tmp_path: Path) -> None:
  input_path = tmp_path / "seed.jsonl"
  vocab_path = tmp_path / "catalog.jsonl"
  output_path = tmp_path / "review_queue.jsonl"
  spotcheck_path = tmp_path / "spotcheck.csv"

  vocab_rows = [
    {
      "category": "lip",
      "attributes": {"colorFamily": "pink", "finish": "glossy", "texture": "tint"},
    },
    {
      "category": "lip",
      "attributes": {"colorFamily": "red", "finish": "matte", "texture": "lipstick"},
    },
  ]
  input_rows = [
    {
      "catalogItemId": "auradin-seed-test0001",
      "brandName": "롬앤",
      "productName": "쥬시 래스팅 틴트",
      "rawTitle": "롬앤 쥬시 래스팅 틴트 glossy pink tint",
      "category": "lip",
      "shadeOptions": [{"shadeName": "06 핑크 윈터"}],
    },
    {
      "catalogItemId": "auradin-seed-test0002",
      "brandName": "무근거",
      "productName": "속성 단서 없는 상품",
      "category": "lip",
    },
  ]
  input_path.write_text(
    "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in input_rows),
    encoding="utf-8",
  )
  vocab_path.write_text(
    "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in vocab_rows),
    encoding="utf-8",
  )

  exit_code = extractor.main(
    [
      "--input", str(input_path),
      "--vocab-source", str(vocab_path),
      "--output", str(output_path),
      "--spotcheck-output", str(spotcheck_path),
      "--date", "20260715",
      "--dry-run",
    ],
  )
  assert exit_code == 0

  results = [
    json.loads(line)
    for line in output_path.read_text(encoding="utf-8").splitlines()
    if line.strip()
  ]
  assert len(results) == 2
  by_id = {row["catalogItemId"]: row for row in results}

  extracted = by_id["auradin-seed-test0001"]["fields"]
  assert extracted["colorFamily"]["status"] == "accepted"
  assert extracted["colorFamily"]["value"] == "pink"
  assert extracted["finish"]["status"] == "accepted"
  assert extracted["texture"]["status"] == "accepted"
  # dry-run confidence 0.75 ≥ 0.70 — 승격 '후보'로만 표시.
  assert extracted["colorFamily"]["promotionCandidate"] is True

  empty = by_id["auradin-seed-test0002"]["fields"]
  assert all(payload["status"] == "empty" for payload in empty.values())

  # review 큐 계약: 시드 직접 병합 금지 마커 + 스팟체크 사람 컬럼 빈 채로 생성.
  assert all(
    row["mergePolicy"] == "review_queue_only__never_direct_seed_merge" for row in results
  )
  spotcheck_lines = spotcheck_path.read_text(encoding="utf-8").splitlines()
  assert spotcheck_lines[0] == ",".join(extractor.SPOTCHECK_COLUMNS)
  assert len(spotcheck_lines) >= 2
  for line in spotcheck_lines[1:]:
    assert line.endswith(",,,")


def test_dry_run_client_returns_real_substring_spans() -> None:
  client = extractor.DryRunAttributeExtractionClient()
  raw = client.extract(category="lip", input_text=INPUT_TEXT, allowlist=ALLOWLIST)
  for field_payload in raw.values():
    if field_payload is None:
      continue
    assert field_payload["evidenceSpan"] in INPUT_TEXT
