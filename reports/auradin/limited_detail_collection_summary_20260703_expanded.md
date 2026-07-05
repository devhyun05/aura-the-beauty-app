# Auradin Limited Detail Collection Summary (expanded)

## Outputs

- Field audit: `reports/auradin/limited_detail_field_audit_20260703_expanded.md`
- Target queue: `data/auradin/detail/targets/limited_detail_targets_20260703_expanded.csv`
- Official metadata input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/official/official_metadata_20260703.jsonl`
- Retail metadata input: `data/auradin/detail/retail_expanded`
- Extra retail metadata inputs: `data/auradin/detail/retail_expanded/oliveyoung_metadata_20260705.jsonl, data/auradin/detail/retail_expanded/naver_offer_metadata_20260705.jsonl, data/auradin/detail/retail_expanded/oliveyoung_metadata_slow_retry_20260705.jsonl`
- Normalized limited results: `data/auradin/detail/normalized/limited_detail_results_20260703_expanded.jsonl`
- ProductCatalogItem seed: `data/auradin/catalog/catalog_items_seed_20260703_expanded.jsonl`
- ProductKnowledgeDocument seed: `data/auradin/knowledge/product_knowledge_docs_20260703_expanded.jsonl`

## Batch Scope

- Normalized result rows: 1020
- Catalog seed rows: 1020
- Knowledge docs: 2040
- Scope: selected categories `base, brow, cheek, liner, lip, shadow` from the Naver brand/category Top10 list; rank <= 10; missing core demo fields >= 0; source grain remains Naver brand/category Top10 candidate, not a completed detail catalog.
- Category rows: `{"base": 170, "brow": 170, "cheek": 170, "liner": 170, "lip": 170, "shadow": 170}`
- Collection row status: `{"complete": 5, "partial": 1015}`
- Prior source class: `{"blocked": 189, "manual_review_needed": 737, "not_found": 94}`
- Official metadata status: `{"collected_partial": 345, "not_collected": 675}`
- Retail metadata status: `{"collected_partial": 998, "not_collected": 22}`
- Official source URLs used: 119
- Retail source URLs used: 625
- Manual review needed: 677

## 7 Field-Group Fill Rates

| Field group | Complete | Partial | Any hard-filter eligible | Total |
|---|---:|---:|---:|---:|
| shade_options | 802 (78.6%) | 0 (0.0%) | 662 (64.9%) | 1020 |
| color_tone_intensity | 371 (36.4%) | 389 (38.1%) | 308 (30.2%) | 1020 |
| finish_texture | 452 (44.3%) | 501 (49.1%) | 522 (51.2%) | 1020 |
| suitable_selling | 337 (33.0%) | 396 (38.8%) | 364 (35.7%) | 1020 |
| live_offer | 1020 (100.0%) | 0 (0.0%) | 1020 (100.0%) | 1020 |
| retail_presence | 84 (8.2%) | 453 (44.4%) | 537 (52.6%) | 1020 |
| brand_origin | 425 (41.7%) | 595 (58.3%) | 1020 (100.0%) | 1020 |

## Evidence Source Mix

`{"ably_jsonld_product_text": 24, "brand_whitelist_config": 1020, "chicor_product_option_json": 74, "chicor_product_text": 35, "elevenst_product_text": 14, "gsshop_product_info_table": 53, "gsshop_product_option_html": 143, "gsshop_product_text": 71, "hmall_next_stock_option": 61, "hmall_product_text": 48, "lotteon_product_api": 774, "lotteon_product_api_option": 215, "lotteon_product_api_title": 418, "musinsa_product_state": 5, "naver_api": 5, "naver_live_offer": 3060, "naver_offer_retail_presence": 221, "naver_offer_title_inferred": 467, "naver_offer_title_option_inferred": 93, "official_brand_page": 654, "official_brand_page_option_html": 419, "official_brand_page_option_json": 150, "official_brand_page_product_info": 162, "official_brand_page_title": 3, "oliveyoung_goods_no_discovery:naver_offer_metadata_matchedPositiveOffers": 113, "oliveyoung_goods_no_discovery:naver_shopping_search": 101, "oliveyoung_goods_no_discovery:purchase_url_goods_no": 48, "oliveyoung_product_option_json": 146, "oliveyoung_product_page_text": 125, "oliveyoung_public_product_page": 73, "prior_detail": 41, "prior_detail_option": 3, "retail_presence_from_live_offer": 51, "shade_option_text_inferred": 433, "shade_option_tone_inferred": 389, "shinsegaetv_product_text": 9, "shinsegaetv_property_value": 6, "shinsegaetv_public_product_page": 7, "structured_extraction": 8, "thehyundai_next_option": 15, "thehyundai_product_text": 9, "thehyundai_public_product_page": 7, "title_rule_inferred": 253, "wconcept_color_option_select": 124, "wconcept_product_summary": 54, "wconcept_product_text": 22}`

## Official Metadata Contribution

- Official field counts: `{"colorFamily": 192, "finish": 161, "intensity": 108, "madeInCountry": 162, "sellingPoints": 154, "shadeOptions": 194, "suitableFor": 65, "texture": 166, "undertone": 186}`
- Official metadata came from public brand sitemaps and product-page meta/keyword content only.
- Generic promotional keywords were filtered out of `shadeOptions`; removed examples include makeup-use copy, mascara cross-sell keywords, and non-option tone labels.

## Retail Metadata Contribution

- Retail field counts: `{"colorFamily": 371, "departmentStoreListed": 277, "finish": 298, "intensity": 60, "madeInCountry": 263, "oliveYoungListed": 344, "sellingPoints": 275, "shadeOptions": 594, "suitableFor": 105, "texture": 715, "undertone": 324}`
- Retail metadata came from public OliveYoung, LotteON, W Concept, Chicor, GS Shop, Hmall, Ably, TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, 11st, and Naver Shopping API alternative offer metadata reachable from existing candidate product names.
- Retail HTML/API payloads are parsed in memory only; raw pages, reviews, ingredients, and images are not stored.

## Fields Not Safe For Hard Filters

`{"colorFamily": 461, "finish": 138, "intensity": 440, "sellingPoints": 198, "shadeOptions": 140, "suitableFor": 418, "texture": 497, "undertone": 583}`

## Collection Notes

- Price, purchase URL, image, and positive channel listing evidence come from existing Naver live-offer/source URL metadata.
- Official brand pages are used for limited metadata enrichment when matched by public sitemap/product URL; raw HTML is parsed in memory only and not stored.
- Prior detail extraction is reused only where already available; previous 403/security-challenge paths are marked blocked/manual-review instead of retried.
- Title-rule values are retained as low-confidence inferred evidence and are excluded from hard filters when confidence is below cutoff.
- Brand country is from the configured brand whitelist; manufacturing country is not newly collected by the OliveYoung-focused collector.
- This output is a search/retrieval seed, not a completed shade-level product catalog.
