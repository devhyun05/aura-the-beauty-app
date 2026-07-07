# Auradin Targeted Brand x Category Top60 Collection

- Base candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_20260708.jsonl`
- Targeted raw Naver rows: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/raw/naver_candidates_targeted_top60_20260708.jsonl`
- Merged candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_brand_category_top60_20260708.jsonl`
- Output queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/enrichment_queue_brand_category_top60_20260708.jsonl`
- Coverage CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_coverage_20260708.csv`
- Query CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_target_queries_20260708.csv`
- Base candidate rows: 9455
- Targeted query count: 40
- Targeted raw rows: 630
- Targeted accepted candidates: 471
- Merged ranked candidates: 9455
- Queue rows: 116
- Remaining gap rows: 244
- Slot status counts: `{"missing": 1, "partial": 5}`
- Naver filter: `naverpay`
- Candidate quality passed: `True`
- Queue quality passed: `True`

Targeted slots before collection:

- 뮤드 / lip: before 46/60, gap 14, queries `뮤드 립틴트 | 뮤드 립스틱 | 뮤드 글로스 | 뮤드 립 | 뮤드 립컬러 | 뮤드 틴트 | 뮤드 립글로스 | 뮤드 립밤`
- 뮤드 / shadow: before 24/60, gap 36, queries `뮤드 아이섀도우 | 뮤드 섀도우 팔레트 | 뮤드 팔레트 | 뮤드 아이팔레트 | 뮤드 아이섀도우 팔레트 | 뮤드 싱글 아이섀도우`
- 뮤드 / base: before 14/60, gap 46, queries `뮤드 쿠션 | 뮤드 파운데이션 | 뮤드 베이스 | 뮤드 파데 | 뮤드 컨실러 | 뮤드 톤업`
- 뮤드 / cheek: before 9/60, gap 51, queries `뮤드 블러셔 | 뮤드 치크 | 뮤드 볼터치 | 뮤드 블러쉬 | 뮤드 크림 블러셔 | 뮤드 리퀴드 블러셔`
- 뮤드 / liner: before 0/60, gap 60, queries `뮤드 아이라이너 | 뮤드 라이너 | 뮤드 펜라이너 | 뮤드 젤라이너 | 뮤드 붓펜 아이라이너 | 뮤드 펜슬 아이라이너`
- 뮤드 / brow: before 23/60, gap 37, queries `뮤드 아이브로우 | 뮤드 브로우 | 뮤드 브로우카라 | 뮤드 아이브로우 펜슬 | 뮤드 눈썹 | 뮤드 오토브로우 | 뮤드 브로우 펜슬 | 뮤드 브로우 틴트`

Reject reasons:

- brand_not_whitelisted: 159

Remaining underfilled slots:

- 뮤드 / lip: queued 46/60, gap 14, status `partial`
- 뮤드 / shadow: queued 24/60, gap 36, status `partial`
- 뮤드 / base: queued 14/60, gap 46, status `partial`
- 뮤드 / cheek: queued 9/60, gap 51, status `partial`
- 뮤드 / liner: queued 0/60, gap 60, status `missing`
- 뮤드 / brow: queued 23/60, gap 37, status `partial`

Safety notes:

- Naver Shopping API was used for product candidate metadata only.
- No raw detail HTML, raw reviews, or original product images were stored.
- Detail collection remains a separate Phase D fetch with no login/captcha bypass.
