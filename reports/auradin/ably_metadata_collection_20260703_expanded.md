# Auradin Ably Metadata Collection

- Output: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/retail_expanded/ably_metadata_20260703.jsonl`
- Candidate rows attempted this run: 48
- Rows: 84
- Rows with fields: 36
- Collection status: `{"blocked": 48, "collected_partial": 36}`
- Fetch status: `{"HTTPError: HTTP Error 403: Forbidden": 48}`
- Field counts: `{"finish": 23, "intensity": 1, "sellingPoints": 18, "texture": 30}`

## Brand Rows

| Brand | Rows |
|---|---:|
| VDL | 7 |
| 데이지크 | 6 |
| 롬앤 | 4 |
| 에스쁘아 | 21 |
| 정샘물 뷰티 | 22 |
| 투쿨포스쿨 | 24 |

## Notes

- Source is public Ably JSON-LD from existing Naver live-offer URLs.
- Ably pages did not expose shade options in the checked payload, so this collector only retains product/category text-derived fields.
- Review text, ingredient text, raw HTML, and images are not stored.
