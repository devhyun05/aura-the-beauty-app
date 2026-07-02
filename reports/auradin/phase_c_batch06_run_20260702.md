# Auradin Phase C Batch 6 Run Report (20260702)

## Scope

- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Input queue: `data/auradin/processed/enrichment_queue_20260702.jsonl`
- Batch range: rows 101-120, `--start-index 100 --max-items 20`
- Safety boundary: no product detail HTML fetch, no review fetch, no raw review text, no original image download, no login/cart/order/checkout/account/mypage/private URL access.
- Phase A/B files were kept intact; batch 6 wrote only `_batch06` outputs.

## Command

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

## Result

```json
{
  "blockedCount": 13,
  "crawlStarted": false,
  "detailFetchStarted": false,
  "domainCount": 10,
  "dryRun": true,
  "inputQueueCount": 120,
  "stagedCount": 20,
  "startIndex": 100
}
```

## Outputs

- `data/auradin/enriched/enriched_products_20260702_batch06.jsonl`: 20 rows.
- `data/auradin/review/catalog_review_queue_20260702_batch06.csv`: 20 rows plus header.
- `reports/auradin/domain_preflight_20260702_batch06.md`: 10 target domains.
- `reports/auradin/enrichment_summary_20260702_batch06.md`

## Quality Summary

- Phase C status counts:
  - `blocked`: 13
  - `manual_review_required`: 7
- Block/manual-review reasons:
  - `robots_disallowed`: 13
  - `robots_fetch_failed_requires_manual_review`: 4
  - `terms_not_configured`: 3
- Rows with `sourceUrls`: 20 / 20.
- Rows with `fetchedAt`: 20 / 20.
- Rows with `parserVersion`: 20 / 20.
- Rows with `evidence`: 20 / 20.
- Rows with `confidence`: 20 / 20.
- Rows with `needsManualReview=true`: 20 / 20.
- Raw payload fields found: none.
- Detail fetch started: false.

## Verification

Included in the final Phase C audit:

- `reports/auradin/phase_c_quality_20260702.csv`
- `reports/auradin/phase_c_complete_run_20260702.md`

