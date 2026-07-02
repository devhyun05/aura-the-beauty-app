# Auradin Phase A/B Live Run Report (20260702)

## Scope

- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Run type: live Naver Shopping API Phase A/B collection.
- Safety boundary: API-first only. No official mall, Olive Young, Naver detail page, review, login, cart, order, mypage, raw HTML, raw review, or original image crawl/download was started.

## Credential Gate

- `services/backend/.env` exists.
- `NAVER_SHOPPING_CLIENT_ID`: configured.
- `NAVER_SHOPPING_CLIENT_SECRET`: configured.
- Secret values were not printed.

## API Smoke

Command:

```sh
python3 scripts/run_auradin_naver_collection.py \
  --date 20260702 \
  --categories lip \
  --max-queries 1 \
  --display 1 \
  --request-delay-seconds 0 \
  --timeout-seconds 8 \
  --output-root /tmp/auradin-smoke-data \
  --report-root /tmp/auradin-smoke-reports
```

Result:

```json
{
  "candidateCount": 1,
  "candidateQualityPassed": true,
  "enrichmentQueueCount": 1,
  "queryCount": 1,
  "queueQualityPassed": true,
  "rawCount": 1,
  "rejects": {}
}
```

## Phase A/B Full Collection

Command:

```sh
python3 scripts/run_auradin_naver_collection.py \
  --date 20260702 \
  --categories lip,shadow,base,cheek,liner,brow \
  --max-queries 102 \
  --display 100 \
  --request-delay-seconds 1 \
  --timeout-seconds 10
```

Result:

```json
{
  "candidateCount": 5089,
  "candidateQualityPassed": true,
  "enrichmentQueueCount": 120,
  "queryCount": 102,
  "queueQualityPassed": true,
  "rawCount": 5237,
  "rejects": {
    "brand_not_whitelisted": 1,
    "non_cosmetic_noise": 14
  }
}
```

## Output Files

- `data/auradin/raw/naver_candidates_20260702.jsonl`: 5,237 rows.
- `data/auradin/processed/product_candidates_20260702.jsonl`: 5,089 rows.
- `data/auradin/processed/enrichment_queue_20260702.jsonl`: 120 rows.
- `data/auradin/enriched/enriched_products_20260702.jsonl`: 20 Phase C staging rows.
- `data/auradin/review/catalog_review_queue_20260702.csv`: 20 review rows plus header.
- `reports/auradin/fixture_quality_20260702.csv`: 2 quality rows plus header.
- `reports/auradin/naver_collection_summary_20260702.md`
- `reports/auradin/enrichment_queue_summary_20260702.md`
- `reports/auradin/enrichment_summary_20260702.md`

## Quality Summary

- Candidate brands covered: all 17 whitelisted brands.
- Candidate categories:
  - `lip`: 1,160
  - `shadow`: 1,049
  - `base`: 756
  - `cheek`: 881
  - `liner`: 595
  - `brow`: 648
- Queue categories:
  - `lip`: 20
  - `shadow`: 20
  - `base`: 20
  - `cheek`: 20
  - `liner`: 20
  - `brow`: 20
- Duplicate candidate IDs: none.
- Duplicate Naver product IDs: none.
- Queue rows without matching candidate: none.
- Staged enrichment rows without matching queue candidate: none.
- Missing required candidate fields: none.
- Missing required queue fields: none.
- Blocked raw payload fields: none.

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

Result: `9 passed, 1 warning`.

Data Analytics validation:

- Validated artifact: `Auradin Phase A/B Live Collection Validation`.
- Status: `ready`.
- Dataset count: 2.
- Source count: 7.
- Validation result: passed.

## Next Phase C Command

The next runnable Phase C staging command is:

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --queue data/auradin/processed/enrichment_queue_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_20260702.jsonl \
  --review-output data/auradin/review/catalog_review_queue_20260702.csv \
  --report reports/auradin/enrichment_summary_20260702.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```

Current Phase C staging result:

```json
{
  "blockedCount": 0,
  "crawlStarted": false,
  "dryRun": true,
  "inputQueueCount": 120,
  "stagedCount": 20
}
```

Before any real detail crawl, implement source adapters and record target-domain robots/terms status.
