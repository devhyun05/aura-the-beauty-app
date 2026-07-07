# Auradin Targeted Brand x Category Top60 Collection

- Base candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_20260708.jsonl`
- Targeted raw Naver rows: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/raw/naver_candidates_targeted_top60_20260708.jsonl`
- Merged candidates: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/product_candidates_brand_category_top60_20260708.jsonl`
- Output queue: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/enrichment_queue_brand_category_top60_20260708.jsonl`
- Coverage CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_coverage_20260708.csv`
- Query CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/reports/auradin/brand_category_top60_target_queries_20260708.csv`
- Base candidate rows: 9455
- Targeted query count: 38
- Targeted raw rows: 799
- Targeted accepted candidates: 620
- Merged ranked candidates: 9455
- Queue rows: 1251
- Remaining gap rows: 189
- Slot status counts: `{"partial": 6, "ready": 18}`
- Naver filter: `naverpay`
- Candidate quality passed: `True`
- Queue quality passed: `True`

Targeted slots before collection:

- 롬앤 / shadow: before 53/60, gap 7, queries `롬앤 아이섀도우 | 롬앤 섀도우 팔레트 | 롬앤 팔레트 | 롬앤 아이팔레트 | 롬앤 아이섀도우 팔레트 | 롬앤 싱글 아이섀도우`
- 롬앤 / base: before 37/60, gap 23, queries `롬앤 쿠션 | 롬앤 파운데이션 | 롬앤 베이스 | 롬앤 파데 | 롬앤 컨실러 | 롬앤 톤업`
- 롬앤 / liner: before 7/60, gap 53, queries `롬앤 아이라이너 | 롬앤 라이너 | 롬앤 펜라이너 | 롬앤 젤라이너 | 롬앤 붓펜 아이라이너 | 롬앤 펜슬 아이라이너`
- 롬앤 / brow: before 40/60, gap 20, queries `롬앤 아이브로우 | 롬앤 브로우 | 롬앤 브로우카라 | 롬앤 아이브로우 펜슬 | 롬앤 눈썹 | 롬앤 오토브로우 | 롬앤 브로우 펜슬 | 롬앤 브로우 틴트`
- 컬러그램 / base: before 10/60, gap 50, queries `컬러그램 쿠션 | 컬러그램 파운데이션 | 컬러그램 베이스 | 컬러그램 파데 | 컬러그램 컨실러 | 컬러그램 톤업`
- 컬러그램 / cheek: before 24/60, gap 36, queries `컬러그램 블러셔 | 컬러그램 치크 | 컬러그램 볼터치 | 컬러그램 블러쉬 | 컬러그램 크림 블러셔 | 컬러그램 리퀴드 블러셔`

Reject reasons:

- brand_not_whitelisted: 178
- non_cosmetic_noise: 1

Remaining underfilled slots:

- 롬앤 / shadow: queued 53/60, gap 7, status `partial`
- 롬앤 / base: queued 37/60, gap 23, status `partial`
- 롬앤 / liner: queued 7/60, gap 53, status `partial`
- 롬앤 / brow: queued 40/60, gap 20, status `partial`
- 컬러그램 / base: queued 10/60, gap 50, status `partial`
- 컬러그램 / cheek: queued 24/60, gap 36, status `partial`

Safety notes:

- Naver Shopping API was used for product candidate metadata only.
- No raw detail HTML, raw reviews, or original product images were stored.
- Detail collection remains a separate Phase D fetch with no login/captcha bypass.
