from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from app.services.auradin_catalog.domain_preflight import FetchSummary
from app.services.auradin_catalog.phase_c_enrichment import run_phase_c_preflight


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
    encoding="utf-8",
  )


def test_phase_c_preflight_writes_staging_outputs_without_crawling(tmp_path: Path) -> None:
  queue_path = tmp_path / "data" / "auradin" / "processed" / "enrichment_queue_20260702.jsonl"
  enriched_path = tmp_path / "data" / "auradin" / "enriched" / "enriched_products_20260702.jsonl"
  review_path = tmp_path / "data" / "auradin" / "review" / "catalog_review_queue_20260702.csv"
  report_path = tmp_path / "reports" / "auradin" / "enrichment_summary_20260702.md"
  _write_jsonl(
    queue_path,
    [
      {
        "id": "enrich-naver-100",
        "candidateId": "naver-100",
        "brand": "롬앤",
        "productName": "롬앤 글래스팅 워터 틴트",
        "category": "lip",
        "targetFields": ["shadeName", "finish", "texture"],
        "sourceUrls": ["https://search.shopping.naver.com/catalog/100"],
        "allowedSourceHints": ["brand_official", "oliveyoung", "naver_detail", "manual"],
        "liveOffer": {
          "source": "naver_shopping",
          "link": "https://search.shopping.naver.com/catalog/100",
          "image": "https://shopping-phinf.pstatic.net/main_100/100.jpg",
          "lprice": 9900,
          "mallName": "공식스토어",
          "fetchedAt": "2026-07-02T00:00:00+09:00",
          "ttlSeconds": 86400,
        },
        "evidence": [
          {
            "field": "candidate",
            "value": "롬앤 글래스팅 워터 틴트",
            "sourceType": "naver_api",
            "sourceUrl": "https://search.shopping.naver.com/catalog/100",
            "rawLabel": "title",
            "rawText": "롬앤 글래스팅 워터 틴트",
          },
        ],
        "confidence": {"brand": 0.7, "category": 0.65, "liveOffer": 0.8},
        "needsManualReview": True,
        "fetchedAt": "2026-07-02T00:00:00+09:00",
        "parserVersion": "auradin-catalog-fixture-v0",
        "priority": 1,
      },
    ],
  )

  result = run_phase_c_preflight(
    queue_path=queue_path,
    enriched_path=enriched_path,
    review_path=review_path,
    report_path=report_path,
    run_date="20260702",
    fetched_at="2026-07-02T00:00:00+09:00",
    max_items=20,
  )

  assert result.input_queue_count == 1
  assert result.staged_count == 1
  assert result.blocked_count == 0
  assert result.crawl_started is False

  enriched_rows = [
    json.loads(line) for line in enriched_path.read_text(encoding="utf-8").splitlines()
  ]
  assert enriched_rows[0]["candidateId"] == "naver-100"
  assert enriched_rows[0]["phaseCStatus"] == "metadata_staged"
  assert enriched_rows[0]["sourceUrls"] == ["https://search.shopping.naver.com/catalog/100"]
  assert enriched_rows[0]["confidence"]["brand"] == 0.7
  assert enriched_rows[0]["sourceAdapter"] == "naver_shopping_url"
  assert enriched_rows[0]["detailFetchStarted"] is False
  assert "rawHtml" not in enriched_rows[0]
  assert "raw_reviews" not in enriched_rows[0]
  assert "originalImage" not in enriched_rows[0]

  review_rows = list(csv.DictReader(review_path.open(encoding="utf-8")))
  assert review_rows[0]["candidateId"] == "naver-100"
  assert review_rows[0]["phaseCStatus"] == "metadata_staged"
  assert "No product detail crawl was performed" in report_path.read_text(encoding="utf-8")


def test_phase_c_preflight_blocks_forbidden_queue_urls(tmp_path: Path) -> None:
  queue_path = tmp_path / "queue.jsonl"
  _write_jsonl(
    queue_path,
    [
      {
        "candidateId": "naver-200",
        "brand": "롬앤",
        "productName": "롬앤 테스트",
        "category": "lip",
        "targetFields": ["shadeName"],
        "sourceUrls": ["https://example.com/cart/item/200"],
        "allowedSourceHints": ["manual"],
        "evidence": [],
        "confidence": {},
      },
    ],
  )

  result = run_phase_c_preflight(
    queue_path=queue_path,
    enriched_path=tmp_path / "enriched.jsonl",
    review_path=tmp_path / "review.csv",
    report_path=tmp_path / "report.md",
    run_date="20260702",
    fetched_at="2026-07-02T00:00:00+09:00",
  )

  assert result.blocked_count == 1
  row = json.loads((tmp_path / "enriched.jsonl").read_text(encoding="utf-8").splitlines()[0])
  assert row["phaseCStatus"] == "blocked"
  assert row["blockedReason"] == "forbidden_url_term:cart"


def test_phase_c_preflight_records_domain_preflight_without_detail_fetch(tmp_path: Path) -> None:
  queue_path = tmp_path / "queue.jsonl"
  domain_report_path = tmp_path / "domain_preflight.md"
  _write_jsonl(
    queue_path,
    [
      {
        "candidateId": "naver-300",
        "brand": "롬앤",
        "productName": "롬앤 컬러 립 매트",
        "category": "lip",
        "targetFields": ["finish", "texture"],
        "sourceUrls": ["https://www.oliveyoung.co.kr/store/common/partner.do?sndVal=A0001"],
        "allowedSourceHints": ["oliveyoung", "manual"],
        "evidence": [],
        "confidence": {},
      },
    ],
  )

  def fake_fetch(url: str, user_agent: str, timeout_seconds: float) -> FetchSummary:
    if url.endswith("/robots.txt"):
      return FetchSummary(
        url=url,
        status=200,
        ok=True,
        content_length=24,
        error="",
        body="User-agent: *\nAllow: /\n",
      )

    return FetchSummary(
      url=url,
      status=200,
      ok=True,
      content_length=10,
      error="",
      body="terms",
    )

  result = run_phase_c_preflight(
    queue_path=queue_path,
    enriched_path=tmp_path / "enriched.jsonl",
    review_path=tmp_path / "review.csv",
    report_path=tmp_path / "report.md",
    domain_preflight_path=domain_report_path,
    run_date="20260702",
    fetched_at="2026-07-02T00:00:00+09:00",
    network_preflight=True,
    request_delay_seconds=5,
    fetch_url=fake_fetch,
  )

  assert result.domain_count == 1
  assert result.detail_fetch_started is False
  assert "www.oliveyoung.co.kr" in domain_report_path.read_text(encoding="utf-8")
  row = json.loads((tmp_path / "enriched.jsonl").read_text(encoding="utf-8").splitlines()[0])
  assert row["phaseCStatus"] == "manual_review_required"
  assert row["domainPreflight"]["robotsDecision"] is True
  assert row["domainPreflight"]["termsStatus"] == "fetched_requires_manual_review"
  assert row["finish"] == "matte"
  assert row["texture"] == "lipstick"


def test_phase_c_preflight_requires_positive_max_items(tmp_path: Path) -> None:
  queue_path = tmp_path / "queue.jsonl"
  _write_jsonl(queue_path, [])

  with pytest.raises(ValueError, match="max_items"):
    run_phase_c_preflight(
      queue_path=queue_path,
      enriched_path=tmp_path / "enriched.jsonl",
      review_path=tmp_path / "review.csv",
      report_path=tmp_path / "report.md",
      run_date="20260702",
      fetched_at="2026-07-02T00:00:00+09:00",
      max_items=0,
    )


def test_phase_c_preflight_supports_start_index_for_next_batch(tmp_path: Path) -> None:
  queue_path = tmp_path / "queue.jsonl"
  _write_jsonl(
    queue_path,
    [
      {
        "candidateId": "naver-1",
        "brand": "롬앤",
        "productName": "롬앤 틴트",
        "category": "lip",
        "targetFields": ["texture"],
        "sourceUrls": ["https://example.com/1"],
        "allowedSourceHints": ["manual"],
        "evidence": [],
        "confidence": {},
      },
      {
        "candidateId": "naver-2",
        "brand": "롬앤",
        "productName": "롬앤 매트 립",
        "category": "lip",
        "targetFields": ["finish"],
        "sourceUrls": ["https://example.com/2"],
        "allowedSourceHints": ["manual"],
        "evidence": [],
        "confidence": {},
      },
    ],
  )

  result = run_phase_c_preflight(
    queue_path=queue_path,
    enriched_path=tmp_path / "enriched.jsonl",
    review_path=tmp_path / "review.csv",
    report_path=tmp_path / "report.md",
    run_date="20260702",
    fetched_at="2026-07-02T00:00:00+09:00",
    max_items=1,
    start_index=1,
  )

  assert result.input_queue_count == 2
  assert result.start_index == 1
  assert result.staged_count == 1
  row = json.loads((tmp_path / "enriched.jsonl").read_text(encoding="utf-8").splitlines()[0])
  assert row["candidateId"] == "naver-2"
  assert "Start index: 1" in (tmp_path / "report.md").read_text(encoding="utf-8")
