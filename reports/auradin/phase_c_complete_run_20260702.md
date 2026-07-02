# Auradin Phase C Complete Run Report (20260702)

## Scope

- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Input queue: `data/auradin/processed/enrichment_queue_20260702.jsonl`
- Phase C range: all 120 live Phase B queue rows.
- Batch coverage:
  - Batch 1: rows 1-20, base output filenames.
  - Batch 2: rows 21-40, `_batch02` output filenames.
  - Batch 3: rows 41-60, `_batch03` output filenames.
  - Batch 4: rows 61-80, `_batch04` output filenames.
  - Batch 5: rows 81-100, `_batch05` output filenames.
  - Batch 6: rows 101-120, `_batch06` output filenames.

Phase C was completed as safe source-adapter staging. No product detail HTML, review text, raw review payload, original product image, login, cart, order, checkout, account, mypage, private URL, or broad detail crawl was fetched or stored.

## Commands Executed For Final Batches

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 60 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702_batch04.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702_batch04.csv \
  --report reports/auradin/enrichment_summary_20260702_batch04.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702_batch04.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --timeout-seconds 10 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 80 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702_batch05.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702_batch05.csv \
  --report reports/auradin/enrichment_summary_20260702_batch05.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702_batch05.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --timeout-seconds 10 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 100 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702_batch06.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702_batch06.csv \
  --report reports/auradin/enrichment_summary_20260702_batch06.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702_batch06.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --timeout-seconds 10 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```

## Output Inventory

Combined outputs:

- `data/auradin/enriched/enriched_products_20260702_all.jsonl`: 120 rows.
- `data/auradin/review/catalog_review_queue_20260702_all.csv`: 120 rows plus header.
- `reports/auradin/phase_c_quality_20260702.csv`: 6 batch quality rows plus header.

Batch outputs:

- `data/auradin/enriched/enriched_products_20260702.jsonl`: batch 1, 20 rows.
- `data/auradin/enriched/enriched_products_20260702_batch02.jsonl`: batch 2, 20 rows.
- `data/auradin/enriched/enriched_products_20260702_batch03.jsonl`: batch 3, 20 rows.
- `data/auradin/enriched/enriched_products_20260702_batch04.jsonl`: batch 4, 20 rows.
- `data/auradin/enriched/enriched_products_20260702_batch05.jsonl`: batch 5, 20 rows.
- `data/auradin/enriched/enriched_products_20260702_batch06.jsonl`: batch 6, 20 rows.
- `data/auradin/review/catalog_review_queue_20260702.csv`: batch 1, 20 rows plus header.
- `data/auradin/review/catalog_review_queue_20260702_batch02.csv`: batch 2, 20 rows plus header.
- `data/auradin/review/catalog_review_queue_20260702_batch03.csv`: batch 3, 20 rows plus header.
- `data/auradin/review/catalog_review_queue_20260702_batch04.csv`: batch 4, 20 rows plus header.
- `data/auradin/review/catalog_review_queue_20260702_batch05.csv`: batch 5, 20 rows plus header.
- `data/auradin/review/catalog_review_queue_20260702_batch06.csv`: batch 6, 20 rows plus header.

Reports:

- `reports/auradin/domain_preflight_20260702.md`
- `reports/auradin/domain_preflight_20260702_batch02.md`
- `reports/auradin/domain_preflight_20260702_batch03.md`
- `reports/auradin/domain_preflight_20260702_batch04.md`
- `reports/auradin/domain_preflight_20260702_batch05.md`
- `reports/auradin/domain_preflight_20260702_batch06.md`
- `reports/auradin/enrichment_summary_20260702.md`
- `reports/auradin/enrichment_summary_20260702_batch02.md`
- `reports/auradin/enrichment_summary_20260702_batch03.md`
- `reports/auradin/enrichment_summary_20260702_batch04.md`
- `reports/auradin/enrichment_summary_20260702_batch05.md`
- `reports/auradin/enrichment_summary_20260702_batch06.md`
- `reports/auradin/phase_c_pilot_run_20260702.md`
- `reports/auradin/phase_c_batch02_run_20260702.md`
- `reports/auradin/phase_c_batch03_run_20260702.md`
- `reports/auradin/phase_c_batch04_run_20260702.md`
- `reports/auradin/phase_c_batch05_run_20260702.md`
- `reports/auradin/phase_c_batch06_run_20260702.md`

## Quality Summary

- Queue rows: 120.
- Combined enriched rows: 120.
- Combined review rows: 120.
- Candidate ID missing from queue coverage: 0.
- Candidate ID duplicates across Phase C outputs: 0.
- Extra candidate IDs outside queue: 0.
- Phase C status counts:
  - `blocked`: 56
  - `manual_review_required`: 64
- Block/manual-review reasons:
  - `robots_disallowed`: 56
  - `robots_fetch_failed_requires_manual_review`: 37
  - `terms_fetch_failed_requires_manual_review`: 10
  - `terms_not_configured`: 17
- Rows with `sourceUrls`: 120 / 120.
- Rows with `fetchedAt`: 120 / 120.
- Rows with `parserVersion`: 120 / 120.
- Rows with `evidence`: 120 / 120.
- Rows with `confidence`: 120 / 120.
- Rows with `needsManualReview=true`: 120 / 120.
- Raw payload fields found: none.
- Detail fetch started: false.
- Audit violations: 0.

## Batch Summary

| Batch | Queue rows | Enriched rows | Review rows | Blocked | Manual review required |
|---|---:|---:|---:|---:|---:|
| batch01 | 1-20 | 20 | 20 | 8 | 12 |
| batch02 | 21-40 | 20 | 20 | 8 | 12 |
| batch03 | 41-60 | 20 | 20 | 10 | 10 |
| batch04 | 61-80 | 20 | 20 | 7 | 13 |
| batch05 | 81-100 | 20 | 20 | 10 | 10 |
| batch06 | 101-120 | 20 | 20 | 13 | 7 |

## Verification

Focused tests:

```sh
/opt/miniconda3/bin/python -m pytest \
  services/backend/tests/test_auradin_candidate_normalizer.py \
  services/backend/tests/test_auradin_fixture_pipeline.py \
  services/backend/tests/test_auradin_naver_collect.py \
  services/backend/tests/test_auradin_phase_c_enrichment.py \
  -q
```

Result: `11 passed, 1 warning`.

Data Analytics validation:

- Validated artifact: `Auradin Phase C Complete Validation`.
- Status: `ready`.
- Dataset count: 5.
- Source count: 5.
- Validation result: passed.

## Completion Notes

The complete live Phase B queue has passed through Phase C safe source-adapter staging. No detail-page enrichment was promoted because each candidate source remained disallowed, uncertain, or terms-not-configured under the current safety gate. Those rows are intentionally routed to `blocked` or `manual_review_required` for Phase D/manual source review rather than being fetched automatically.

## Next Phase D Commands

Summarize the manual review workload:

```sh
python3 -c 'import csv, collections; rows=list(csv.DictReader(open("data/auradin/review/catalog_review_queue_20260702_all.csv", encoding="utf-8"))); print("rows", len(rows)); print("status", dict(collections.Counter(r["phaseCStatus"] for r in rows))); print("reason", dict(collections.Counter(r["blockedReason"] for r in rows)))'
```

Create a working copy for manual review without changing Phase C evidence files:

```sh
cp data/auradin/review/catalog_review_queue_20260702_all.csv data/auradin/review/catalog_review_queue_20260702_phase_d_working.csv
```
