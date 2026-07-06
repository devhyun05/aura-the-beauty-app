# Auradin LotteON Metadata Collection

- Output: `data/auradin/detail/retail_expanded/lotteon_metadata_20260703.jsonl`
- Candidate rows attempted this run: 357
- Rows: 357
- Rows with fields: 356
- Collection status: `{"collected_partial": 356, "not_found": 1}`
- Fetch status: `{"200": 357}`
- Field counts: `{"colorFamily": 205, "finish": 168, "intensity": 17, "madeInCountry": 154, "sellingPoints": 134, "shadeOptions": 329, "suitableFor": 108, "texture": 236, "undertone": 166}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 24 |
| VDL | 7 |
| 네이밍 | 21 |
| 더샘 | 46 |
| 데이지크 | 26 |
| 라카 | 31 |
| 롬앤 | 9 |
| 뮤드 | 27 |
| 에뛰드 | 27 |
| 에스쁘아 | 10 |
| 웨이크메이크 | 45 |
| 정샘물 뷰티 | 8 |
| 컬러그램 | 22 |
| 클리오 | 12 |
| 투쿨포스쿨 | 15 |
| 페리페라 | 5 |
| 하트퍼센트 | 22 |

## Notes

- Source is public LotteON product base-detail JSON and JSON-LD fallback from existing Naver live-offer URLs.
- Only allowed product properties are retained: option labels, explicit single-shade title tails, form/type/effect/feature/spec/manufacturing country.
- Review summaries in LotteON payloads are ignored and not stored.
- Ingredient text, review text, raw HTML, and images are not stored.
