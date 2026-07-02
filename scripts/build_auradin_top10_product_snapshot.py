from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]


BRAND_COUNTRY = {
  "3CE": "Korea",
  "VDL": "Korea",
  "네이밍": "Korea",
  "더샘": "Korea",
  "데이지크": "Korea",
  "라카": "Korea",
  "롬앤": "Korea",
  "뮤드": "Korea",
  "에뛰드": "Korea",
  "에스쁘아": "Korea",
  "웨이크메이크": "Korea",
  "정샘물 뷰티": "Korea",
  "컬러그램": "Korea",
  "클리오": "Korea",
  "투쿨포스쿨": "Korea",
  "페리페라": "Korea",
  "하트퍼센트": "Korea",
}

DEPARTMENT_DOMAIN_MARKERS = (
  "department.ssg.com",
  "hi.thehyundai.com",
  "shinsegae",
  "lotteimall",
  "hmall",
)


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []

  if not path.exists():
    return rows

  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    stripped = line.strip()

    if not stripped:
      continue

    row = json.loads(stripped)

    if not isinstance(row, dict):
      raise ValueError(f"Expected JSON object at {path}:{line_number}")

    rows.append(row)

  return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _domain(url: str) -> str:
  return urlparse(url).netloc


def _primary_url(row: dict[str, Any]) -> str:
  urls = row.get("sourceUrls")

  if isinstance(urls, list) and urls:
    return str(urls[0])

  return ""


def _retail_presence(
  *,
  detail_row: dict[str, Any] | None,
  domain: str,
  mall_name: str,
  source_url: str,
) -> dict[str, Any]:
  if detail_row and isinstance(detail_row.get("retailPresence"), dict):
    return detail_row["retailPresence"]

  is_oliveyoung = "oliveyoung" in domain or mall_name == "올리브영"
  is_department_related = any(marker in domain for marker in DEPARTMENT_DOMAIN_MARKERS)

  return {
    "departmentStore": {
      "evidence": domain if is_department_related else None,
      "retailers": ["department_store_related_mall"] if is_department_related else [],
      "sourceUrl": source_url if is_department_related else None,
      "status": "listed" if is_department_related else "unknown",
    },
    "oliveYoung": {
      "evidence": "oliveyoung domain or mallName" if is_oliveyoung else None,
      "sourceUrl": source_url if is_oliveyoung else None,
      "status": "listed" if is_oliveyoung else "unknown",
    },
  }


def _detail_completeness(phase_status: str, detail_status: str) -> str:
  if phase_status == "blocked":
    return "blocked_detail_fetch"

  if detail_status == "collected_complete":
    return "complete_detail"

  if detail_status == "collected_partial":
    return "partial_detail"

  if detail_status == "failed":
    return "failed_detail_fetch"

  return "metadata_only"


def _snapshot_rows(
  queue_rows: list[dict[str, Any]],
  enriched_rows: list[dict[str, Any]],
  detail_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
  enriched_by_id = {str(row.get("candidateId")): row for row in enriched_rows}
  detail_by_id = {str(row.get("candidateId")): row for row in detail_rows}
  snapshot: list[dict[str, Any]] = []

  for row in queue_rows:
    candidate_id = str(row.get("candidateId") or "")
    source_url = _primary_url(row)
    domain = _domain(source_url)
    live_offer = row.get("liveOffer") if isinstance(row.get("liveOffer"), dict) else {}
    enriched = enriched_by_id.get(candidate_id, {})
    detail = detail_by_id.get(candidate_id)
    product = detail.get("product") if isinstance(detail, dict) else {}
    product = product if isinstance(product, dict) else {}
    retail_presence = _retail_presence(
      detail_row=detail,
      domain=domain,
      mall_name=str(live_offer.get("mallName") or ""),
      source_url=source_url,
    )
    brand = str(row.get("brand") or product.get("brand") or "")
    category = str(row.get("category") or product.get("category") or "")
    phase_status = str(enriched.get("phaseCStatus") or "not_staged")
    detail_status = str((detail or {}).get("collectionStatus") or "not_attempted")
    shade_options = (detail or {}).get("shadeOptions") if isinstance(detail, dict) else []
    shade_options = shade_options if isinstance(shade_options, list) else []
    coverage_target = row.get("coverageTarget") if isinstance(row.get("coverageTarget"), dict) else {}

    snapshot.append(
      {
        "brand": brand,
        "brandCountry": ((detail or {}).get("brandOrigin") or {}).get("brandCountry") or BRAND_COUNTRY.get(brand),
        "candidateId": candidate_id,
        "category": category,
        "colorFamily": (product or {}).get("colorFamily") or (detail or {}).get("colorFamily"),
        "dataCompleteness": _detail_completeness(phase_status, detail_status),
        "departmentStoreStatus": ((retail_presence.get("departmentStore") or {}).get("status")),
        "detailBlockedReason": enriched.get("blockedReason") or "",
        "detailCollectionStatus": detail_status,
        "detailFailureReason": (detail or {}).get("failureReason") or "",
        "domain": domain,
        "evidenceCount": len((detail or {}).get("evidence") or []),
        "fetchStatus": (detail or {}).get("fetchStatus") or "",
        "finish": product.get("finish"),
        "imageUrl": product.get("imageUrl") or live_offer.get("image"),
        "mallName": live_offer.get("mallName"),
        "oliveYoungStatus": ((retail_presence.get("oliveYoung") or {}).get("status")),
        "phaseCStatus": phase_status,
        "popularityScore": row.get("popularityScore"),
        "price": product.get("price") or live_offer.get("lprice"),
        "productName": product.get("productName") or row.get("productName"),
        "rankInBrandCategory": coverage_target.get("rankInGroup"),
        "retailPresence": retail_presence,
        "sellingPoints": product.get("sellingPoints") or [],
        "shadeOptionCount": len(shade_options),
        "shadeOptions": shade_options,
        "sourceUrl": source_url,
        "suitableFor": product.get("suitableFor") or [],
        "texture": product.get("textureType"),
      },
    )

  return snapshot


def _doc_text(parts: list[str]) -> str:
  return ". ".join(part for part in parts if part)


def _knowledge_documents(snapshot_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
  docs: list[dict[str, Any]] = []

  for row in snapshot_rows:
    metadata = {
      "brand": row.get("brand"),
      "brandCountry": row.get("brandCountry"),
      "category": row.get("category"),
      "dataCompleteness": row.get("dataCompleteness"),
      "departmentStoreStatus": row.get("departmentStoreStatus"),
      "detailCollectionStatus": row.get("detailCollectionStatus"),
      "finish": row.get("finish"),
      "oliveYoungStatus": row.get("oliveYoungStatus"),
      "productName": row.get("productName"),
      "rankInBrandCategory": row.get("rankInBrandCategory"),
      "sellingPoints": row.get("sellingPoints") or [],
      "shadeOptionCount": row.get("shadeOptionCount"),
      "sourceUrl": row.get("sourceUrl"),
      "suitableFor": row.get("suitableFor") or [],
      "texture": row.get("texture"),
    }
    core_text = _doc_text(
      [
        f"{row.get('brand')} {row.get('productName')}",
        f"카테고리 {row.get('category')}",
        f"브랜드/카테고리 랭크 {row.get('rankInBrandCategory')}",
        f"가격 {row.get('price')}" if row.get("price") else "",
        f"판매처 {row.get('mallName')}" if row.get("mallName") else "",
        f"브랜드 국적 {row.get('brandCountry')}" if row.get("brandCountry") else "",
        f"올리브영 입점 {row.get('oliveYoungStatus')}",
        f"백화점 입점 {row.get('departmentStoreStatus')}",
      ],
    )
    docs.append(
      {
        "candidateId": row.get("candidateId"),
        "chunkId": f"{row.get('candidateId')}:top10_core",
        "docType": "top10_core",
        "metadata": metadata,
        "text": core_text[:1200],
      },
    )
    detail_text = _doc_text(
      [
        f"마감 {row.get('finish')}" if row.get("finish") else "",
        f"제형 {row.get('texture')}" if row.get("texture") else "",
        "소구점 " + ", ".join(row.get("sellingPoints") or []) if row.get("sellingPoints") else "",
        "어울리는 대상 " + ", ".join(row.get("suitableFor") or []) if row.get("suitableFor") else "",
        f"호수 옵션 {row.get('shadeOptionCount')}개" if row.get("shadeOptionCount") else "",
      ],
    )

    if detail_text:
      docs.append(
        {
          "candidateId": row.get("candidateId"),
          "chunkId": f"{row.get('candidateId')}:top10_detail",
          "docType": "top10_detail",
          "metadata": metadata,
          "text": detail_text[:1200],
        },
      )

  return docs


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = [
    "brand",
    "category",
    "rankInBrandCategory",
    "productName",
    "dataCompleteness",
    "phaseCStatus",
    "detailCollectionStatus",
    "fetchStatus",
    "detailBlockedReason",
    "detailFailureReason",
    "finish",
    "texture",
    "shadeOptionCount",
    "sellingPoints",
    "suitableFor",
    "oliveYoungStatus",
    "departmentStoreStatus",
    "brandCountry",
    "mallName",
    "price",
    "sourceUrl",
  ]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()

    for row in rows:
      writer.writerow(
        {
          **{field: row.get(field) for field in fieldnames},
          "sellingPoints": " | ".join(row.get("sellingPoints") or []),
          "suitableFor": " | ".join(row.get("suitableFor") or []),
        },
      )


def _write_report(
  path: Path,
  *,
  queue_path: Path,
  enriched_path: Path,
  detail_path: Path,
  snapshot_path: Path,
  csv_path: Path,
  docs_path: Path,
  snapshot_rows: list[dict[str, Any]],
  docs: list[dict[str, Any]],
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  status_counts = Counter(str(row.get("dataCompleteness")) for row in snapshot_rows)
  phase_counts = Counter(str(row.get("phaseCStatus")) for row in snapshot_rows)
  detail_counts = Counter(str(row.get("detailCollectionStatus")) for row in snapshot_rows)
  category_counts = Counter(str(row.get("category")) for row in snapshot_rows)
  brand_counts = Counter(str(row.get("brand")) for row in snapshot_rows)
  lines = [
    "# Auradin Brand x Category Top10 Product Snapshot",
    "",
    f"- Queue input: `{queue_path}`",
    f"- Phase C input: `{enriched_path}`",
    f"- Phase D input: `{detail_path}`",
    f"- Snapshot JSONL: `{snapshot_path}`",
    f"- Snapshot CSV: `{csv_path}`",
    f"- Embedding docs: `{docs_path}`",
    f"- Snapshot rows: {len(snapshot_rows)}",
    f"- Embedding docs: {len(docs)}",
    f"- Data completeness: `{json.dumps(dict(sorted(status_counts.items())), ensure_ascii=False)}`",
    f"- Phase C status: `{json.dumps(dict(sorted(phase_counts.items())), ensure_ascii=False)}`",
    f"- Detail collection status: `{json.dumps(dict(sorted(detail_counts.items())), ensure_ascii=False)}`",
    f"- Category counts: `{json.dumps(dict(sorted(category_counts.items())), ensure_ascii=False)}`",
    f"- Brand counts min/max: {min(brand_counts.values()) if brand_counts else 0}/{max(brand_counts.values()) if brand_counts else 0}",
    f"- With finish: {sum(1 for row in snapshot_rows if row.get('finish'))}",
    f"- With texture: {sum(1 for row in snapshot_rows if row.get('texture'))}",
    f"- With shade options: {sum(1 for row in snapshot_rows if row.get('shadeOptionCount'))}",
    f"- With selling points: {sum(1 for row in snapshot_rows if row.get('sellingPoints'))}",
    f"- With suitable-for tags: {sum(1 for row in snapshot_rows if row.get('suitableFor'))}",
    f"- Olive Young listed: {sum(1 for row in snapshot_rows if row.get('oliveYoungStatus') == 'listed')}",
    f"- Department-store-related listed: {sum(1 for row in snapshot_rows if row.get('departmentStoreStatus') == 'listed')}",
    "",
    "Notes:",
    "",
    "- Top10 coverage is complete for every configured brand x category slot.",
    "- Detail fields are filled only when source pages exposed them during permitted collection.",
    "- Blocked or failed detail rows remain in the snapshot with metadata and empty detail fields.",
  ]
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Build a 1,020-row top10 product snapshot by merging queue, Phase C, and Phase D outputs.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument("--queue", type=Path)
  parser.add_argument("--enriched", type=Path)
  parser.add_argument("--detail", type=Path)
  parser.add_argument("--output", type=Path)
  parser.add_argument("--csv-output", type=Path)
  parser.add_argument("--docs-output", type=Path)
  parser.add_argument("--report", type=Path)

  return parser.parse_args()


def main() -> int:
  args = parse_args()
  queue_path = (
    args.queue
    or REPO_ROOT / "data" / "auradin" / "processed" / f"enrichment_queue_brand_category_top10_{args.date}.jsonl"
  )
  enriched_path = (
    args.enriched
    or REPO_ROOT / "data" / "auradin" / "enriched" / f"enriched_products_brand_category_top10_{args.date}.jsonl"
  )
  detail_path = (
    args.detail
    or REPO_ROOT / "data" / "auradin" / "detail" / "normalized" / f"detail_collection_results_{args.date}_brand_category_top10.jsonl"
  )
  snapshot_path = (
    args.output
    or REPO_ROOT / "data" / "auradin" / "catalog" / f"brand_category_top10_products_{args.date}.jsonl"
  )
  csv_path = (
    args.csv_output
    or REPO_ROOT / "data" / "auradin" / "catalog" / f"brand_category_top10_products_{args.date}.csv"
  )
  docs_path = (
    args.docs_output
    or REPO_ROOT / "data" / "auradin" / "embeddings" / f"brand_category_top10_product_documents_{args.date}.jsonl"
  )
  report_path = (
    args.report
    or REPO_ROOT / "reports" / "auradin" / f"brand_category_top10_product_snapshot_{args.date}.md"
  )
  queue_rows = _read_jsonl(queue_path)
  enriched_rows = _read_jsonl(enriched_path)
  detail_rows = _read_jsonl(detail_path)
  snapshot_rows = _snapshot_rows(queue_rows, enriched_rows, detail_rows)
  docs = _knowledge_documents(snapshot_rows)

  _write_jsonl(snapshot_path, snapshot_rows)
  _write_csv(csv_path, snapshot_rows)
  _write_jsonl(docs_path, docs)
  _write_report(
    report_path,
    queue_path=queue_path,
    enriched_path=enriched_path,
    detail_path=detail_path,
    snapshot_path=snapshot_path,
    csv_path=csv_path,
    docs_path=docs_path,
    snapshot_rows=snapshot_rows,
    docs=docs,
  )
  print(
    json.dumps(
      {
        "docs": len(docs),
        "report": str(report_path.relative_to(REPO_ROOT)),
        "rows": len(snapshot_rows),
        "snapshot": str(snapshot_path.relative_to(REPO_ROOT)),
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ),
  )

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
