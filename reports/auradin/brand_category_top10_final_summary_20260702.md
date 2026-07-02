# Auradin Brand x Category Top10 Final Summary (20260702)

## Goal

- Target: 17 brands x 6 categories x top 10 products.
- Required rows: 1,020.
- Final top10 snapshot rows: 1,020.
- Final brand-category slots: 102/102 ready.

## Candidate Collection

- Starting candidate pool: 5,089 rows from `data/auradin/processed/product_candidates_20260702.jsonl`.
- Starting top10-fill capacity: 889/1,020 rows.
- Underfilled before targeted collection: 22 brand-category slots, 131 missing rows.
- Targeted Naver pass 1: 51 queries, 3,094 raw rows, 3,007 accepted candidates, gap reduced to 5 rows.
- Targeted Naver pass 2: 6 queries for `컬러그램 / brow`, 317 raw rows, 135 accepted candidates, gap reduced to 0.
- Final merged candidates: 7,335 rows.
- Final top10 queue: `data/auradin/processed/enrichment_queue_brand_category_top10_20260702.jsonl`.
- Coverage CSV: `reports/auradin/brand_category_top10_coverage_20260702.csv`.

## Coverage Verification

- Snapshot: `data/auradin/catalog/brand_category_top10_products_20260702.jsonl`.
- Snapshot CSV: `data/auradin/catalog/brand_category_top10_products_20260702.csv`.
- Rows: 1,020.
- Slots: 102.
- Rows per slot: min 10, max 10.
- Category counts: base 170, brow 170, cheek 170, liner 170, lip 170, shadow 170.
- Brand counts: 60 rows per brand.

## Detail Collection

- Phase C staged rows: 1,020.
- Phase C blocked by robots: 737.
- Phase C manual-review/detail-attempt targets: 283.
- Phase D attempted rows: 283.
- Phase D complete: 45.
- Phase D partial: 46.
- Phase D failed: 192.
- Failure reasons: HTTP 403 188, no useful data 3, security challenge 1.
- Detail summary: `reports/auradin/detail_collection_summary_20260702_brand_category_top10.md`.
- Detail normalized output: `data/auradin/detail/normalized/detail_collection_results_20260702_brand_category_top10.jsonl`.

## Embedding Outputs

- Detail-derived catalog items: 472.
- Detail-derived product knowledge docs: 1,900.
- Top10 snapshot embedding docs: 1,273.
- Top10 docs path: `data/auradin/embeddings/brand_category_top10_product_documents_20260702.jsonl`.
- Every top10 product has one `top10_core` document.
- 253 products also have a `top10_detail` document.

## Field Coverage In Final Snapshot

- Brand country filled: all configured brands are Korea.
- Olive Young listed: 120 rows.
- Department-store-related listed: 65 rows.
- With finish: 84 rows.
- With texture: 209 rows.
- With shade options: 46 rows.
- With selling points: 84 rows.
- With suitable-for tags: 24 rows.

## Notes

- OpenAI Structured Extraction did not run because `OPENAI_API_KEY` is not configured.
- Rule-based structured extraction was used for detail normalization.
- Raw detail HTML was parsed in memory only and was not stored.
- Raw reviews were not fetched or stored.
- Original product images were not downloaded.
- Blocked or failed detail rows remain in the 1,020-row snapshot with metadata and empty detail fields.
