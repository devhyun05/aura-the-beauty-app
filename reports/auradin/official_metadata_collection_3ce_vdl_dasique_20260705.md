# Auradin Official Metadata Collection

- Output: `data/auradin/detail/official_expanded/official_metadata_3ce_vdl_dasique_20260705.jsonl`
- Rows: 180
- Rows with fields: 81
- Collection status: `{"collected_partial": 81, "not_found": 99}`
- Field counts: `{"colorFamily": 34, "finish": 63, "intensity": 47, "madeInCountry": 27, "sellingPoints": 52, "shadeOptions": 60, "suitableFor": 18, "texture": 64, "undertone": 26}`

## Output Brand Rows

| Brand | Rows | Rows with fields |
|---|---:|---:|
| 3CE | 60 | 26 |
| VDL | 60 | 27 |
| 데이지크 | 60 | 28 |

## Current Run Source Attempts

This section lists only the sources attempted in the latest collector run. Output rows may also include preserved rows from `--merge-existing`.

### 데이지크

- Sitemap: `https://dasique.com/sitemap.xml`
- Child sitemaps fetched: 5
- Extra index pages fetched: 0
- Product URLs discovered: 61
- Product URLs title-indexed: 0
- Candidate rows: 60
- Matched rows: 28
- Collected rows: 28

### 3CE

- Sitemap: `https://www.3cecosmetics.com/sitemap.xml`
- Child sitemaps fetched: 0
- Extra index pages fetched: 0
- Product URLs discovered: 111
- Product URLs title-indexed: 0
- Candidate rows: 60
- Matched rows: 26
- Collected rows: 26

### VDL

- Sitemap: `https://www.vdlcosmetics.com/index.jsp`
- Child sitemaps fetched: 0
- Extra index pages fetched: 0
- Product URLs discovered: 34
- Product URLs title-indexed: 0
- Candidate rows: 60
- Matched rows: 27
- Collected rows: 27

## Safety Notes

- Official product pages and sitemaps were parsed in memory only.
- Raw HTML, raw reviews, ingredients, and product images were not stored.
- Board/review/member/admin/API paths were not fetched.
- Values from official keyword metadata are still stored with confidence and evidence, not as unconditional truth.
