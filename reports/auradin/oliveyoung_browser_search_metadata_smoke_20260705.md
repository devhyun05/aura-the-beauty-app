# Auradin OliveYoung Browser Search Collection

- Output: `data/auradin/detail/retail_expanded/oliveyoung_browser_search_metadata_smoke_20260705.jsonl`
- Target queue: `data/auradin/detail/targets/oliveyoung_browser_search_targets_smoke_20260705.csv`
- Rows: 3
- Rows with fields: 0
- Rows with non-presence detail fields: 0
- Collection status: `{"blocked": 3}`
- Failure reasons: `{"search_security_challenge": 3}`
- Field counts: `{}`

## Notes

- Flow: open OliveYoung search page in a normal Playwright Chromium session, extract visible goods links, click the best match, then parse public product-page DOM/embedded option data.
- Login, captcha, security challenge, 403, and 429 pages are recorded as `blocked`; no bypass flow is implemented.
- Raw HTML, reviews, ingredients, images, colorHex/colorLab, and manufacturing country are not stored.
- `oliveYoungListed=false` is not emitted; absence of evidence remains unknown.
