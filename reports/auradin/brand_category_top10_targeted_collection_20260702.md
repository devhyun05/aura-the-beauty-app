# Auradin Targeted Brand x Category Top10 Collection

- Base candidates: `data/auradin/processed/product_candidates_brand_category_top10_20260702.jsonl`
- Targeted raw Naver rows: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/raw/naver_candidates_targeted_top10_20260702.jsonl`
- Merged candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_brand_category_top10_20260702.jsonl`
- Output queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/enrichment_queue_brand_category_top10_20260702.jsonl`
- Coverage CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top10_coverage_20260702.csv`
- Query CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top10_target_queries_20260702.csv`
- Base candidate rows: 7232
- Targeted query count: 6
- Targeted raw rows: 317
- Targeted accepted candidates: 135
- Merged ranked candidates: 7335
- Queue rows: 1020
- Remaining gap rows: 0
- Slot status counts: `{"ready": 102}`
- Naver filter: `none`
- Candidate quality passed: `True`
- Queue quality passed: `True`

Targeted slots before collection:

- 컬러그램 / brow: before 5/10, gap 5, queries `컬러그램 아이브로우 | 컬러그램 브로우 | 컬러그램 브로우카라 | 컬러그램 아이브로우 펜슬 | 컬러그램 눈썹 | 컬러그램 오토브로우`

Reject reasons:

- brand_not_whitelisted: 182

Remaining underfilled slots:

- None

Safety notes:

- Naver Shopping API was used for product candidate metadata only.
- No raw detail HTML, raw reviews, or original product images were stored.
- Detail collection remains a separate Phase D fetch with no login/captcha bypass.
