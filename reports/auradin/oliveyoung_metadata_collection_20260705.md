# Auradin OliveYoung Metadata Collection

- Output: `data/auradin/detail/retail_expanded/oliveyoung_metadata_20260705.jsonl`
- Target queue: `data/auradin/detail/targets/oliveyoung_focus_targets_20260705.csv`
- Discovery metadata inputs: `data/auradin/detail/retail_expanded/naver_offer_metadata_20260703.jsonl, data/auradin/detail/retail_expanded/manual_verified_metadata_20260703.jsonl, data/auradin/detail/retail_expanded/oliveyoung_metadata_20260703.jsonl`
- Candidate rows attempted this run: 1020
- Rows: 1020
- Rows with fields: 344
- Rows with non-presence detail fields: 9
- Collection status: `{"blocked": 335, "collected_partial": 9, "low_match_score": 11, "not_found": 665}`
- Fetch status: `{"browser_200": 9, "browser_429": 335, "http_HTTPError: HTTP Error 403: Forbidden": 344}`
- Discovery candidates by source: `{"naver_offer_metadata_matchedPositiveOffers": 129, "naver_shopping_search": 184, "purchase_url_goods_no": 120}`
- Selected discovery by source: `{"naver_offer_metadata_matchedPositiveOffers": 123, "naver_shopping_search": 112, "purchase_url_goods_no": 120}`
- Browser fallback unavailable reason: ``
- Field counts: `{"colorFamily": 6, "finish": 3, "intensity": 2, "oliveYoungListed": 344, "sellingPoints": 3, "shadeOptions": 8, "suitableFor": 1, "texture": 8, "undertone": 4}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 60 |
| VDL | 60 |
| 네이밍 | 60 |
| 더샘 | 60 |
| 데이지크 | 60 |
| 라카 | 60 |
| 롬앤 | 60 |
| 뮤드 | 60 |
| 에뛰드 | 60 |
| 에스쁘아 | 60 |
| 웨이크메이크 | 60 |
| 정샘물 뷰티 | 60 |
| 컬러그램 | 60 |
| 클리오 | 60 |
| 투쿨포스쿨 | 60 |
| 페리페라 | 60 |
| 하트퍼센트 | 60 |

## Notes

- Product-level OliveYoung presence is confirmed only when a `goodsNo` or OliveYoung URL is matched from purchase URLs, Naver offer metadata, or Naver Shopping search.
- Detail collection uses public OliveYoung product detail pages via normal HTTP fetch, then ordinary browser rendering when enabled.
- Login, captcha, security challenge, 403, 429, and blocked pages are recorded as `blocked`; no bypass flow is implemented.
- Rows with `blocked` and `oliveYoungListed=true` have product-level listing evidence, but no reliable OliveYoung detail-page metadata beyond presence.
- Raw HTML, review text, ingredient text, images, colorHex/colorLab, and manufacturing country are not stored or collected in this OliveYoung-focused output.
- `oliveYoungListed=false` is not emitted; absence of product-level evidence remains unknown rather than a negative listing claim.
