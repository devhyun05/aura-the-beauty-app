# Auradin Open Retail Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail/open_retail_metadata_20260703.jsonl`
- Candidate rows attempted this run: 18
- Rows: 18
- Rows with fields: 18
- Collection status: `{"collected_partial": 18}`
- Fetch status: `{"200": 18}`
- Field counts: `{"brandCountry": 2, "colorFamily": 5, "departmentStoreListed": 10, "finish": 11, "intensity": 1, "madeInCountry": 5, "sellingPoints": 9, "shadeOptions": 5, "suitableFor": 2, "texture": 13, "undertone": 5}`

## Domain Rows

| Domain | Rows |
|---|---:|
| hi.thehyundai.com | 5 |
| link.musinsa.com | 2 |
| www.11st.co.kr | 4 |
| www.poom.co.kr | 2 |
| www.shinsegaetvshopping.com | 5 |

## Notes

- Sources are public product pages reached from existing Naver live-offer URLs.
- The adapter covers TheHyundai, Shinsegae TV Shopping, Musinsa, POOM, and 11st when public metadata is directly available.
- Only structured fields and short evidence snippets are retained; raw HTML, reviews, ingredients, and images are not stored.
- Lotteimall direct detail pages returned 403 in smoke and are intentionally not included here.
