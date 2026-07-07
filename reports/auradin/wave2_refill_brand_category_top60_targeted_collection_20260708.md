# Auradin Targeted Brand x Category Top60 Collection

- Base candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_20260708.jsonl`
- Targeted raw Naver rows: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/raw/naver_candidates_targeted_top60_20260708.jsonl`
- Merged candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_brand_category_top60_20260708.jsonl`
- Output queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/enrichment_queue_brand_category_top60_20260708.jsonl`
- Coverage CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_coverage_20260708.csv`
- Query CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_target_queries_20260708.csv`
- Base candidate rows: 9455
- Targeted query count: 62
- Targeted raw rows: 1034
- Targeted accepted candidates: 997
- Merged ranked candidates: 9455
- Queue rows: 1134
- Remaining gap rows: 306
- Slot status counts: `{"partial": 9, "ready": 15}`
- Naver filter: `naverpay`
- Candidate quality passed: `True`
- Queue quality passed: `True`

Targeted slots before collection:

- 데이지크 / base: before 33/60, gap 27, queries `데이지크 쿠션 | 데이지크 파운데이션 | 데이지크 베이스 | 데이지크 파데 | 데이지크 컨실러 | 데이지크 톤업`
- 데이지크 / cheek: before 52/60, gap 8, queries `데이지크 블러셔 | 데이지크 치크 | 데이지크 볼터치 | 데이지크 블러쉬 | 데이지크 크림 블러셔 | 데이지크 리퀴드 블러셔`
- 데이지크 / liner: before 6/60, gap 54, queries `데이지크 아이라이너 | 데이지크 라이너 | 데이지크 펜라이너 | 데이지크 젤라이너 | 데이지크 붓펜 아이라이너 | 데이지크 펜슬 아이라이너`
- 데이지크 / brow: before 13/60, gap 47, queries `데이지크 아이브로우 | 데이지크 브로우 | 데이지크 브로우카라 | 데이지크 아이브로우 펜슬 | 데이지크 눈썹 | 데이지크 오토브로우 | 데이지크 브로우 펜슬 | 데이지크 브로우 틴트`
- 정샘물 뷰티 / lip: before 44/60, gap 16, queries `정샘물 뷰티 립틴트 | 정샘물 뷰티 립스틱 | 정샘물 뷰티 글로스 | 정샘물 뷰티 립 | 정샘물 뷰티 립컬러 | 정샘물 뷰티 틴트 | 정샘물 뷰티 립글로스 | 정샘물 뷰티 립밤`
- 정샘물 뷰티 / liner: before 9/60, gap 51, queries `정샘물 뷰티 아이라이너 | 정샘물 뷰티 라이너 | 정샘물 뷰티 펜라이너 | 정샘물 뷰티 젤라이너 | 정샘물 뷰티 붓펜 아이라이너 | 정샘물 뷰티 펜슬 아이라이너`
- 정샘물 뷰티 / brow: before 34/60, gap 26, queries `정샘물 뷰티 아이브로우 | 정샘물 뷰티 브로우 | 정샘물 뷰티 브로우카라 | 정샘물 뷰티 아이브로우 펜슬 | 정샘물 뷰티 눈썹 | 정샘물 뷰티 오토브로우 | 정샘물 뷰티 브로우 펜슬 | 정샘물 뷰티 브로우 틴트`
- 3CE / liner: before 15/60, gap 45, queries `3CE 아이라이너 | 3CE 라이너 | 3CE 펜라이너 | 3CE 젤라이너 | 3CE 붓펜 아이라이너 | 3CE 펜슬 아이라이너`
- 3CE / brow: before 28/60, gap 32, queries `3CE 아이브로우 | 3CE 브로우 | 3CE 브로우카라 | 3CE 아이브로우 펜슬 | 3CE 눈썹 | 3CE 오토브로우 | 3CE 브로우 펜슬 | 3CE 브로우 틴트`

Reject reasons:

- brand_not_whitelisted: 36
- category_not_cosmetic: 1

Remaining underfilled slots:

- 데이지크 / base: queued 33/60, gap 27, status `partial`
- 데이지크 / cheek: queued 52/60, gap 8, status `partial`
- 데이지크 / liner: queued 6/60, gap 54, status `partial`
- 데이지크 / brow: queued 13/60, gap 47, status `partial`
- 정샘물 뷰티 / lip: queued 44/60, gap 16, status `partial`
- 정샘물 뷰티 / liner: queued 9/60, gap 51, status `partial`
- 정샘물 뷰티 / brow: queued 34/60, gap 26, status `partial`
- 3CE / liner: queued 15/60, gap 45, status `partial`
- 3CE / brow: queued 28/60, gap 32, status `partial`

Safety notes:

- Naver Shopping API was used for product candidate metadata only.
- No raw detail HTML, raw reviews, or original product images were stored.
- Detail collection remains a separate Phase D fetch with no login/captcha bypass.
