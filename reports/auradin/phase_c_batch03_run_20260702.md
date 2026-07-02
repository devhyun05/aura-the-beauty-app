# Auradin Phase C Batch 3 Run Report (20260702)

## Scope

- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Input queue: `data/auradin/processed/enrichment_queue_20260702.jsonl`
- Batch range: rows 41-60, `--start-index 40 --max-items 20`
- Safety boundary: no product detail HTML fetch, no review fetch, no raw review text, no original image download, no login/cart/order/checkout/account/mypage/private URL access.
- Phase A/B files were kept intact; batch 3 wrote only `_batch03` outputs.

## Command

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 40 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702_batch03.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702_batch03.csv \
  --report reports/auradin/enrichment_summary_20260702_batch03.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702_batch03.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --timeout-seconds 10 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```

## Result

```json
{
  "blockedCount": 10,
  "crawlStarted": false,
  "detailFetchStarted": false,
  "domainCount": 4,
  "dryRun": true,
  "inputQueueCount": 120,
  "stagedCount": 20,
  "startIndex": 40
}
```

## Outputs

- `data/auradin/enriched/enriched_products_20260702_batch03.jsonl`: 20 rows.
- `data/auradin/review/catalog_review_queue_20260702_batch03.csv`: 20 rows plus header.
- `reports/auradin/domain_preflight_20260702_batch03.md`: 4 target domains.
- `reports/auradin/enrichment_summary_20260702_batch03.md`

## Quality Summary

- Phase C status counts:
  - `blocked`: 10
  - `manual_review_required`: 10
- Block/manual-review reasons:
  - `robots_disallowed`: 10
  - `robots_fetch_failed_requires_manual_review`: 8
  - `terms_not_configured`: 2
- Rows with `sourceUrls`: 20 / 20.
- Rows with `fetchedAt`: 20 / 20.
- Rows with `parserVersion`: 20 / 20.
- Rows with `evidence`: 20 / 20.
- Rows with `confidence`: 20 / 20.
- Rows with `needsManualReview=true`: 20 / 20.
- Raw payload fields found: none.
- Detail fetch started: false.

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

- Validated artifact: `Auradin Phase C Batch 3 Validation`.
- Status: `ready`.
- Dataset count: 4.
- Source count: 5.
- Validation result: passed.

## Rerun Command

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 40 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702_batch03.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702_batch03.csv \
  --report reports/auradin/enrichment_summary_20260702_batch03.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702_batch03.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --timeout-seconds 10 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```

## Next Batch Command

Continue with rows 61-80:

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
