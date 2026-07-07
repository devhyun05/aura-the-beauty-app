# AURADIN 크롤 매니페스트 — 20260708

- 브랜드: 17개 · 세부 카테고리: 15종
- 세부 카테고리 목표: 슬롯당 15개 (최소 10)
- 카테고리 수집 top-n: 60 (세부 카테고리 목표 × 최대 세부 수)
- 웨이브: 5개 (브랜드 4개/웨이브)
- 총 슬롯(브랜드×세부): 255

## 사전 준비 (Codex, 웨이브 실행 전 1회)

- `NAVER_SHOPPING_CLIENT_ID` / `NAVER_SHOPPING_CLIENT_SECRET` 환경변수 필요.
- 각 웨이브 커맨드는 `data/auradin/processed/product_candidates_<date>.jsonl`를 base로 읽는다.
  없으면 `--base-candidates <기존 candidates.jsonl>`로 지정하거나 Wave 0(초기 수집)을 먼저 돌린다.
- 먼저 `--dry-run`으로 질의 목록을 확인한 뒤 실제 수집을 실행할 것.

## 웨이브 (NAVER 쇼핑 API)

### Wave 1 — 롬앤, 페리페라, 컬러그램, 웨이크메이크

- 예상 슬롯(브랜드×대분류): 24
- dry-run: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '롬앤,페리페라,컬러그램,웨이크메이크' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only --dry-run`
- 실행: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '롬앤,페리페라,컬러그램,웨이크메이크' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only`

### Wave 2 — 데이지크, 클리오, 정샘물 뷰티, 3CE

- 예상 슬롯(브랜드×대분류): 24
- dry-run: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '데이지크,클리오,정샘물 뷰티,3CE' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only --dry-run`
- 실행: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '데이지크,클리오,정샘물 뷰티,3CE' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only`

### Wave 3 — 에뛰드, 더샘, VDL, 라카

- 예상 슬롯(브랜드×대분류): 24
- dry-run: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '에뛰드,더샘,VDL,라카' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only --dry-run`
- 실행: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '에뛰드,더샘,VDL,라카' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only`

### Wave 4 — 네이밍, 투쿨포스쿨, 하트퍼센트, 에스쁘아

- 예상 슬롯(브랜드×대분류): 24
- dry-run: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '네이밍,투쿨포스쿨,하트퍼센트,에스쁘아' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only --dry-run`
- 실행: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '네이밍,투쿨포스쿨,하트퍼센트,에스쁘아' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only`

### Wave 5 — 뮤드

- 예상 슬롯(브랜드×대분류): 6
- dry-run: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '뮤드' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only --dry-run`
- 실행: `python scripts/run_auradin_targeted_slot_collection.py --date 20260708 --brands '뮤드' --top-n 60 --display 100 --request-delay-seconds 0.5 --naverpay-only`

## 세부 카테고리 슬롯 목표

| 대분류 | 세부 카테고리 | 라벨 | 질의 템플릿 |
|---|---|---|---|
| lip | lip_tint | 립틴트 | {brand} 립틴트 · {brand} 틴트 |
| lip | lip_stick | 립스틱 | {brand} 립스틱 |
| lip | lip_gloss | 립글로스 | {brand} 립글로스 · {brand} 글로스 |
| lip | lip_balm | 립밤 | {brand} 립밤 |
| shadow | shadow_palette | 섀도우 팔레트 | {brand} 아이섀도우 팔레트 · {brand} 아이팔레트 |
| shadow | shadow_single | 싱글 섀도우 | {brand} 싱글 아이섀도우 · {brand} 아이섀도우 |
| base | base_cushion | 쿠션 | {brand} 쿠션 |
| base | base_foundation | 파운데이션 | {brand} 파운데이션 · {brand} 파데 |
| base | base_concealer | 컨실러 | {brand} 컨실러 |
| cheek | cheek_blush | 블러셔 | {brand} 블러셔 · {brand} 볼터치 |
| cheek | cheek_cream | 크림/리퀴드 블러셔 | {brand} 크림 블러셔 · {brand} 리퀴드 블러셔 |
| liner | liner_liquid | 리퀴드 아이라이너 | {brand} 아이라이너 · {brand} 붓펜 아이라이너 |
| liner | liner_gel | 젤/펜슬 아이라이너 | {brand} 젤라이너 · {brand} 펜슬 아이라이너 |
| brow | brow_pencil | 브로우 펜슬 | {brand} 아이브로우 · {brand} 브로우 펜슬 · {brand} 오토브로우 |
| brow | brow_cara | 브로우 카라/틴트 | {brand} 브로우카라 · {brand} 브로우 틴트 |

## 수집 계약 (반드시 준수)

- 메타데이터만 저장 — 원본 HTML/리뷰/성분/원본 이미지 파일 저장 금지 (quality.py가 차단).
- 401/403/429/캡차/로그인 벽 → 'blocked'로 기록하고 우회 금지.
- OliveYoung 상세·스마트스토어(JS)·HTTP 차단 브랜드는 수집 대상에서 제외 (positive 입점 증거만 허용).
- colorHex/colorLab 저장 금지, madeInCountry 신규 수집 금지.
- 속성은 신뢰도 ≥0.65 + 결정적 신호일 때만 hard-filter eligible — 제목/오퍼 추론은 ≤0.62.
- 미확인 입점은 부정(false)이 아니다 — unknown으로 남긴다.
- 브랜드 화이트리스트(17개) 밖은 수집하지 않는다.

## 검증 (수집 후)

- `python scripts/report_auradin_crawl_coverage.py --date <date>` 로 브랜드×세부 커버리지 갭 확인.
- 슬롯당 구매가능(is_purchasable) 후보 ≥10 미달 슬롯은 해당 세부 카테고리 질의로 재수집.

