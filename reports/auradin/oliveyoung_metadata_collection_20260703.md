# Auradin OliveYoung Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail/oliveyoung_metadata_20260703.jsonl`
- Candidate goodsNo rows attempted this run: 22
- Rows: 74
- Rows with fields: 70
- Collection status: `{"blocked": 4, "collected_partial": 70}`
- Fetch status: `{"200": 18, "HTTPError: HTTP Error 403: Forbidden": 4}`
- Field counts: `{"colorFamily": 57, "finish": 42, "intensity": 19, "oliveYoungListed": 70, "sellingPoints": 32, "shadeOptions": 66, "suitableFor": 6, "texture": 59, "undertone": 53}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 6 |
| VDL | 2 |
| 네이밍 | 3 |
| 데이지크 | 1 |
| 라카 | 8 |
| 롬앤 | 7 |
| 에뛰드 | 2 |
| 에스쁘아 | 3 |
| 웨이크메이크 | 8 |
| 컬러그램 | 17 |
| 클리오 | 2 |
| 투쿨포스쿨 | 6 |
| 페리페라 | 6 |
| 하트퍼센트 | 3 |

## Notes

- Source is public OliveYoung product detail pages identified by existing Naver live-offer `goodsNo` values.
- Raw HTML, review text, ingredient text, and images are not stored; only short option/title evidence is retained.
- HTTP 403 or empty pages are marked `blocked` and preserved for manual review instead of bypassed.
