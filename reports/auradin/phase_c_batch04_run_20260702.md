# Auradin Phase C Batch 4 Run Report (20260702)

## Scope

- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Input queue: `data/auradin/processed/enrichment_queue_20260702.jsonl`
- Batch range: rows 61-80, `--start-index 60 --max-items 20`
- Safety boundary: no product detail HTML fetch, no review fetch, no raw review text, no original image download, no login/cart/order/checkout/account/mypage/private URL access.
- Phase A/B files were kept intact; batch 4 wrote only `_batch04` outputs.

## Command

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

## Result

```json
{
  "blockedCount": 7,
  "crawlStarted": false,
  "detailFetchStarted": false,
  "domainCount": 7,
  "dryRun": true,
  "inputQueueCount": 120,
  "stagedCount": 20,
  "startIndex": 60
}
```

## Outputs

- `data/auradin/enriched/enriched_products_20260702_batch04.jsonl`: 20 rows.
- `data/auradin/review/catalog_review_queue_20260702_batch04.csv`: 20 rows plus header.
- `reports/auradin/domain_preflight_20260702_batch04.md`: 7 target domains.
- `reports/auradin/enrichment_summary_20260702_batch04.md`

## Quality Summary

- Phase C status counts:
  - `blocked`: 7
  - `manual_review_required`: 13
- Block/manual-review reasons:
  - `robots_disallowed`: 7
  - `robots_fetch_failed_requires_manual_review`: 12
  - `terms_not_configured`: 1
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

