# Auradin Naver Offer Metadata Collection

- Output: `data/auradin/detail/retail_expanded/naver_offer_metadata_20260705_probe.jsonl`
- Candidate rows attempted this run: 50
- Rows: 50
- Rows with fields: 50
- Collection status: `{"collected_partial": 50}`
- Fetch status: `{"200": 50}`
- Field counts: `{"finish": 9, "sellingPoints": 9, "shadeOptions": 21, "texture": 50}`

## Brand Rows

| Brand | Rows |
|---|---:|
| VDL | 1 |
| 네이밍 | 5 |
| 더샘 | 4 |
| 데이지크 | 5 |
| 라카 | 9 |
| 뮤드 | 6 |
| 에뛰드 | 5 |
| 에스쁘아 | 4 |
| 웨이크메이크 | 4 |
| 정샘물 뷰티 | 7 |

## Notes

- Source is the official Naver Shopping Search API, queried from existing Auradin candidate product names.
- Only positive OliveYoung or department-store listing evidence is retained; missing offers do not become negative listing claims.
- Matched offer titles can contribute low-confidence shadeOptions, finish, texture, and selling-point hints; these remain below the hard-filter cutoff unless another stronger source confirms them.
- Offer title, mallName, productId, link, and matchScore are stored as short evidence only; raw API payloads, reviews, ingredients, and images are not stored.
