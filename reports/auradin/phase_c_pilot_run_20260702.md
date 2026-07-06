# Auradin Phase C Pilot Run Report (20260702)

## Scope

- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Input queue: `data/auradin/processed/enrichment_queue_20260702.jsonl`
- Pilot range: first 20 rows, `--start-index 0 --max-items 20`
- Safety boundary: no product detail HTML fetch, no review fetch, no original image download, no login/cart/order/checkout/account/mypage access.

## Command

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 0 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702.csv \
  --report reports/auradin/enrichment_summary_20260702.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702.md \
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
  "blockedCount": 8,
  "crawlStarted": false,
  "detailFetchStarted": false,
  "domainCount": 9,
  "dryRun": true,
  "inputQueueCount": 120,
  "stagedCount": 20,
  "startIndex": 0
}
```

## Outputs

- `data/auradin/enriched/enriched_products_20260702.jsonl`: 20 rows.
- `data/auradin/review/catalog_review_queue_20260702.csv`: 20 rows plus header.
- `reports/auradin/domain_preflight_20260702.md`: 9 target domains.
- `reports/auradin/enrichment_summary_20260702.md`

## Quality Summary

- Phase C status counts:
  - `blocked`: 8
  - `manual_review_required`: 12
- Block reasons:
  - `robots_disallowed`: 8
  - `terms_fetch_failed_requires_manual_review`: 10
  - `terms_not_configured`: 2
- Rows with `sourceUrls`: 20 / 20.
- Rows with `fetchedAt`: 20 / 20.
- Rows with `evidence`: 20 / 20.
- Rows with `confidence`: 20 / 20.
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

- Validated artifact: `Auradin Phase C Pilot Validation`.
- Status: `ready`.
- Dataset count: 2.
- Source count: 6.
- Validation result: passed.

Field evidence/confidence audit:

- Checked enriched fields: `shadeName`, `shadeSource`, `colorFamily`, `undertone`, `finish`, `texture`, `intensity`, `coverage`, `sourceAdapter`, `domainPreflight`, `phaseCStatus`.
- Violations: 0.

## Next Batch Command

Continue with rows 21-40:

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 20 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702_batch02.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702_batch02.csv \
  --report reports/auradin/enrichment_summary_20260702_batch02.md \
  --domain-preflight-report reports/auradin/domain_preflight_20260702_batch02.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --timeout-seconds 10 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```
