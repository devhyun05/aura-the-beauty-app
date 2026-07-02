# Auradin Brand x Category Top10 Data Quality Review (20260702)

## Dataset And Grain

- Primary dataset: `data/auradin/catalog/brand_category_top10_products_20260702.jsonl`.
- Grain: one row per brand x category x rank candidate product.
- Expected grain key: `brand`, `category`, `rankInBrandCategory`.
- Intended use: product retrieval and embedding seed data for Auradin cosmetic search/recommendation.

## Checks Performed

- Row count and slot coverage against 17 brands x 6 categories x top 10.
- Composite grain uniqueness by brand, category, rank.
- Brand/category distribution balance.
- Detail collection status and failure reason profiling.
- Required metadata presence for product name, brand, category, source URL, rank, brand country, retail status.
- Embedding document coverage for one `top10_core` chunk per product.
- Field sparsity for finish, texture, shade options, selling points, and suitable-for tags.

## Findings

### 1. Top10 coverage passed

- Evidence: 1,020 rows; 102 brand-category slots; every slot has exactly 10 rows.
- Composite key check: 1,020 unique `(brand, category, rankInBrandCategory)` keys; duplicate keys 0.
- Required metadata check: missing product name, brand, category, source URL, or brand country 0.
- Category counts: each of base, brow, cheek, liner, lip, shadow has 170 rows.
- Brand counts: every configured brand has 60 rows.
- Severity: none.
- Confidence: high.

### 2. Detail attributes are sparse

- Evidence: 737 rows were blocked before detail fetch by robots rules; 283 rows were attempted; 45 complete, 46 partial, 192 failed.
- Field coverage: finish 84/1,020, texture 209/1,020, shade options 46/1,020, selling points 84/1,020, suitable-for tags 24/1,020.
- Why it matters: product discovery by brand/category/top rank is usable, but shade/finish/suitability-based recommendations will be incomplete unless retrieval tolerates missing detail fields.
- Severity: high for shade-aware recommendation; medium for brand/category product search.
- Confidence: high.
- Suggested remediation: add official brand-page and retailer-specific fallback adapters for top products whose partner URLs are blocked or return 403.

### 3. Failed detail fetches are concentrated in a few domains

- Evidence: 192 Phase D failures; HTTP 403 accounts for 188. Failed domains: Olive Young 104, ABLY 84, Naver Shopping 2, KShop 1, 29CM 1.
- Why it matters: more retries with the same generic fetch path will not materially improve coverage.
- Severity: medium.
- Confidence: high.
- Suggested remediation: route these domains to allowed public metadata alternatives, official product pages, or manual review instead of repeated generic crawling.

### 4. OpenAI Structured Extraction was not available

- Evidence: `OPENAI_API_KEY` was not configured; Phase D report records rule-based fallback.
- Why it matters: rule-based extraction is deterministic and inspectable, but less robust for nuanced claims, suitability language, and shade parsing.
- Severity: medium.
- Confidence: high.
- Suggested remediation: configure OpenAI extraction and rerun it over the normalized detail text or future source adapter outputs.

### 5. First targeted raw Naver payload was overwritten

- Evidence: targeted collection pass 1 and pass 2 wrote to the same raw/report path; final merged candidates preserve accepted results, but pass 1 raw API metadata is not preserved as a separate raw file.
- Why it matters: final product coverage is not affected, but exact raw lineage for the first targeted pass is weaker than ideal.
- Severity: low for current modeling; medium for auditability.
- Confidence: high.
- Suggested remediation: add a run label or timestamp suffix to targeted raw/report outputs before future multi-pass collection.

## Recommended Automated Tests

- Assert snapshot row count is exactly 1,020 for the configured brand/category set.
- Assert each brand-category slot has exactly 10 rows.
- Assert `(brand, category, rankInBrandCategory)` is unique and complete.
- Assert every snapshot row has `productName`, `brand`, `category`, `sourceUrl`, `brandCountry`, `oliveYoungStatus`, and `departmentStoreStatus`.
- Assert every snapshot row has exactly one `top10_core` embedding document.
- Track detail field coverage rates over time, but do not hard-fail on sparse finish/shade fields until source adapters improve.

## Assumptions

- “메이커” is treated as the normalized brand whitelist used by the Auradin catalog pipeline.
- Top10 rank is based on Naver Shopping relevance/popularity scoring after deduplication and targeted query expansion.
- Blocked detail pages should not be bypassed through login, captcha, or anti-bot circumvention.
