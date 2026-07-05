# Auradin Naver Offer Metadata Collection

- Output: `data/auradin/detail/retail_expanded/naver_offer_metadata_20260703.jsonl`
- Candidate rows attempted this run: 0
- Rows: 835
- Rows with fields: 818
- Collection status: `{"collected_partial": 818, "not_found": 17}`
- Fetch status: `{"reused_existing_offers": 835}`
- Field counts: `{"departmentStoreListed": 212, "finish": 247, "oliveYoungListed": 123, "sellingPoints": 268, "shadeOptions": 277, "texture": 753}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 29 |
| VDL | 46 |
| 네이밍 | 53 |
| 더샘 | 52 |
| 데이지크 | 58 |
| 라카 | 50 |
| 롬앤 | 47 |
| 뮤드 | 59 |
| 에뛰드 | 57 |
| 에스쁘아 | 49 |
| 웨이크메이크 | 45 |
| 정샘물 뷰티 | 57 |
| 컬러그램 | 41 |
| 클리오 | 43 |
| 투쿨포스쿨 | 50 |
| 페리페라 | 46 |
| 하트퍼센트 | 53 |

## Notes

- Source is the official Naver Shopping Search API, queried from existing Auradin candidate product names.
- Only positive OliveYoung or department-store listing evidence is retained; missing offers do not become negative listing claims.
- Matched offer titles can contribute low-confidence shadeOptions, finish, texture, and selling-point hints; these remain below the hard-filter cutoff unless another stronger source confirms them.
- Offer title, mallName, productId, link, and matchScore are stored as short evidence only; raw API payloads, reviews, ingredients, and images are not stored.
