from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.knowledge_chunk_builder import build_mvp_catalog  # noqa: E402
from app.services.auradin_agent.quality_policy import is_quality_cut  # noqa: E402
from app.services.auradin_agent.ranking import normalized_product_key  # noqa: E402
from app.services.auradin_agent.snapshot_manifest import a8_quality_summary  # noqa: E402
from app.services.auradin_agent.title_keyword_extractor import normalize_product_name  # noqa: E402
from app.services.auradin_catalog.metadata_extractor import (  # noqa: E402
  infer_brand_clean_undertone_evidence,
  infer_title_metadata,
)


INFERRED_FIELDS = ("colorFamily", "undertone", "intensity", "finish", "texture")
SPOTCHECK_FIELDS = (
  "catalogItemId",
  "brand",
  "rawTitle",
  "extracted_texture",
  "extracted_finish",
  "extracted_colorFamily",
  "extracted_undertone",
  "priceKrw",
  "purchaseUrl",
  "verdict",
  "correctedField",
  "correctedValue",
  "checkedBy",
)


class SupplementBuildError(ValueError):
  pass


@dataclass(frozen=True)
class SupplementValidation:
  base_post_cut: int
  combined_catalog_count: int
  a8_summary: dict[str, Any]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    if not line.strip():
      continue
    try:
      row = json.loads(line)
    except json.JSONDecodeError as exc:
      raise SupplementBuildError(f"invalid JSONL at {path}:{line_number}") from exc
    if not isinstance(row, dict):
      raise SupplementBuildError(f"JSONL row must be an object at {path}:{line_number}")
    rows.append(row)
  return rows


def _positive_int(value: Any) -> int:
  try:
    parsed = int(str(value or "0").replace(",", ""))
  except ValueError:
    return 0
  return parsed if parsed > 0 else 0


def _candidate_key(candidate: dict[str, Any]) -> str:
  return normalized_product_key(
    {
      "brandName": candidate.get("brandNormalized") or candidate.get("brandName"),
      "productName": candidate.get("title") or candidate.get("productName"),
    },
  )


def _stable_catalog_id(brand: str, product_name: str) -> str:
  normalized_name = normalize_product_name(product_name, brand)
  digest = hashlib.sha1(f"{brand}|{normalized_name}".encode()).hexdigest()[:16]
  return f"auradin-seed-{digest}"


def candidate_to_seed(
  candidate: dict[str, Any],
  *,
  run_date: str,
  category: str = "base",
) -> dict[str, Any] | None:
  if str(candidate.get("category") or "").strip() != category:
    return None

  brand = str(candidate.get("brandNormalized") or candidate.get("brandName") or "").strip()
  product_name = str(candidate.get("title") or candidate.get("productName") or "").strip()
  raw_title = str(candidate.get("rawTitle") or product_name).strip()
  purchase_url = str(candidate.get("link") or candidate.get("purchaseUrl") or "").strip()
  image_url = str(
    candidate.get("imageUrl") or candidate.get("image") or "",
  ).strip()
  price_krw = _positive_int(candidate.get("lprice") or candidate.get("priceKrw"))
  if not brand or not product_name or not purchase_url or not image_url or price_krw <= 0:
    return None

  metadata, evidence, confidence = infer_title_metadata(
    title=raw_title,
    category=category,
    source_url=purchase_url,
    brand=brand,
  )
  attributes = {
    field: metadata[field]
    for field in INFERRED_FIELDS
    if metadata.get(field) not in {None, ""}
  }
  # A8 사전 정합: cool undertone은 브랜드-클린 근거(콜라보 축약·호수명 '쿨' 등 브랜드 부분열 배제)가
  # 있을 때만 유지 — a8_quality_summary와 동일 술어를 추출 시점에 적용해 게이트 late-fail을 막는다.
  if str(attributes.get("undertone") or "") == "cool":
    brand_clean_support = infer_brand_clean_undertone_evidence(
      title=raw_title, category=category, brand=brand,
    )
    if not any(
      support.get("field") == "undertone" and support.get("value") == "cool"
      for support in brand_clean_support
    ):
      attributes.pop("undertone", None)
      evidence = [
        item for item in evidence
        if not (item.get("field") == "undertone" and item.get("value") == "cool")
      ]
  field_confidence = {
    field: float(confidence[field])
    for field in attributes
    if field in confidence
  }
  shade_options = (
    [{"shadeName": metadata["shadeName"], "shadeSource": "title_inferred"}]
    if metadata.get("shadeName")
    else []
  )
  return {
    "catalogItemId": _stable_catalog_id(brand, product_name),
    "sourceCandidateId": str(candidate.get("id") or candidate.get("naverProductId") or "").strip(),
    "sourceGrain": f"naver_{category}_supplement_candidate",
    "brandName": brand,
    "productName": product_name,
    "rawTitle": raw_title,
    "category": category,
    "shadeOptions": shade_options,
    "attributes": attributes,
    "attributeConfidence": field_confidence,
    "hardFilterEligible": {field: False for field in attributes},
    "evidence": evidence,
    "retailPresence": {},
    "liveOffer": {
      "priceKrw": price_krw,
      "purchaseUrl": purchase_url,
      "imageUrl": image_url,
    },
    "collectionStatus": "partial",
    "schema": f"ProductCatalogItemSeed.{category}Supplement.v1",
    "updatedAt": f"{run_date[:4]}-{run_date[4:6]}-{run_date[6:8]}T00:00:00+09:00",
  }


def build_supplement_rows(
  candidates: list[dict[str, Any]],
  existing_seed: list[dict[str, Any]],
  *,
  run_date: str,
  category: str = "base",
) -> list[dict[str, Any]]:
  existing_ids = {
    str(row.get("catalogItemId") or "").strip()
    for row in existing_seed
    if str(row.get("catalogItemId") or "").strip()
  }
  existing_keys = {
    key for row in existing_seed if (key := normalized_product_key(row))
  }
  seen_ids: set[str] = set()
  seen_keys: set[str] = set()
  supplement: list[dict[str, Any]] = []
  for candidate in candidates:
    key = _candidate_key(candidate)
    if not key or key in existing_keys or key in seen_keys:
      continue
    seed = candidate_to_seed(candidate, run_date=run_date, category=category)
    if seed is None:
      continue
    item_id = str(seed["catalogItemId"])
    if item_id in existing_ids or item_id in seen_ids:
      continue
    supplement.append(seed)
    seen_ids.add(item_id)
    seen_keys.add(key)
  return supplement


def select_brand_stratified_spotcheck(
  rows: list[dict[str, Any]],
  *,
  size: int,
) -> list[dict[str, Any]]:
  if size <= 0:
    return []
  grouped: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
  for row in rows:
    grouped.setdefault(str(row.get("brandName") or ""), []).append(row)

  selected: list[dict[str, Any]] = []
  offset = 0
  while len(selected) < min(size, len(rows)):
    added = False
    for brand_rows in grouped.values():
      if offset < len(brand_rows):
        selected.append(brand_rows[offset])
        added = True
        if len(selected) >= min(size, len(rows)):
          break
    if not added:
      break
    offset += 1
  return selected


def write_spotcheck(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=SPOTCHECK_FIELDS)
    writer.writeheader()
    for row in rows:
      attributes = row.get("attributes") if isinstance(row.get("attributes"), dict) else {}
      live_offer = row.get("liveOffer") if isinstance(row.get("liveOffer"), dict) else {}
      writer.writerow(
        {
          "catalogItemId": row.get("catalogItemId"),
          "brand": row.get("brandName"),
          "rawTitle": row.get("rawTitle"),
          "extracted_texture": attributes.get("texture"),
          "extracted_finish": attributes.get("finish"),
          "extracted_colorFamily": attributes.get("colorFamily"),
          "extracted_undertone": attributes.get("undertone"),
          "priceKrw": live_offer.get("priceKrw"),
          "purchaseUrl": live_offer.get("purchaseUrl"),
          "verdict": "",
          "correctedField": "",
          "correctedValue": "",
          "checkedBy": "",
        },
      )


def read_spotcheck_decisions(path: Path, *, expected_ids: set[str]) -> list[dict[str, str]]:
  with path.open(encoding="utf-8", newline="") as file:
    reader = csv.DictReader(file)
    if tuple(reader.fieldnames or ()) != SPOTCHECK_FIELDS:
      raise SupplementBuildError("spotcheck CSV header does not match the review contract")
    decisions = [dict(row) for row in reader]

  decision_ids = {str(row.get("catalogItemId") or "").strip() for row in decisions}
  if decision_ids != expected_ids or len(decisions) != len(expected_ids):
    raise SupplementBuildError("spotcheck CSV must contain exactly the generated review sample")
  for row in decisions:
    verdict = str(row.get("verdict") or "").strip().lower()
    if verdict not in {"pass", "fix", "drop"}:
      raise SupplementBuildError("every spotcheck row requires verdict pass, fix, or drop")
    if not str(row.get("checkedBy") or "").strip():
      raise SupplementBuildError("every spotcheck row requires checkedBy")
    if verdict == "fix":
      field = str(row.get("correctedField") or "").strip().removeprefix("attributes.")
      value = str(row.get("correctedValue") or "").strip()
      if field not in INFERRED_FIELDS or not value:
        raise SupplementBuildError("fix verdict requires an inferred correctedField and correctedValue")
  return decisions


def apply_spotcheck(
  rows: list[dict[str, Any]],
  decisions: list[dict[str, str]],
) -> list[dict[str, Any]]:
  by_id = {str(row.get("catalogItemId") or ""): row for row in rows}
  dropped: set[str] = set()
  for decision in decisions:
    item_id = str(decision["catalogItemId"]).strip()
    if item_id not in by_id:
      raise SupplementBuildError(f"spotcheck references unknown catalogItemId: {item_id}")
    verdict = str(decision["verdict"]).strip().lower()
    if verdict == "drop":
      dropped.add(item_id)
      continue
    if verdict != "fix":
      continue
    field = str(decision["correctedField"]).strip().removeprefix("attributes.")
    value = str(decision["correctedValue"]).strip()
    row = by_id[item_id]
    attributes = dict(row.get("attributes") or {})
    confidence = dict(row.get("attributeConfidence") or {})
    hard_filter_eligible = dict(row.get("hardFilterEligible") or {})
    attributes[field] = value
    confidence[field] = 1.0
    hard_filter_eligible[field] = False
    row["attributes"] = attributes
    row["attributeConfidence"] = confidence
    row["hardFilterEligible"] = hard_filter_eligible
  return [row for row in rows if str(row.get("catalogItemId") or "") not in dropped]


def validate_supplement(
  existing_seed: list[dict[str, Any]],
  supplement_rows: list[dict[str, Any]],
  *,
  target_post_cut: int,
  category: str = "base",
) -> SupplementValidation:
  combined_catalog = build_mvp_catalog([*existing_seed, *supplement_rows])
  summary = a8_quality_summary(combined_catalog)
  if int(summary.get("invalidCoolCount") or 0) != 0:
    raise SupplementBuildError("A8 pre-gate failed: invalid cool rows remain")
  missing_controls = [
    name for name, present in (summary.get("positiveControls") or {}).items() if not present
  ]
  if missing_controls:
    raise SupplementBuildError(
      f"A8 pre-gate failed: positive controls missing: {', '.join(missing_controls)}",
    )

  base_post_cut = sum(
    1
    for item in combined_catalog
    if item.get("category") == category and not is_quality_cut(item)
  )
  if base_post_cut < target_post_cut:
    raise SupplementBuildError(
      f"post-cut {category} target not met: {base_post_cut} < {target_post_cut}",
    )
  return SupplementValidation(
    base_post_cut=base_post_cut,
    combined_catalog_count=len(combined_catalog),
    a8_summary=summary,
  )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Build a reviewed Auradin category supplement seed.")
  parser.add_argument("--candidates", type=Path, required=True)
  parser.add_argument("--existing-seed", type=Path, required=True)
  parser.add_argument("--run-date", required=True)
  parser.add_argument(
    "--category",
    default="base",
    help="확장 대상 카테고리 (B4 월1회 확장 트랙 — 기본 base로 기존 동작 유지).",
  )
  parser.add_argument("--spotcheck-size", type=int, default=30)
  parser.add_argument(
    "--target-post-cut",
    type=int,
    default=None,
    help="post-cut 최소 행수 게이트 (기본: base=80, 그 외 카테고리=0).",
  )
  parser.add_argument("--apply-spotcheck", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--spotcheck-output", type=Path)
  return parser.parse_args()


def main() -> int:
  args = parse_args()
  try:
    if len(args.run_date) != 8 or not args.run_date.isdigit():
      raise SupplementBuildError("run-date must be YYYYMMDD")
    category = str(args.category or "").strip()
    if not category:
      raise SupplementBuildError("category must be a non-empty string")
    target_post_cut = args.target_post_cut
    if target_post_cut is None:
      target_post_cut = 80 if category == "base" else 0
    candidates = read_jsonl(args.candidates)
    existing_seed = read_jsonl(args.existing_seed)
    rows = build_supplement_rows(
      candidates,
      existing_seed,
      run_date=args.run_date,
      category=category,
    )
    review_rows = select_brand_stratified_spotcheck(rows, size=args.spotcheck_size)
    review_ids = {str(row["catalogItemId"]) for row in review_rows}
    spotcheck_path = args.spotcheck_output or (
      REPO_ROOT / "data" / "auradin" / "review" / f"{category}_supplement_spotcheck_{args.run_date}.csv"
    )
    if args.apply_spotcheck:
      decisions = read_spotcheck_decisions(args.apply_spotcheck, expected_ids=review_ids)
      rows = apply_spotcheck(rows, decisions)
    else:
      write_spotcheck(spotcheck_path, review_rows)

    validation = validate_supplement(
      existing_seed,
      rows,
      target_post_cut=target_post_cut,
      category=category,
    )
    output_path = args.output or (
      REPO_ROOT / "data" / "auradin" / "catalog" / f"{category}_supplement_seed_{args.run_date}.jsonl"
    )
    write_jsonl(output_path, rows)
    print(
      json.dumps(
        {
          "a8InvalidCoolCount": validation.a8_summary["invalidCoolCount"],
          "category": category,
          "categoryPostCut": validation.base_post_cut,
          "combinedCatalogCount": validation.combined_catalog_count,
          "output": str(output_path),
          "spotcheck": str(args.apply_spotcheck or spotcheck_path),
          "supplementCount": len(rows),
        },
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
      ),
    )
    return 0
  except (OSError, SupplementBuildError) as exc:
    print(f"base supplement failed: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
