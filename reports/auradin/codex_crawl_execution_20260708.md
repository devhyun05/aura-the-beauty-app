# AURADIN Codex Crawl Execution Report - 20260708

## Scope

- Read and followed `docs/auradin/CRAWLING_PLAN_CODEX.md`.
- Used existing scripts only. No new crawler, HTTP client, detail-page bypass, or post-crawl refine/merge/vector work was performed.
- Source was NAVER Shopping official API with `--naverpay-only` and `--request-delay-seconds 0.5`.
- Stored metadata only. No raw HTML, reviews, ingredients, original image files, `colorHex`, `colorLab`, or `madeInCountry` fields were collected.

## Inputs

- Date: `20260708`
- Empty base seed: `data/auradin/processed/product_candidates_20260708.jsonl`
- Manifest: `data/auradin/manifests/crawl_manifest_20260708.json`
- Manifest report: `reports/auradin/crawl_manifest_20260708.md`

## Primary Wave Runs

| Wave | Brands | Query count | Raw rows | Accepted candidates | Cumulative deduped candidates | Subcategory below-min slots |
|---:|---|---:|---:|---:|---:|---:|
| 1 | 롬앤, 페리페라, 컬러그램, 웨이크메이크 | 160 | 7733 | 7355 | 2444 | 156 |
| 2 | 데이지크, 클리오, 정샘물 뷰티, 3CE | 160 | 6916 | 6861 | 5037 | 164 |
| 3 | 에뛰드, 더샘, VDL, 라카 | 160 | 6662 | 6573 | 7916 | 135 |
| 4 | 네이밍, 투쿨포스쿨, 하트퍼센트, 에스쁘아 | 160 | 4855 | 4546 | 9344 | 105 |
| 5 | 뮤드 | 40 | 630 | 471 | 9455 | 99 |

After each wave, `product_candidates_brand_category_top60_20260708.jsonl` was promoted to `product_candidates_20260708.jsonl` so the next manifest command could read the cumulative base while preserving the command shape.

## Gap Fill Runs

Dry-run after the five manifest waves still produced refill query targets:

| Wave | Refill query count | Raw rows | Accepted candidates | Cumulative deduped candidates | Subcategory below-min slots |
|---:|---:|---:|---:|---:|---:|
| 1 | 38 | 799 | 620 | 9455 | 99 |
| 2 | 62 | 1034 | 997 | 9455 | 99 |
| 3 | 74 | 1486 | 1419 | 9455 | 99 |
| 4 | 104 | 2127 | 1826 | 9455 | 99 |
| 5 | 40 | 630 | 471 | 9455 | 99 |

The refill runs returned already-known NAVER API candidates after dedupe. No detail-page workaround or blocked-source retry was attempted.

## Final Outputs

- Final candidates: `data/auradin/processed/product_candidates_brand_category_top60_20260708.jsonl` - 9455 rows
- Cumulative base copy: `data/auradin/processed/product_candidates_20260708.jsonl` - 9455 rows
- Full enrichment queue rebuilt from final candidates: `data/auradin/processed/enrichment_queue_brand_category_top60_20260708.jsonl` - 4554 rows
- Queue report: `reports/auradin/brand_category_top60_queue_20260708.md`
- Final subcategory coverage report: `reports/auradin/crawl_coverage_product_candidates_brand_category_top60_20260708.md`
- Final broad category coverage CSV: `reports/auradin/brand_category_top60_coverage_20260708.csv`
- Target query CSV: `reports/auradin/brand_category_top60_target_queries_20260708.csv`

The targeted collection script overwrites its default report path per run, so refill report snapshots were preserved here:

- `reports/auradin/wave1_refill_brand_category_top60_targeted_collection_20260708.md`
- `reports/auradin/wave2_refill_brand_category_top60_targeted_collection_20260708.md`
- `reports/auradin/wave3_refill_brand_category_top60_targeted_collection_20260708.md`
- `reports/auradin/wave4_refill_brand_category_top60_targeted_collection_20260708.md`
- `reports/auradin/wave5_refill_brand_category_top60_targeted_collection_20260708.md`

## Final Coverage

Final subcategory coverage:

- Total rows: 9455
- Bucketed rows: 9455
- Slot status: `{"empty": 39, "full": 139, "min_ok": 17, "partial": 60}`
- Minimum-underfilled slots: 99

The acceptance target of every brand x subcategory slot having at least 10 candidates was not fully met. Remaining gaps are documented in `reports/auradin/crawl_coverage_product_candidates_brand_category_top60_20260708.md`. Cause observed in this run: allowed NAVER API refill queries produced no new unique candidates after dedupe. No HTTP block bypass was attempted.

## Quality Gates

Explicit validation on final artifacts:

- `validate_candidate_rows`: passed, 9455 rows, no duplicate IDs, no missing required fields
- `validate_enrichment_queue`: passed, 4554 rows, no missing required fields, no blocked raw payload fields
- Forbidden field scan: no `rawHtml`, `raw_html`, `rawReview`, `raw_reviews`, `originalImage`, `colorHex`, `colorLab`, or `madeInCountry`
- Blocked-like status scan: 0 `blocked`, `security_challenge`, `captcha`, `login_required`, `http_status:401`, `http_status:403`, or `http_status:429` values in final candidate/queue artifacts

## Handoff Notes

- The final data is metadata-only and suitable for Claude's next preprocessing/refine handoff.
- Remaining 99 underfilled subcategory slots should be treated as source coverage gaps under the current NAVER API query set, not as completed coverage.
- Official-site/detail enrichment and post-crawl rebuild steps were intentionally not run in this Codex task.
