# Auradin Phase D Detail Collection Summary

- Input: `data/auradin/enriched/enriched_products_brand_category_top10_20260702.jsonl`
- Targets: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/targets/detail_collection_targets_20260702_brand_category_top10.csv`
- Fetch output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/raw_extracted/detail_fetch_results_20260702_brand_category_top10.jsonl`
- Playwright output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/raw_extracted/detail_playwright_results_20260702_brand_category_top10.jsonl`
- Structured output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/structured/structured_extraction_20260702_brand_category_top10.jsonl`
- Normalized output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/detail_collection_results_20260702_brand_category_top10.jsonl`
- Catalog candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_candidates_20260702_brand_category_top10.jsonl`
- Product knowledge documents: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/embeddings/product_knowledge_documents_20260702_brand_category_top10.jsonl`
- Quality CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/detail_collection_quality_20260702_brand_category_top10.csv`
- Failures CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/detail_collection_failures_20260702_brand_category_top10.csv`
- Target rows attempted: 283
- Catalog item candidates: 472
- Embedding-ready documents: 1900
- OpenAI Structured Extraction: skipped, OPENAI_API_KEY missing; rule-based structured fallback used

Collection status:

- `collected_complete`: 45
- `collected_partial`: 46
- `failed`: 192

Fetch status:

- `fetched`: 78
- `http_error`: 188
- `playwright_rendered`: 16
- `security_challenge`: 1

Domain counts:

- `chicor.com`: 41
- `clubclio.co.kr`: 1
- `gate.boribori.co.kr`: 1
- `gate.halfclub.com`: 10
- `m.a-bly.com`: 84
- `product.29cm.co.kr`: 1
- `shopping.naver.com`: 14
- `www.jsmbeauty.com`: 2
- `www.kshop.co.kr`: 2
- `www.oliveyoung.co.kr`: 120
- `www.poom.co.kr`: 2
- `www.w-shopping.co.kr`: 3
- `zigzag.kr`: 2

Failure reasons:

- `http_status:403`: 188
- `no_useful_data`: 3
- `security_challenge_no_bypass`: 1

Safety notes:

- Raw HTML was parsed in memory only and was not stored.
- Raw reviews were not fetched or stored.
- Original product images were not downloaded.
- Login, captcha, and security challenge bypass was not attempted.
- Missing values were left empty instead of invented.
