# Auradin Ably Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail/ably_metadata_20260703.jsonl`
- Candidate rows attempted this run: 39
- Rows: 39
- Rows with fields: 36
- Collection status: `{"collected_partial": 36, "not_found": 3}`
- Fetch status: `{"200": 39}`
- Field counts: `{"finish": 23, "intensity": 1, "sellingPoints": 18, "texture": 30}`

## Brand Rows

| Brand | Rows |
|---|---:|
| VDL | 5 |
| 데이지크 | 4 |
| 롬앤 | 4 |
| 에스쁘아 | 6 |
| 정샘물 뷰티 | 11 |
| 투쿨포스쿨 | 9 |

## Notes

- Source is public Ably JSON-LD from existing Naver live-offer URLs.
- Ably pages did not expose shade options in the checked payload, so this collector only retains product/category text-derived fields.
- Review text, ingredient text, raw HTML, and images are not stored.
