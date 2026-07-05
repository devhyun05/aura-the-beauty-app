# Auradin LotteON Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail/lotteon_metadata_20260703.jsonl`
- Candidate rows attempted this run: 186
- Rows: 186
- Rows with fields: 186
- Collection status: `{"collected_partial": 186}`
- Fetch status: `{"200": 186}`
- Field counts: `{"colorFamily": 113, "finish": 130, "intensity": 9, "madeInCountry": 77, "sellingPoints": 117, "shadeOptions": 178, "suitableFor": 55, "texture": 129, "undertone": 95}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 9 |
| VDL | 4 |
| 네이밍 | 10 |
| 더샘 | 23 |
| 데이지크 | 15 |
| 라카 | 14 |
| 롬앤 | 6 |
| 뮤드 | 19 |
| 에뛰드 | 10 |
| 에스쁘아 | 7 |
| 웨이크메이크 | 22 |
| 정샘물 뷰티 | 2 |
| 컬러그램 | 13 |
| 클리오 | 8 |
| 투쿨포스쿨 | 9 |
| 페리페라 | 2 |
| 하트퍼센트 | 13 |

## Notes

- Source is public LotteON product base-detail JSON and JSON-LD fallback from existing Naver live-offer URLs.
- Only allowed product properties are retained: option labels, explicit single-shade title tails, form/type/effect/feature/spec/manufacturing country.
- Review summaries in LotteON payloads are ignored and not stored.
- Ingredient text, review text, raw HTML, and images are not stored.
