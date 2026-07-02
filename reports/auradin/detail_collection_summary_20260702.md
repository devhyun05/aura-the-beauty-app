# Auradin Phase D Detail Collection Summary

- Input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/enriched/enriched_products_20260702_all.jsonl`
- Targets: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/targets/detail_collection_targets_20260702.csv`
- Fetch output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/raw_extracted/detail_fetch_results_20260702.jsonl`
- Playwright output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/raw_extracted/detail_playwright_results_20260702.jsonl`
- Structured output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/structured/structured_extraction_20260702.jsonl`
- Normalized output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/detail_collection_results_20260702.jsonl`
- Catalog candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_candidates_20260702.jsonl`
- Product knowledge documents: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/embeddings/product_knowledge_documents_20260702.jsonl`
- Quality CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/detail_collection_quality_20260702.csv`
- Failures CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/detail_collection_failures_20260702.csv`
- Chrome failure investigation: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/chrome_failure_investigation_20260702.md`
- Target rows attempted: 64
- Catalog item candidates: 107
- Embedding-ready documents: 410
- OpenAI Structured Extraction: skipped, OPENAI_API_KEY missing; rule-based structured fallback used

Collection status:

- `collected_complete`: 4
- `collected_partial`: 40
- `failed`: 20

Fetch status:

- `fetched`: 5
- `http_error`: 19
- `playwright_rendered`: 40

Domain counts:

- `chicor.com`: 3
- `gate.halfclub.com`: 2
- `m.a-bly.com`: 17
- `www.oliveyoung.co.kr`: 42

Failure reasons:

- `http_status:403`: 19
- `no_useful_data`: 1

Safety notes:

- Raw HTML was parsed in memory only and was not stored.
- Raw reviews were not fetched or stored.
- Original product images were not downloaded.
- Login, captcha, and security challenge bypass was not attempted.
- Missing values were left empty instead of invented.
- Chrome plugin investigation was attempted for repeated failure patterns, but the Chrome extension backend was unavailable in this session.
