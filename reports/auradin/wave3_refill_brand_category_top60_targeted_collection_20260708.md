# Auradin Targeted Brand x Category Top60 Collection

- Base candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_20260708.jsonl`
- Targeted raw Naver rows: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/raw/naver_candidates_targeted_top60_20260708.jsonl`
- Merged candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_brand_category_top60_20260708.jsonl`
- Output queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/enrichment_queue_brand_category_top60_20260708.jsonl`
- Coverage CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_coverage_20260708.csv`
- Query CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_target_queries_20260708.csv`
- Base candidate rows: 9455
- Targeted query count: 74
- Targeted raw rows: 1486
- Targeted accepted candidates: 1419
- Merged ranked candidates: 9455
- Queue rows: 1126
- Remaining gap rows: 314
- Slot status counts: `{"partial": 11, "ready": 13}`
- Naver filter: `naverpay`
- Candidate quality passed: `True`
- Queue quality passed: `True`

Targeted slots before collection:

- 에뛰드 / cheek: before 56/60, gap 4, queries `에뛰드 블러셔 | 에뛰드 치크 | 에뛰드 볼터치 | 에뛰드 블러쉬 | 에뛰드 크림 블러셔 | 에뛰드 리퀴드 블러셔`
- 에뛰드 / liner: before 48/60, gap 12, queries `에뛰드 아이라이너 | 에뛰드 라이너 | 에뛰드 펜라이너 | 에뛰드 젤라이너 | 에뛰드 붓펜 아이라이너 | 에뛰드 펜슬 아이라이너`
- 에뛰드 / brow: before 40/60, gap 20, queries `에뛰드 아이브로우 | 에뛰드 브로우 | 에뛰드 브로우카라 | 에뛰드 아이브로우 펜슬 | 에뛰드 눈썹 | 에뛰드 오토브로우 | 에뛰드 브로우 펜슬 | 에뛰드 브로우 틴트`
- VDL / lip: before 30/60, gap 30, queries `VDL 립틴트 | VDL 립스틱 | VDL 글로스 | VDL 립 | VDL 립컬러 | VDL 틴트 | VDL 립글로스 | VDL 립밤`
- VDL / shadow: before 28/60, gap 32, queries `VDL 아이섀도우 | VDL 섀도우 팔레트 | VDL 팔레트 | VDL 아이팔레트 | VDL 아이섀도우 팔레트 | VDL 싱글 아이섀도우`
- VDL / liner: before 7/60, gap 53, queries `VDL 아이라이너 | VDL 라이너 | VDL 펜라이너 | VDL 젤라이너 | VDL 붓펜 아이라이너 | VDL 펜슬 아이라이너`
- VDL / brow: before 4/60, gap 56, queries `VDL 아이브로우 | VDL 브로우 | VDL 브로우카라 | VDL 아이브로우 펜슬 | VDL 눈썹 | VDL 오토브로우 | VDL 브로우 펜슬 | VDL 브로우 틴트`
- 라카 / base: before 33/60, gap 27, queries `라카 쿠션 | 라카 파운데이션 | 라카 베이스 | 라카 파데 | 라카 컨실러 | 라카 톤업`
- 라카 / cheek: before 50/60, gap 10, queries `라카 블러셔 | 라카 치크 | 라카 볼터치 | 라카 블러쉬 | 라카 크림 블러셔 | 라카 리퀴드 블러셔`
- 라카 / liner: before 17/60, gap 43, queries `라카 아이라이너 | 라카 라이너 | 라카 펜라이너 | 라카 젤라이너 | 라카 붓펜 아이라이너 | 라카 펜슬 아이라이너`
- 라카 / brow: before 26/60, gap 34, queries `라카 아이브로우 | 라카 브로우 | 라카 브로우카라 | 라카 아이브로우 펜슬 | 라카 눈썹 | 라카 오토브로우 | 라카 브로우 펜슬 | 라카 브로우 틴트`

Reject reasons:

- brand_not_whitelisted: 55
- category_not_cosmetic: 3
- non_cosmetic_noise: 9

Remaining underfilled slots:

- 에뛰드 / cheek: queued 56/60, gap 4, status `partial`
- 에뛰드 / liner: queued 48/60, gap 12, status `partial`
- 에뛰드 / brow: queued 40/60, gap 20, status `partial`
- VDL / lip: queued 30/60, gap 30, status `partial`
- VDL / shadow: queued 28/60, gap 32, status `partial`
- VDL / liner: queued 7/60, gap 53, status `partial`
- VDL / brow: queued 4/60, gap 56, status `partial`
- 라카 / base: queued 33/60, gap 27, status `partial`
- 라카 / cheek: queued 50/60, gap 10, status `partial`
- 라카 / liner: queued 17/60, gap 43, status `partial`
- 라카 / brow: queued 33/60, gap 27, status `partial`

Safety notes:

- Naver Shopping API was used for product candidate metadata only.
- No raw detail HTML, raw reviews, or original product images were stored.
- Detail collection remains a separate Phase D fetch with no login/captcha bypass.
