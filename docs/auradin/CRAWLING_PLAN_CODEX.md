# AURADIN 카탈로그 확장 크롤 플랜 (Codex 실행용)

> **분업**: 파이프라인·매니페스트·검증기·이 플랜은 **Claude**가 구축했다. **실제 NAVER 접속·크롤 실행은 Codex**가 담당한다.
> Codex는 이 문서 + 매니페스트(`data/auradin/manifests/crawl_manifest_<date>.json`)만 따르면 되며, 새 크롤러를 작성하지 않는다 — 아래 기존 스크립트를 실행한다.

## 목표

화이트리스트 **17개 브랜드 × 세부 카테고리(subcategory) 슬롯당 10~20개**의 구매 가능한 한국 색조 화장품을 확보한다.
현재 MVP 카탈로그는 337개(립/치크/섀도우)이고, **255개 브랜드×세부 슬롯 중 253개가 최소치(10) 미달**이다
(`python scripts/report_auradin_crawl_coverage.py --input data/auradin/catalog/catalog_items_mvp_20260706.jsonl --metric purchasable`로 확인). 6개 대분류(립/치크/섀도우/베이스/라이너/브로우) 전부 수집한다.

## 소스 & 하드 룰 (반드시 준수)

- **주 소스**: NAVER 쇼핑 API (공식 API, `filter=naverpay`). 속성 저신뢰(색군·마감·제형) 항목만 브랜드 공식몰로 보강.
- **금지/차단**:
  - OliveYoung 상세·스마트스토어(JS)·HTTP 차단 5개 브랜드(네이밍·라카·롬앤·뮤드·하트퍼센트) 우회 **금지** — positive 입점 증거만 허용.
  - 401/403/429/캡차/로그인 벽 → `blocked`로 **기록만**, 우회 금지.
  - **메타데이터만** 저장 — 원본 HTML/리뷰/성분/원본 이미지 파일 저장 금지 (`quality.py`가 차단).
  - colorHex/colorLab 저장 금지, madeInCountry 신규 수집 금지.
  - 속성은 **신뢰도 ≥0.65 + 결정적 신호**일 때만 hard-filter eligible — 제목/오퍼 추론은 ≤0.62.
  - 미확인 입점 ≠ 부정(false). unknown으로 남긴다.
- **환경변수**: `NAVER_SHOPPING_CLIENT_ID`, `NAVER_SHOPPING_CLIENT_SECRET` (repo 루트 `.env` 또는 `services/backend/.env`에서 자동 로드).
- **레이트 리밋**: `--request-delay-seconds 0.5` 유지, `--display 100`.

## 사전 준비 (1회)

```bash
# 1) 매니페스트 생성 (네트워크 없음) — <date>는 KST 기준 YYYYMMDD
python scripts/build_auradin_crawl_manifest.py --date <date> --per-subcategory 15 --brands-per-wave 4
#   → data/auradin/manifests/crawl_manifest_<date>.json  (웨이브·슬롯·질의·목표)
#   → reports/auradin/crawl_manifest_<date>.md          (사람이 읽는 체크리스트)

# 2) base 후보 시드 — 각 웨이브 커맨드는 data/auradin/processed/product_candidates_<date>.jsonl 를 base로 읽는다.
#    없으면 기존 최신 candidates 파일을 --base-candidates 로 넘기거나, 초기 전체 수집을 먼저 실행한다.
```

## Wave 1 — NAVER API 수집 (병렬 에이전트, 브랜드 그룹 단위)

매니페스트의 `waves[]`를 그대로 실행한다. 각 웨이브는 브랜드 4개 묶음(총 5웨이브)이며, 에이전트별로 1웨이브를 맡아 **병렬** 실행 가능하다(단, 같은 NAVER 자격증명 공유 시 레이트 리밋 합산 주의 — 동시 2~3 에이전트 권장).

각 웨이브 커맨드 예시(매니페스트 `waves[].command`):
```bash
# 먼저 dry-run으로 질의 확인
python scripts/run_auradin_targeted_slot_collection.py --date <date> \
  --brands '롬앤,페리페라,컬러그램,웨이크메이크' --top-n 60 \
  --display 100 --request-delay-seconds 0.5 --naverpay-only --dry-run

# 실제 수집 (--dry-run 제거)
python scripts/run_auradin_targeted_slot_collection.py --date <date> \
  --brands '롬앤,페리페라,컬러그램,웨이크메이크' --top-n 60 \
  --display 100 --request-delay-seconds 0.5 --naverpay-only
```
- 이 스크립트는 **갭 인지형**이다 — base 후보에 이미 채워진 슬롯은 건너뛴다. 세부 카테고리 질의(립밤·컨실러·싱글섀도우 등)까지 자동 포함된다.
- 산출: `data/auradin/processed/product_candidates_brand_category_top60_<date>.jsonl`, `enrichment_queue_*`, 커버리지 CSV, 수집 리포트 md.
- 정규화기가 각 후보에 `subcategory` 필드를 부여한다(제목+질의 추론).

## Wave 2 — 커버리지 검증 & 갭 필업

```bash
# 수집분 브랜드×세부 커버리지 (수집 수량 기준)
python scripts/report_auradin_crawl_coverage.py \
  --input data/auradin/processed/product_candidates_brand_category_top60_<date>.jsonl \
  --metric count --per-subcategory 15 --min 10
```
- 리포트의 "최소(10) 미달 슬롯" 표를 보고, 해당 브랜드×세부 카테고리의 **세부 질의**(매니페스트 `slots[].queries`)로 1회 재수집한다.
- HTTP 차단 브랜드/카테고리는 미달이어도 **재시도 금지** — 리포트에 사유 남기고 넘어간다.

## Wave 3 — 공식몰 속성 보강 (선택, 몰별 에이전트)

- Wave 1~2 산출 중 `colorFamily`/`finish`/제형 **저신뢰(<0.65)** 항목만 대상.
- `python -m app.services.auradin_catalog.domain_preflight`(robots 선행) 통과한 도메인만.
- 기존 몰별 수집 스크립트(`scripts/collect_auradin_official_metadata.py` 등)를 사용. 신규 크롤러 작성 금지.

## 인수 기준 (Codex → Claude 반납)

- [ ] 각 브랜드×세부 슬롯의 **수집 후보 ≥10** (차단 슬롯 제외, 리포트에 사유 명시).
- [ ] `validate_candidate_rows` / `validate_enrichment_queue` 품질 게이트 **0 위반** (스크립트가 자동 검사).
- [ ] `blocked` 기록 무결 — 우회 흔적 없음.
- [ ] 웨이브별 수집 리포트(`reports/auradin/*_<date>.md`) 제출.
- [ ] 산출 jsonl은 메타데이터만 — 원본 HTML/리뷰/이미지 없음.

## Claude가 이어받는 후속 (Codex 반납 후)

1. `refine_auradin_seed_derivation.py` → `merge_official_into_seed.py` → `build_auradin_mvp_preprocessing.py`로 seed→refined→enriched→mvp 재생성 (새 `<date>` 스냅샷).
2. `build_auradin_vector_index.py`로 벡터 인덱스 재빌드.
3. 서빙 6종 개방 (intent_parser/ranking/question_engine/knowledge_chunk_builder/catalog_loader RUN_DATE) + 교차 소스 dedupe.
4. `report_auradin_crawl_coverage.py --metric purchasable`로 서빙 카탈로그 최종 커버리지 확인 + 골든/신뢰성 스위트 재실행.

## 참고 파일

- 매니페스트 생성기: [scripts/build_auradin_crawl_manifest.py](../../scripts/build_auradin_crawl_manifest.py)
- 커버리지 리포터: [scripts/report_auradin_crawl_coverage.py](../../scripts/report_auradin_crawl_coverage.py)
- 수집 실행기: [scripts/run_auradin_targeted_slot_collection.py](../../scripts/run_auradin_targeted_slot_collection.py)
- 세부 카테고리 정의: [category_queries.py `SUBCATEGORIES`](../../services/backend/app/services/auradin_catalog/category_queries.py)
- 정규화·품질 게이트: `candidate_normalizer.py`, `quality.py`
