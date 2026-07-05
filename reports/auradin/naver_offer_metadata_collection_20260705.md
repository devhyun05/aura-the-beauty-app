# Auradin Naver Offer Metadata Collection

- Output: `data/auradin/detail/retail_expanded/naver_offer_metadata_20260705.jsonl`
- Candidate rows attempted this run: 483
- Rows: 483
- Rows with fields: 454
- Collection status: `{"collected_partial": 454, "not_found": 29}`
- Fetch status: `{"200": 483}`
- Field counts: `{"finish": 157, "sellingPoints": 165, "shadeOptions": 211, "texture": 430}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 2 |
| VDL | 32 |
| 네이밍 | 48 |
| 더샘 | 27 |
| 데이지크 | 47 |
| 라카 | 29 |
| 롬앤 | 24 |
| 뮤드 | 46 |
| 에뛰드 | 31 |
| 에스쁘아 | 7 |
| 웨이크메이크 | 23 |
| 정샘물 뷰티 | 40 |
| 컬러그램 | 33 |
| 클리오 | 25 |
| 투쿨포스쿨 | 36 |
| 페리페라 | 15 |
| 하트퍼센트 | 18 |

## Notes

- Source is the official Naver Shopping Search API, queried from existing Auradin candidate product names.
- Only positive OliveYoung or department-store listing evidence is retained; missing offers do not become negative listing claims.
- Matched offer titles can contribute low-confidence shadeOptions, finish, texture, and selling-point hints; these remain below the hard-filter cutoff unless another stronger source confirms them.
- Offer title, mallName, productId, link, and matchScore are stored as short evidence only; raw API payloads, reviews, ingredients, and images are not stored.
