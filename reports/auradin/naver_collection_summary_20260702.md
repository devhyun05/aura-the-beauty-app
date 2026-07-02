# Auradin Naver Collection Summary (20260702)

Phase: Phase A live Naver Shopping API candidate collection.

- Source: `naver_shopping_api`
- Raw rows: 5237
- Accepted product candidates: 5089
- Rejected rows: 15
- Category counts: `{"base": 756, "brow": 648, "cheek": 881, "liner": 595, "lip": 1160, "shadow": 1049}`
- Candidate quality passed: `True`

Reject reasons:

- brand_not_whitelisted: 1
- non_cosmetic_noise: 14

Safety notes:

- No official mall, Olive Young, Naver detail page, review, login, cart, order, or mypage crawl was performed.
- No raw HTML, raw reviews, or original product image files were stored.
- Product images are stored as source URLs only.
