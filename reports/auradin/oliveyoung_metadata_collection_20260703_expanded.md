# Auradin OliveYoung Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail_expanded/oliveyoung_metadata_20260703.jsonl`
- Candidate goodsNo rows attempted this run: 50
- Rows: 120
- Rows with fields: 70
- Collection status: `{"blocked": 50, "collected_partial": 70}`
- Fetch status: `{"HTTPError: HTTP Error 403: Forbidden": 50}`
- Field counts: `{"colorFamily": 57, "finish": 42, "intensity": 19, "oliveYoungListed": 70, "sellingPoints": 32, "shadeOptions": 66, "suitableFor": 6, "texture": 59, "undertone": 53}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 7 |
| VDL | 3 |
| 네이밍 | 7 |
| 데이지크 | 2 |
| 라카 | 10 |
| 롬앤 | 10 |
| 뮤드 | 1 |
| 에뛰드 | 2 |
| 에스쁘아 | 11 |
| 웨이크메이크 | 15 |
| 컬러그램 | 19 |
| 클리오 | 9 |
| 투쿨포스쿨 | 10 |
| 페리페라 | 8 |
| 하트퍼센트 | 6 |

## Notes

- Source is public OliveYoung product detail pages identified by existing Naver live-offer `goodsNo` values.
- Raw HTML, review text, ingredient text, and images are not stored; only short option/title evidence is retained.
- HTTP 403 or empty pages are marked `blocked` and preserved for manual review instead of bypassed.
