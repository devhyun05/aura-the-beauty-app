# Auradin Limited Detail Collection Summary (20260708)

## Outputs

- Field audit: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/limited_detail_field_audit_20260708.md`
- Target queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/targets/limited_detail_targets_20260708.csv`
- Official metadata input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/official/official_metadata_20260708.jsonl`
- Retail metadata input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail`
- Extra retail metadata inputs: ``
- Normalized limited results: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/limited_detail_results_20260708.jsonl`
- ProductCatalogItem seed: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_seed_20260708.jsonl`
- ProductKnowledgeDocument seed: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_docs_20260708.jsonl`

## Batch Scope

- Normalized result rows: 1010
- Catalog seed rows: 1010
- Knowledge docs: 2020
- Scope: selected categories `base, brow, cheek, liner, lip, shadow` from the Naver brand/category Top10 list; rank <= 60; missing core demo fields >= 3; source grain remains Naver brand/category Top10 candidate, not a completed detail catalog.
- Category rows: `{"base": 169, "brow": 170, "cheek": 167, "liner": 170, "lip": 167, "shadow": 167}`
- Collection row status: `{"partial": 1010}`
- Prior source class: `{"blocked": 189, "manual_review_needed": 737, "not_found": 84}`
- Official metadata status: `{"not_collected": 1010}`
- Retail metadata status: `{"not_collected": 1010}`
- Official source URLs used: 0
- Retail source URLs used: 0
- Manual review needed: 1000

## 7 Field-Group Fill Rates

| Field group | Complete | Partial | Any hard-filter eligible | Total |
|---|---:|---:|---:|---:|
| shade_options | 71 (7.0%) | 0 (0.0%) | 0 (0.0%) | 1010 |
| color_tone_intensity | 11 (1.1%) | 176 (17.4%) | 0 (0.0%) | 1010 |
| finish_texture | 243 (24.1%) | 576 (57.0%) | 0 (0.0%) | 1010 |
| suitable_selling | 15 (1.5%) | 284 (28.1%) | 0 (0.0%) | 1010 |
| live_offer | 1010 (100.0%) | 0 (0.0%) | 1010 (100.0%) | 1010 |
| retail_presence | 0 (0.0%) | 185 (18.3%) | 185 (18.3%) | 1010 |
| brand_origin | 0 (0.0%) | 1010 (100.0%) | 1010 (100.0%) | 1010 |

## Evidence Source Mix

`{"brand_whitelist_config": 1010, "naver_live_offer": 3030, "retail_presence_from_live_offer": 185, "shade_option_text_inferred": 10, "shade_option_tone_inferred": 15, "title_rule_inferred": 1753}`

## Official Metadata Contribution

- Official field counts: `{}`
- Official metadata came from public brand sitemaps and product-page meta/keyword content only.
- Generic promotional keywords were filtered out of `shadeOptions`; removed examples include makeup-use copy, mascara cross-sell keywords, and non-option tone labels.

## Retail Metadata Contribution

- Retail field counts: `{"departmentStoreListed": 65, "oliveYoungListed": 120}`
- Retail metadata came from public OliveYoung, LotteON, W Concept, Chicor, GS Shop, Hmall, Ably, TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, 11st, and Naver Shopping API alternative offer metadata reachable from existing candidate product names.
- Retail HTML/API payloads are parsed in memory only; raw pages, reviews, ingredients, and images are not stored.

## Fields Not Safe For Hard Filters

`{"colorFamily": 162, "finish": 254, "intensity": 31, "sellingPoints": 273, "shadeOptions": 71, "suitableFor": 41, "texture": 808, "undertone": 138}`

## Collection Notes

- Price, purchase URL, image, and positive channel listing evidence come from existing Naver live-offer/source URL metadata.
- Official brand pages are used for limited metadata enrichment when matched by public sitemap/product URL; raw HTML is parsed in memory only and not stored.
- Prior detail extraction is reused only where already available; previous 403/security-challenge paths are marked blocked/manual-review instead of retried.
- Title-rule values are retained as low-confidence inferred evidence and are excluded from hard filters when confidence is below cutoff.
- Brand country is from the configured brand whitelist; manufacturing country is not newly collected by the OliveYoung-focused collector.
- This output is a search/retrieval seed, not a completed shade-level product catalog.
