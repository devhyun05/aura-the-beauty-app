# Auradin Phase C Enrichment Preflight (20260702)

Phase: Phase C source-adapter staging. No product detail crawl was performed.

- Input queue: `data/auradin/processed/enrichment_queue_brand_category_top10_20260702.jsonl`
- Enriched placeholder output: `data/auradin/enriched/enriched_products_brand_category_top10_20260702.jsonl`
- Manual review output: `data/auradin/review/catalog_review_queue_brand_category_top10_20260702.csv`
- Input queue rows: 1020
- Start index: 0
- Staged rows: 1020
- Blocked rows: 737
- Dry run: `True`
- Request delay seconds for future detail fetches: `5.0`
- Respect robots required: `True`
- Network preflight performed: `True`
- Domain preflight report: `reports/auradin/domain_preflight_brand_category_top10_20260702.md`
- Domain count: 32

Safety guardrails:

- Store raw HTML: `False`
- Store raw reviews: `False`
- Download original product images: `False`
- Login, cart, order, checkout, account, and mypage URLs are blocked.
- Source adapters record robots/terms status before any detail fetch.
- Product detail HTML fetch is not performed by this pilot command.

Next command:

```sh
python3 scripts/run_auradin_phase_c_enrichment.py \
  --date 20260702 \
  --start-index 0 \
  --queue data/auradin/processed/enrichment_queue_brand_category_top10_20260702.jsonl \
  --output data/auradin/enriched/enriched_products_brand_category_top10_20260702.jsonl \
  --review-output data/auradin/review/catalog_review_queue_brand_category_top10_20260702.csv \
  --report reports/auradin/phase_c_brand_category_top10_20260702.md \
  --max-items 20 \
  --request-delay-seconds 5 \
  --network-preflight \
  --respect-robots \
  --no-raw-html \
  --no-raw-reviews \
  --no-image-downloads
```
