from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .domain_preflight import DEFAULT_USER_AGENT, FetchUrl, build_domain_preflight, write_domain_preflight_report
from .metadata_extractor import infer_title_metadata


FORBIDDEN_URL_TERMS = (
  "login",
  "signin",
  "sign-in",
  "cart",
  "basket",
  "order",
  "orders",
  "checkout",
  "mypage",
  "my-page",
  "account",
)

BLOCKED_RAW_FIELDS = {
  "rawhtml",
  "raw_html",
  "rawreview",
  "raw_reviews",
  "originalimage",
  "original_image",
}


@dataclass(frozen=True)
class PhaseCPreflightResult:
  run_date: str
  enriched_path: Path
  review_path: Path
  report_path: Path
  input_queue_count: int
  start_index: int
  staged_count: int
  blocked_count: int
  dry_run: bool
  crawl_started: bool
  domain_preflight_path: Path | None = None
  domain_count: int = 0
  detail_fetch_started: bool = False


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  if not path.exists():
    raise FileNotFoundError(f"Queue file not found: {path}")

  rows: list[dict[str, Any]] = []

  for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
    stripped = line.strip()

    if not stripped:
      continue

    value = json.loads(stripped)

    if not isinstance(value, dict):
      raise ValueError(f"Expected JSON object at {path}:{line_number}")

    rows.append(value)

  return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _write_review_csv(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fieldnames = [
    "priority",
    "candidateId",
    "brand",
    "productName",
    "category",
    "targetFields",
    "sourceUrls",
    "allowedSourceHints",
    "sourceAdapter",
    "domain",
    "robotsStatus",
    "termsStatus",
    "detailFetchDecision",
    "extractedFields",
    "phaseCStatus",
    "blockedReason",
    "needsManualReview",
  ]

  with path.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)


def _has_forbidden_url(urls: list[str]) -> str | None:
  for url in urls:
    lowered = url.lower()

    for term in FORBIDDEN_URL_TERMS:
      if term in lowered:
        return term

  return None


def _has_blocked_raw_fields(row: dict[str, Any]) -> bool:
  return any(field.lower() in BLOCKED_RAW_FIELDS for field in row)


def _as_string_list(value: Any) -> list[str]:
  if isinstance(value, list):
    return [str(item) for item in value if item not in (None, "")]

  if value in (None, ""):
    return []

  return [str(value)]


def _join(value: Any) -> str:
  return " | ".join(_as_string_list(value))


def _domain(url: str) -> str:
  return urlparse(url).netloc


def _primary_source_adapter(url: str) -> str:
  domain = _domain(url)

  if "oliveyoung" in domain:
    return "oliveyoung_partner_url"

  if "lotteimall" in domain:
    return "lotteimall_partner_url"

  if "naver" in domain:
    return "naver_shopping_url"

  return "unknown_partner_url"


def _extract_url_identifiers(url: str) -> dict[str, str]:
  parsed = urlparse(url)
  query = parse_qs(parsed.query)
  identifiers: dict[str, str] = {}

  for key in ("sndVal", "goods_no", "goodsNo", "goodsId", "nv_mid", "cat_id"):
    values = query.get(key)

    if values and values[0]:
      identifiers[key] = values[0]

  return identifiers


def _preflight_status_for_url(
  source_url: str,
  domain_preflight: dict[str, dict[str, object]] | None,
) -> dict[str, object]:
  if not domain_preflight:
    return {}

  status = domain_preflight.get(_domain(source_url))

  if not status:
    return {}

  can_fetch_by_url = status.get("canFetchByUrl")
  robots_decision = None

  if isinstance(can_fetch_by_url, dict):
    robots_decision = can_fetch_by_url.get(source_url)

  return {
    "domain": status.get("domain"),
    "robotsStatus": status.get("robotsStatus"),
    "termsStatus": status.get("termsStatus"),
    "detailFetchDecision": status.get("detailFetchDecision"),
    "robotsDecision": robots_decision,
  }


def _stage_row(
  row: dict[str, Any],
  *,
  fetched_at: str,
  parser_version: str,
  dry_run: bool,
  domain_preflight: dict[str, dict[str, object]] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
  source_urls = _as_string_list(row.get("sourceUrls"))
  primary_source_url = source_urls[0] if source_urls else ""
  source_adapter = _primary_source_adapter(primary_source_url) if primary_source_url else "unknown_partner_url"
  source_identifiers = _extract_url_identifiers(primary_source_url) if primary_source_url else {}
  preflight_status = _preflight_status_for_url(primary_source_url, domain_preflight)
  blocked_reason = ""
  phase_status = "metadata_staged"

  forbidden_url_term = _has_forbidden_url(source_urls)

  if forbidden_url_term:
    blocked_reason = f"forbidden_url_term:{forbidden_url_term}"
    phase_status = "blocked"
  elif _has_blocked_raw_fields(row):
    blocked_reason = "blocked_raw_payload_field"
    phase_status = "blocked"
  elif preflight_status.get("robotsDecision") is False:
    blocked_reason = "robots_disallowed"
    phase_status = "blocked"
  elif preflight_status and preflight_status.get("robotsDecision") is not True:
    blocked_reason = f"robots_{preflight_status.get('robotsStatus')}"
    phase_status = "manual_review_required"
  elif preflight_status:
    blocked_reason = f"terms_{preflight_status.get('termsStatus')}"
    phase_status = "manual_review_required"

  metadata, metadata_evidence, metadata_confidence = infer_title_metadata(
    title=str(row.get("productName") or ""),
    category=str(row.get("category") or "other"),
    source_url=primary_source_url,
  )
  existing_confidence = row.get("confidence") if isinstance(row.get("confidence"), dict) else {}
  confidence = {
    **existing_confidence,
    **metadata_confidence,
    "sourceAdapter": 0.7,
  }
  evidence = [
    *(row.get("evidence") if isinstance(row.get("evidence"), list) else []),
    *metadata_evidence,
    {
      "field": "sourceAdapter",
      "value": source_adapter,
      "sourceType": "manual",
      "sourceUrl": primary_source_url,
      "rawLabel": "url_adapter",
      "rawText": primary_source_url,
    },
  ]

  if preflight_status:
    evidence.append(
      {
        "field": "domainPreflight",
        "value": preflight_status,
        "sourceType": "manual",
        "sourceUrl": primary_source_url,
        "rawLabel": "robots_terms_preflight",
        "rawText": "Domain robots/terms preflight recorded before any detail fetch.",
      },
    )

  enriched = {
    "candidateId": row.get("candidateId"),
    "brand": row.get("brand"),
    "productName": row.get("productName"),
    "category": row.get("category"),
    **metadata,
    "targetFields": row.get("targetFields") or [],
    "sourceUrls": source_urls,
    "allowedSourceHints": row.get("allowedSourceHints") or [],
    "liveOffer": row.get("liveOffer"),
    "sourceAdapter": source_adapter,
    "sourceIdentifiers": source_identifiers,
    "domainPreflight": preflight_status,
    "detailFetchStarted": False,
    "evidence": [
      *evidence,
      {
        "field": "phaseCStatus",
        "value": phase_status,
        "sourceType": "manual",
        "sourceUrl": primary_source_url,
        "rawLabel": "phase_c_preflight",
        "rawText": "No detail HTML fetch was performed; source metadata was staged for manual review.",
      },
    ],
    "confidence": confidence,
    "needsManualReview": True,
    "fetchedAt": fetched_at,
    "parserVersion": parser_version,
    "phaseCStatus": phase_status,
    "phaseCDryRun": dry_run,
    "blockedReason": blocked_reason,
  }
  review = {
    "priority": row.get("priority"),
    "candidateId": row.get("candidateId"),
    "brand": row.get("brand"),
    "productName": row.get("productName"),
    "category": row.get("category"),
    "targetFields": _join(row.get("targetFields")),
    "sourceUrls": _join(source_urls),
    "allowedSourceHints": _join(row.get("allowedSourceHints")),
    "sourceAdapter": source_adapter,
    "domain": preflight_status.get("domain") or _domain(primary_source_url) if primary_source_url else "",
    "robotsStatus": preflight_status.get("robotsStatus", ""),
    "termsStatus": preflight_status.get("termsStatus", ""),
    "detailFetchDecision": preflight_status.get("detailFetchDecision", ""),
    "extractedFields": _join(sorted(metadata)),
    "phaseCStatus": phase_status,
    "blockedReason": blocked_reason,
    "needsManualReview": True,
  }

  return enriched, review


def _write_report(
  path: Path,
  *,
  run_date: str,
  queue_path: Path,
  enriched_path: Path,
  review_path: Path,
  input_queue_count: int,
  start_index: int,
  staged_count: int,
  blocked_count: int,
  dry_run: bool,
  request_delay_seconds: float,
  respect_robots: bool,
  network_preflight: bool,
  domain_preflight_path: Path | None,
  domain_count: int,
  raw_html_allowed: bool,
  raw_reviews_allowed: bool,
  image_downloads_allowed: bool,
) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  lines = [
    f"# Auradin Phase C Enrichment Preflight ({run_date})",
    "",
    "Phase: Phase C source-adapter staging. No product detail crawl was performed.",
    "",
    f"- Input queue: `{queue_path}`",
    f"- Enriched placeholder output: `{enriched_path}`",
    f"- Manual review output: `{review_path}`",
    f"- Input queue rows: {input_queue_count}",
    f"- Start index: {start_index}",
    f"- Staged rows: {staged_count}",
    f"- Blocked rows: {blocked_count}",
    f"- Dry run: `{dry_run}`",
    f"- Request delay seconds for future detail fetches: `{request_delay_seconds}`",
    f"- Respect robots required: `{respect_robots}`",
    f"- Network preflight performed: `{network_preflight}`",
    f"- Domain preflight report: `{domain_preflight_path}`",
    f"- Domain count: {domain_count}",
    "",
    "Safety guardrails:",
    "",
    f"- Store raw HTML: `{raw_html_allowed}`",
    f"- Store raw reviews: `{raw_reviews_allowed}`",
    f"- Download original product images: `{image_downloads_allowed}`",
    "- Login, cart, order, checkout, account, and mypage URLs are blocked.",
    "- Source adapters record robots/terms status before any detail fetch.",
    "- Product detail HTML fetch is not performed by this pilot command.",
    "",
    "Next command:",
    "",
    "```sh",
    "python3 scripts/run_auradin_phase_c_enrichment.py \\",
    f"  --date {run_date} \\",
    f"  --start-index {start_index} \\",
    f"  --queue {queue_path} \\",
    f"  --output {enriched_path} \\",
    f"  --review-output {review_path} \\",
    f"  --report {path} \\",
    "  --max-items 20 \\",
    f"  --request-delay-seconds {request_delay_seconds:g} \\",
    "  --network-preflight \\",
    "  --respect-robots \\",
    "  --no-raw-html \\",
    "  --no-raw-reviews \\",
    "  --no-image-downloads",
    "```",
  ]
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_phase_c_preflight(
  *,
  queue_path: Path,
  enriched_path: Path,
  review_path: Path,
  report_path: Path,
  run_date: str,
  fetched_at: str,
  max_items: int = 20,
  start_index: int = 0,
  request_delay_seconds: float = 5.0,
  respect_robots: bool = True,
  network_preflight: bool = False,
  domain_preflight_path: Path | None = None,
  user_agent: str = DEFAULT_USER_AGENT,
  timeout_seconds: float = 10.0,
  no_raw_html: bool = True,
  no_raw_reviews: bool = True,
  no_image_downloads: bool = True,
  dry_run: bool = True,
  parser_version: str = "auradin-phase-c-pilot-v1",
  fetch_url: FetchUrl | None = None,
) -> PhaseCPreflightResult:
  if max_items <= 0:
    raise ValueError("max_items must be greater than 0")

  if start_index < 0:
    raise ValueError("start_index must be greater than or equal to 0")

  if request_delay_seconds < 5:
    raise ValueError("request_delay_seconds must be at least 5 for Phase C")

  queue_rows = _read_jsonl(queue_path)
  selected_rows = queue_rows[start_index : start_index + max_items]
  selected_urls = [
    source_url
    for row in selected_rows
    for source_url in _as_string_list(row.get("sourceUrls"))
  ]
  domain_preflight: dict[str, dict[str, object]] | None = None

  if network_preflight:
    domain_preflight = build_domain_preflight(
      source_urls=selected_urls,
      user_agent=user_agent,
      timeout_seconds=timeout_seconds,
      request_delay_seconds=request_delay_seconds,
      **({"fetch_url": fetch_url} if fetch_url else {}),
    )

    if domain_preflight_path:
      write_domain_preflight_report(
        domain_preflight_path,
        run_date=run_date,
        preflight=domain_preflight,
      )

  enriched_rows: list[dict[str, Any]] = []
  review_rows: list[dict[str, Any]] = []

  for row in selected_rows:
    enriched, review = _stage_row(
      row,
      fetched_at=fetched_at,
      parser_version=parser_version,
      dry_run=dry_run,
      domain_preflight=domain_preflight,
    )
    enriched_rows.append(enriched)
    review_rows.append(review)

  blocked_count = sum(1 for row in enriched_rows if row.get("phaseCStatus") == "blocked")
  _write_jsonl(enriched_path, enriched_rows)
  _write_review_csv(review_path, review_rows)
  _write_report(
    report_path,
    run_date=run_date,
    queue_path=queue_path,
    enriched_path=enriched_path,
    review_path=review_path,
    input_queue_count=len(queue_rows),
    start_index=start_index,
    staged_count=len(enriched_rows),
    blocked_count=blocked_count,
    dry_run=dry_run,
    request_delay_seconds=request_delay_seconds,
    respect_robots=respect_robots,
    network_preflight=network_preflight,
    domain_preflight_path=domain_preflight_path,
    domain_count=len(domain_preflight or {}),
    raw_html_allowed=not no_raw_html,
    raw_reviews_allowed=not no_raw_reviews,
    image_downloads_allowed=not no_image_downloads,
  )

  return PhaseCPreflightResult(
    run_date=run_date,
    enriched_path=enriched_path,
    review_path=review_path,
    report_path=report_path,
    input_queue_count=len(queue_rows),
    start_index=start_index,
    staged_count=len(enriched_rows),
    blocked_count=blocked_count,
    dry_run=dry_run,
    crawl_started=False,
    domain_preflight_path=domain_preflight_path,
    domain_count=len(domain_preflight or {}),
    detail_fetch_started=False,
  )
