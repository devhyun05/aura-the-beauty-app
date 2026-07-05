# Auradin Limited Detail Collection Summary (20260703)

## Outputs

- Field audit: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/limited_detail_field_audit_20260703.md`
- Target queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/targets/limited_detail_targets_20260703.csv`
- Official metadata input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/official/official_metadata_20260703.jsonl`
- Retail metadata input: `data/auradin/detail/retail_expanded`
- Extra retail metadata inputs: `data/auradin/detail/retail_expanded/oliveyoung_metadata_20260705.jsonl, data/auradin/detail/retail_expanded/naver_offer_metadata_20260705.jsonl, data/auradin/detail/retail_expanded/oliveyoung_metadata_slow_retry_20260705.jsonl`
- Normalized limited results: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/limited_detail_results_20260703.jsonl`
- ProductCatalogItem seed: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_seed_20260703.jsonl`
- ProductKnowledgeDocument seed: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_docs_20260703.jsonl`

## Batch Scope

- Normalized result rows: 501
- Catalog seed rows: 501
- Knowledge docs: 1002
- Scope: selected categories `cheek, lip, shadow` from the Naver brand/category Top10 list; rank <= 10; missing core demo fields >= 3; source grain remains Naver brand/category Top10 candidate, not a completed detail catalog.
- Category rows: `{"cheek": 167, "lip": 167, "shadow": 167}`
- Collection row status: `{"complete": 5, "partial": 496}`
- Prior source class: `{"blocked": 101, "manual_review_needed": 358, "not_found": 42}`
- Official metadata status: `{"collected_partial": 342, "not_collected": 159}`
- Retail metadata status: `{"collected_partial": 493, "not_collected": 8}`
- Official source URLs used: 119
- Retail source URLs used: 357
- Manual review needed: 198

## 7 Field-Group Fill Rates

| Field group | Complete | Partial | Any hard-filter eligible | Total |
|---|---:|---:|---:|---:|
| shade_options | 470 (93.8%) | 0 (0.0%) | 425 (84.8%) | 501 |
| color_tone_intensity | 206 (41.1%) | 241 (48.1%) | 155 (30.9%) | 501 |
| finish_texture | 372 (74.3%) | 123 (24.6%) | 392 (78.2%) | 501 |
| suitable_selling | 273 (54.5%) | 176 (35.1%) | 277 (55.3%) | 501 |
| live_offer | 501 (100.0%) | 0 (0.0%) | 501 (100.0%) | 501 |
| retail_presence | 41 (8.2%) | 239 (47.7%) | 280 (55.9%) | 501 |
| brand_origin | 287 (57.3%) | 214 (42.7%) | 501 (100.0%) | 501 |

## Evidence Source Mix

`{"ably_jsonld_product_text": 24, "brand_whitelist_config": 501, "chicor_product_option_json": 21, "chicor_product_text": 9, "elevenst_product_text": 3, "gsshop_product_info_table": 24, "gsshop_product_option_html": 64, "gsshop_product_text": 42, "hmall_next_stock_option": 50, "hmall_product_text": 40, "lotteon_product_api": 476, "lotteon_product_api_option": 115, "lotteon_product_api_title": 204, "musinsa_product_state": 4, "naver_live_offer": 1503, "naver_offer_retail_presence": 104, "naver_offer_title_inferred": 111, "naver_offer_title_option_inferred": 12, "official_brand_page": 645, "official_brand_page_option_html": 410, "official_brand_page_option_json": 150, "official_brand_page_product_info": 159, "official_brand_page_title": 3, "oliveyoung_goods_no_discovery:naver_offer_metadata_matchedPositiveOffers": 55, "oliveyoung_goods_no_discovery:naver_shopping_search": 46, "oliveyoung_goods_no_discovery:purchase_url_goods_no": 2, "oliveyoung_product_option_json": 146, "oliveyoung_product_page_text": 125, "oliveyoung_public_product_page": 73, "prior_detail": 11, "retail_presence_from_live_offer": 31, "shade_option_text_inferred": 120, "shade_option_tone_inferred": 273, "shinsegaetv_product_text": 7, "shinsegaetv_property_value": 4, "shinsegaetv_public_product_page": 5, "thehyundai_next_option": 15, "thehyundai_product_text": 7, "thehyundai_public_product_page": 5, "title_rule_inferred": 48, "wconcept_color_option_select": 46, "wconcept_product_summary": 25, "wconcept_product_text": 14}`

## Official Metadata Contribution

- Official field counts: `{"colorFamily": 189, "finish": 158, "intensity": 105, "madeInCountry": 159, "sellingPoints": 154, "shadeOptions": 191, "suitableFor": 65, "texture": 163, "undertone": 183}`
- Official metadata came from public brand sitemaps and product-page meta/keyword content only.
- Generic promotional keywords were filtered out of `shadeOptions`; removed examples include makeup-use copy, mascara cross-sell keywords, and non-option tone labels.

## Retail Metadata Contribution

- Retail field counts: `{"colorFamily": 207, "departmentStoreListed": 142, "finish": 217, "intensity": 43, "madeInCountry": 128, "oliveYoungListed": 179, "sellingPoints": 166, "shadeOptions": 279, "suitableFor": 50, "texture": 311, "undertone": 187}`
- Retail metadata came from public OliveYoung, LotteON, W Concept, Chicor, GS Shop, Hmall, Ably, TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, 11st, and Naver Shopping API alternative offer metadata reachable from existing candidate product names.
- Retail HTML/API payloads are parsed in memory only; raw pages, reviews, ingredients, and images are not stored.

## Fields Not Safe For Hard Filters

`{"colorFamily": 301, "finish": 91, "intensity": 232, "sellingPoints": 75, "shadeOptions": 45, "suitableFor": 294, "texture": 163, "undertone": 358}`

## Collection Notes

- Price, purchase URL, image, and positive channel listing evidence come from existing Naver live-offer/source URL metadata.
- Official brand pages are used for limited metadata enrichment when matched by public sitemap/product URL; raw HTML is parsed in memory only and not stored.
- Prior detail extraction is reused only where already available; previous 403/security-challenge paths are marked blocked/manual-review instead of retried.
- Title-rule values are retained as low-confidence inferred evidence and are excluded from hard filters when confidence is below cutoff.
- Brand country is from the configured brand whitelist; manufacturing country is not newly collected by the OliveYoung-focused collector.
- This output is a search/retrieval seed, not a completed shade-level product catalog.
