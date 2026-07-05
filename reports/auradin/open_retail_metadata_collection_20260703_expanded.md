# Auradin Open Retail Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail_expanded/open_retail_metadata_20260703.jsonl`
- Candidate rows attempted this run: 39
- Rows: 39
- Rows with fields: 32
- Collection status: `{"collected_partial": 32, "not_found": 7}`
- Fetch status: `{"200": 39}`
- Field counts: `{"brandCountry": 4, "colorFamily": 5, "departmentStoreListed": 14, "finish": 14, "intensity": 2, "madeInCountry": 7, "sellingPoints": 10, "shadeOptions": 5, "suitableFor": 4, "texture": 22, "undertone": 5}`

## Domain Rows

| Domain | Rows |
|---|---:|
| hi.thehyundai.com | 7 |
| link.musinsa.com | 4 |
| www.11st.co.kr | 19 |
| www.poom.co.kr | 2 |
| www.shinsegaetvshopping.com | 7 |

## Notes

- Sources are public product pages reached from existing Naver live-offer URLs.
- The adapter covers TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, and 11st when public metadata is directly available.
- Only structured fields and short evidence snippets are retained; raw HTML, reviews, ingredients, and images are not stored.
- Lotteimall direct detail pages returned 403 in smoke and are intentionally not included here.
