# Auradin Limited Detail Field Audit (20260703)

## Input Grain

- Top10 input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/brand_category_top10_products_20260702.jsonl`
- Prior detail input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/detail_collection_results_20260702_brand_category_top10.jsonl`
- Grain: brand x category x rank candidate product, not a completed product-detail catalog.
- Rows: 1020
- Category counts: `{"base": 170, "brow": 170, "cheek": 170, "liner": 170, "lip": 170, "shadow": 170}`
- Detail collection status: `{"collected_complete": 45, "collected_partial": 46, "failed": 192, "not_attempted": 737}`

## Current 7-Field Baseline

| Field | Filled rows | Fill rate | Notes |
|---|---:|---:|---|
| shadeOptions | 46 | 4.5% | option/shade evidence only |
| colorFamily / undertone / intensity | 0 | 0.0% | absent in current snapshot |
| finish | 84 | 8.2% | mixed prior detail/title extraction |
| texture | 209 | 20.5% | mixed prior detail/title extraction |
| suitableFor | 24 | 2.4% | sparse |
| sellingPoints | 84 | 8.2% | sparse |
| price / purchase URL / image | 1020 | 100.0% | Naver live-offer level |
| Olive Young listed | 120 | 11.8% | positive evidence only; unknown is not negative evidence |
| department-store-related listed | 65 | 6.4% | positive evidence only; unknown is not negative evidence |
| brandCountry | 1020 | 100.0% | configured brand whitelist |

## Target Priority

- Target CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/targets/limited_detail_targets_20260703.csv`
- Selected batch: rank <= 10; categories `cheek, lip, shadow`; at least 3 missing core demo fields.
- Selected rows: 501
- Missing field-group counts in full target queue: `{"color_tone_intensity": 1020, "finish_texture": 965, "retail_presence": 835, "shade_options": 974, "suitable_selling": 1013}`

## Safety Rules Applied

- Core fields below confidence 0.65 are marked `hardFilterEligible=false`.
- Existing Top10 rows remain labeled as Naver brand/category candidate slots.
- Generic fetch is not retried for prior 403/security-challenge rows.
- Unknown retail presence is not converted into a negative listing claim.
- No review text, ingredients, raw HTML, raw images, colorHex, or colorLab are produced.
