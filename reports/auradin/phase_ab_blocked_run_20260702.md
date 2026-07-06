# Auradin Phase A/B Blocked Run Report (20260702)

## Scope

- Requested run: Naver Shopping API-first Phase A/B candidate collection.
- Repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- Date: 2026-07-02 KST
- Safety boundary: no official mall crawling, Olive Young crawling, Naver detail crawling, review crawling, image download, login, cart, order, or mypage access was started.

## Credential Gate

- `services/backend/.env` exists.
- `NAVER_SHOPPING_CLIENT_ID`: not configured.
- `NAVER_SHOPPING_CLIENT_SECRET`: not configured.
- Current process environment also does not expose either required key.
- Rechecked after continuation: still not configured.

Result: live Naver Shopping API smoke is blocked before any network collection.

## Script Smoke Result

Command:

```sh
python3 scripts/run_auradin_naver_collection.py \
  --date 20260702 \
  --categories lip \
  --max-queries 1 \
  --display 1 \
  --request-delay-seconds 0 \
  --timeout-seconds 5
```

Result:

```txt
Missing NAVER_SHOPPING_CLIENT_ID/NAVER_SHOPPING_CLIENT_SECRET. Run with --dry-run to inspect the query plan without calling the API.
```

## Query Plan Readiness

- Full Phase A/B plan: 102 queries.
- Brand coverage: 17 whitelisted brands.
- Category order per brand: `lip`, `shadow`, `base`, `cheek`, `liner`, `brow`.
- First query: `롬앤 립틴트`.

## Existing Fixture Artifact QA

Current dated fixture artifacts remain available:

- `data/auradin/raw/naver_candidates_20260702.jsonl`: 7 rows.
- `data/auradin/processed/product_candidates_20260702.jsonl`: 4 rows.
- `data/auradin/processed/enrichment_queue_20260702.jsonl`: 4 rows.
- `reports/auradin/fixture_quality_20260702.csv`: 2 quality rows.
- `reports/auradin/naver_collection_summary_20260702.md`
- `reports/auradin/enrichment_queue_summary_20260702.md`

Fixture QA:

- Candidate duplicate IDs: none.
- Queue rows without matching candidate: none.
- Blocked raw payload fields: none.
- Candidate categories: `base=1`, `cheek=1`, `lip=1`, `shadow=1`.
- Candidate brands: `데이지크=1`, `라카=1`, `롬앤=1`, `클리오=1`.

These fixture outputs verify pipeline behavior only; they are not fresh live Naver API coverage.

## Verification

Passed:

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

- Validated artifact: `Auradin Phase A/B And Phase C Staging Validation`.
- Status: `blocked`, because live Naver API collection is missing credentials.
- Dataset count: 2.
- Source count: 6.
- Validation result: passed.

## Next Phase A/B Command After Credentials

Configure both keys in `services/backend/.env`, then run:

```sh
python3 scripts/run_auradin_naver_collection.py \
  --date 20260702 \
  --categories lip,shadow,base,cheek,liner,brow \
  --max-queries 102 \
  --display 100 \
  --request-delay-seconds 1 \
  --timeout-seconds 10
```

Expected live Phase A/B outputs:

- `data/auradin/raw/naver_candidates_20260702.jsonl`
- `data/auradin/processed/product_candidates_20260702.jsonl`
- `data/auradin/processed/enrichment_queue_20260702.jsonl`
- `reports/auradin/fixture_quality_20260702.csv`
- `reports/auradin/naver_collection_summary_20260702.md`
- `reports/auradin/enrichment_queue_summary_20260702.md`

## Phase C Enrichment Gate

Do not start Phase C until the live Phase A/B command succeeds and the enrichment queue is reviewed.

Current command availability:

- Existing runnable Phase A/B scripts:
  - `scripts/run_auradin_fixture_pipeline.py`
  - `scripts/run_auradin_naver_collection.py`
- Existing runnable Phase C staging script:
  - `scripts/run_auradin_phase_c_enrichment.py`
- The Phase C script stages enrichment/review outputs from the Phase B queue and deliberately does not perform product detail crawling.

Exact next Phase C staging command after live Phase A/B succeeds:

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

Current Phase C staging smoke on the fixture queue:

```txt
inputQueueCount=4
stagedCount=4
blockedCount=0
dryRun=true
crawlStarted=false
```

Before any real Phase C detail crawl, implement source adapters and record robots/terms status for the target domains.
