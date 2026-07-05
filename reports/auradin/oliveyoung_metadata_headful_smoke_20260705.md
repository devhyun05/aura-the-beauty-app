# Auradin OliveYoung Metadata Collection

- Output: `data/auradin/detail/retail_expanded/oliveyoung_metadata_headful_smoke_20260705.jsonl`
- Target queue: `data/auradin/detail/targets/oliveyoung_focus_targets_headful_smoke_20260705.csv`
- Discovery metadata inputs: `data/auradin/detail/retail_expanded/naver_offer_metadata_20260703.jsonl, data/auradin/detail/retail_expanded/manual_verified_metadata_20260703.jsonl, data/auradin/detail/retail_expanded/oliveyoung_metadata_20260703.jsonl`
- Candidate rows attempted this run: 3
- Rows: 3
- Rows with fields: 3
- Rows with non-presence detail fields: 0
- Collection status: `{"blocked": 3}`
- Fetch status: `{"block_backoff_applied": 3, "browser_200": 2, "browser_Error: Page.goto: net::ERR_INTERNET_DISCONNECTED at https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000230953\nCall log:\n  - navigating to \"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000230953\", waiting until \"domcontentloaded\"\n": 1, "http_skipped_browser_only": 3}`
- Discovery candidates by source: `{"naver_shopping_search": 3, "purchase_url_goods_no": 1}`
- Selected discovery by source: `{"naver_shopping_search": 2, "purchase_url_goods_no": 1}`
- Browser fallback unavailable reason: ``
- Stop reason: ``
- Field counts: `{"oliveYoungListed": 3}`

## Brand Rows

| Brand | Rows |
|---|---:|
| 3CE | 3 |

## Notes

- Product-level OliveYoung presence is confirmed only when a `goodsNo` or OliveYoung URL is matched from purchase URLs, Naver offer metadata, or Naver Shopping search.
- Detail collection uses public OliveYoung product detail pages via normal HTTP fetch, then ordinary browser rendering when enabled.
- Login, captcha, security challenge, 403, 429, and blocked pages are recorded as `blocked`; no bypass flow is implemented.
- Raw HTML, review text, ingredient text, images, colorHex/colorLab, and manufacturing country are not stored or collected in this OliveYoung-focused output.
- `oliveYoungListed=false` is not emitted; absence of product-level evidence remains unknown rather than a negative listing claim.
