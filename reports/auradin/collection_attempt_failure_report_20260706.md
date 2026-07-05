# Auradin Detail Metadata Collection Attempts and Failure Report

작성일: 2026-07-06  
대상 repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`

## Executive Summary

이번 작업의 목표는 기존 Naver brand/category Top10 후보 목록을 상세 catalog로 둔갑시키지 않고, 검색/추천에 필요한 제한된 상세 metadata를 evidence와 confidence로 보강하는 것이었다.

현재 결론은 다음과 같다.

- 전체 검색 seed는 만들어졌지만, 목표는 완전히 달성되지 않았다.
- 올리브영은 상품 단위 존재 확인에는 일부 기여했지만, 상세 metadata source로는 대부분 실패했다.
- 실패의 핵심은 브랜드 입점 여부가 아니라, `Naver 후보명 -> 올리브영 goodsNo -> 올리브영 상세 페이지 본문/옵션` 연결이 두 단계에서 끊긴 것이다.
- 올리브영 상세 페이지와 올리브영 검색 페이지는 Playwright/일반 HTTP 환경에서 보안 확인 또는 제한 화면으로 막혔다.
- Naver Shopping API와 공식몰/공개 쇼핑몰은 일부 metadata 보강에 성공했지만, 올리브영만으로 목표치를 달성한 것은 아니다.
- 현재 worktree의 remote/upstream 상태가 안전하지 않다. AURA 폴더에서 작업했지만 `origin`은 `302-group5-final-project`를 가리키고 있다.

## Branch and Repository Risk

현재 확인된 Git 상태:

- 작업 경로: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`
- 현재 브랜치: `aura-cosmetic-search-engine`
- upstream: `origin/dev`
- branch 상태: `ahead 1, behind 100`
- remote URL: `https://github.com/devhyun05/302-group5-final-project`

이는 수집 결과의 품질과 별개로 운영상 위험하다. 현재 파일들은 AURA workspace 안에 있으나, 원격 저장소 설정은 302 repo를 가리킨다. 커밋/푸시 전 반드시 remote와 branch 기준을 정리해야 한다.

## Scope Reminder

원본 입력인 `data/auradin/catalog/brand_category_top10_products_20260702.jsonl`은 상세 catalog가 아니다. 이것은 브랜드 x 카테고리별 Naver 후보 Top10 목록이다.

따라서 이번 산출물은 다음 성격을 가진다.

- source grain: `naver_brand_category_top10_candidate`
- 사용 가능 범위: 검색/retrieval seed
- 사용 불가 범위: 완성된 shade-level product catalog
- 낮은 confidence 필드: 추천 hard filter에서 제외

## Attempt 1: OliveYoung Focus Collector

주요 산출물:

- `scripts/collect_auradin_oliveyoung_metadata.py`
- `data/auradin/detail/retail_expanded/oliveyoung_metadata_20260705.jsonl`
- `data/auradin/detail/targets/oliveyoung_focus_targets_20260705.csv`
- `reports/auradin/oliveyoung_metadata_collection_20260705.md`

방식:

- 기존 구매 URL에서 올리브영 `goodsNo` 추출
- 기존 Naver offer metadata에서 올리브영 offer 추출
- Naver Shopping 검색 결과에서 올리브영 `goodsNo` discovery
- `goodsNo`가 있으면 올리브영 상세 URL 접근
- HTTP fetch 실패 시 Playwright 브라우저 렌더링 시도
- 로그인, captcha, 보안 challenge, 403, 429는 `blocked`로 기록

결과:

| 항목 | 수 |
|---|---:|
| 시도 행 | 1,020 |
| `oliveYoungListed` 근거 확인 | 344 |
| 실제 non-presence 상세 필드 수집 행 | 9 |
| `not_found` | 665 |
| `blocked` | 335 |
| `low_match_score` | 11 |

필드별 수집 수:

| 필드 | 수집 수 |
|---|---:|
| `oliveYoungListed` | 344 |
| `shadeOptions` | 8 |
| `colorFamily` | 6 |
| `undertone` | 4 |
| `intensity` | 2 |
| `finish` | 3 |
| `texture` | 8 |
| `suitableFor` | 1 |
| `sellingPoints` | 3 |

실패 이유:

- 665개는 올리브영 `goodsNo`를 찾지 못했다.
- 335개는 `goodsNo`를 찾았지만 상세 페이지 접근에서 `429` 또는 challenge성 페이지로 막혔다.
- 11개는 후보는 발견했지만 `matchScore < 0.5`로 보류했다.
- HTTP fetch는 다수 `403 Forbidden`이었다.
- 브라우저 fallback은 일부 `200`을 받았지만, 실제 상품 상세가 아니라 제한/대기 화면인 경우가 많았다.

판단:

- 올리브영 상품 존재 근거에는 부분적으로 쓸 수 있다.
- 올리브영 상세 metadata source로는 현재 성공률이 너무 낮다.
- 이 결과만으로 목표치를 달성했다고 볼 수 없다.

## Attempt 2: OliveYoung Slow Retry

주요 산출물:

- `data/auradin/detail/retail_expanded/oliveyoung_metadata_slow_retry_20260705.jsonl`
- `data/auradin/detail/targets/oliveyoung_focus_targets_slow_retry_20260705.csv`
- `reports/auradin/oliveyoung_metadata_slow_retry_20260705.md`

방식:

- high-value blocked 후보 10개 선택
- `--browser-only` 사용
- dedicated Playwright profile 사용
- `delay-seconds 30`, jitter, block backoff 적용
- 차단 시 중단하지 않고 속도를 낮춰 계속 진행

결과:

| 항목 | 수 |
|---|---:|
| 시도 행 | 10 |
| `blocked` | 10 |
| `oliveYoungListed` 근거 | 10 |
| non-presence 상세 필드 | 0 |

실패 이유:

- 브라우저는 `200` 응답을 받았지만, 페이지 내용은 `security_challenge`였다.
- 속도를 낮춰도 상세 페이지 본문/옵션 데이터 접근으로 이어지지 않았다.

판단:

- 느린 브라우저 접근은 차단 완화에 실패했다.
- 단, goodsNo 기반 presence evidence는 유지 가능하다.

## Attempt 3: OliveYoung Headful Browser Smoke

주요 산출물:

- `data/auradin/detail/retail_expanded/oliveyoung_metadata_headful_smoke_20260705.jsonl`
- `data/auradin/detail/targets/oliveyoung_focus_targets_headful_smoke_20260705.csv`
- `reports/auradin/oliveyoung_metadata_headful_smoke_20260705.md`

방식:

- Playwright headful Chromium 사용
- 정상 브라우저 창을 띄워 상세 페이지 직접 접근
- 3개 smoke만 실행

결과:

| 항목 | 수 |
|---|---:|
| 시도 행 | 3 |
| `blocked` | 3 |
| `oliveYoungListed` 근거 | 3 |
| non-presence 상세 필드 | 0 |

실패 이유:

- 2개는 `security_challenge`
- 1개는 `net::ERR_INTERNET_DISCONNECTED`

판단:

- Playwright headful만으로는 올리브영 상세 페이지 수집 문제가 해결되지 않았다.
- 이 산출물은 seed에 병합하지 않았다.

## Attempt 4: OliveYoung Search Page to Detail Page Flow

주요 산출물:

- `scripts/collect_auradin_oliveyoung_browser_search.py`
- `data/auradin/detail/retail_expanded/oliveyoung_browser_search_metadata_smoke_20260705.jsonl`
- `data/auradin/detail/targets/oliveyoung_browser_search_targets_smoke_20260705.csv`
- `reports/auradin/oliveyoung_browser_search_metadata_smoke_20260705.md`

방식:

- Playwright Chromium에서 올리브영 검색 페이지 열기
- 브랜드명/상품명 검색
- 검색 결과의 `goodsNo` 링크 추출
- 최상위 match 상품 상세 페이지 진입
- 상세 페이지 DOM/embedded option data 파싱

결과:

| 항목 | 수 |
|---|---:|
| 시도 행 | 3 |
| `blocked` | 3 |
| 검색 결과 추출 성공 | 0 |
| 상세 페이지 진입 성공 | 0 |
| non-presence 상세 필드 | 0 |

실패 이유:

- 검색 페이지 자체가 `search_security_challenge`로 막혔다.
- 실제 visible text는 `잠시만 기다려 주세요`, `접속 정보를 확인 중이에요`였다.
- 검색 결과 DOM까지 도달하지 못했으므로 상세 클릭도 수행되지 않았다.

판단:

- 사용자가 제안한 `검색 -> 상품 클릭 -> 상세 추출` 플로우는 구현했지만, Playwright 환경에서는 검색 첫 단계부터 막힌다.
- 이 산출물은 seed에 병합하지 않았다.

## Attempt 5: Chrome Extension Route

방식:

- Codex Chrome extension backend 연결 시도
- 목적은 사용자의 실제 Chrome 세션을 통한 올리브영 검색/상세 흐름 확인

결과:

- `agent.browsers.get("extension")` 결과: `Browser is not available: extension`
- `agent.browsers.list()` 결과: `[]`

실패 이유:

- 현재 Codex 세션에서 Chrome backend가 노출되지 않았다.
- 따라서 사용자의 실제 Chrome profile/session 상태를 사용할 수 없었다.

판단:

- Chrome extension 경로는 현재 환경에서는 사용할 수 없다.
- 별도 사용 가능한 Chrome backend가 잡히기 전까지 자동화 경로로 취급할 수 없다.

## Attempt 6: Naver Offer Metadata Supplement

주요 산출물:

- `scripts/collect_auradin_naver_offer_metadata.py`
- `data/auradin/detail/retail_expanded/naver_offer_metadata_20260705.jsonl`
- `reports/auradin/naver_offer_metadata_collection_20260705.md`

방식:

- 공식 Naver Shopping Search API 사용
- 기존 후보 상품명으로 offer 검색
- offer title, mallName, productId, link, matchScore를 짧은 evidence로 저장
- title 기반으로 texture, shadeOptions, finish, sellingPoints 일부 추론
- 낮은 confidence 값은 hard filter에서 제외

결과:

| 항목 | 수 |
|---|---:|
| 시도 행 | 483 |
| `collected_partial` | 454 |
| `not_found` | 29 |
| `texture` | 430 |
| `shadeOptions` | 211 |
| `finish` | 157 |
| `sellingPoints` | 165 |

한계:

- Naver offer title 기반이라 상세 페이지 근거보다 약하다.
- 대부분 낮은 confidence로 저장되며 hard filter에는 바로 쓰지 못한다.
- 이것은 올리브영 상세 수집 성공이 아니다.

판단:

- 검색 recall 보강에는 유용하다.
- 확정적인 색상/언더톤/마감 hard filter 근거로 쓰기에는 제한적이다.

## Attempt 7: Official Brand Page Batch

주요 산출물:

- `scripts/collect_auradin_official_metadata.py`
- `data/auradin/detail/official_expanded/official_metadata_3ce_vdl_dasique_20260705.jsonl`
- `reports/auradin/official_metadata_collection_3ce_vdl_dasique_20260705.md`

방식:

- 3CE, VDL, 데이지크 공식 sitemap/index/product page 사용
- raw HTML 저장 없이 메모리에서 meta/option JSON/product text 파싱

결과:

| 항목 | 수 |
|---|---:|
| 시도 행 | 180 |
| `collected_partial` | 81 |
| `not_found` | 99 |
| `shadeOptions` | 60 |
| `colorFamily` | 34 |
| `undertone` | 26 |
| `finish` | 63 |
| `texture` | 64 |
| `suitableFor` | 18 |
| `sellingPoints` | 52 |

주의:

- 이 batch는 올리브영 집중 수집이 아니라 공식몰 대체 source 수집이다.
- 사용자가 올리브영 집중을 다시 물은 뒤에는 seed에 병합하지 않았다.
- `madeInCountry`가 일부 포함되어 있으나, 이후 요구사항상 제조국 신규 수집은 중단해야 한다.

판단:

- 검색 품질 보강 source로는 올리브영보다 성공률이 높다.
- 그러나 올리브영만으로 수집한다는 범위와는 다르다.

## Current Expanded Seed Status

주요 산출물:

- `data/auradin/detail/normalized/limited_detail_results_20260703_expanded.jsonl`
- `data/auradin/catalog/catalog_items_seed_20260703_expanded.jsonl`
- `data/auradin/knowledge/product_knowledge_docs_20260703_expanded.jsonl`
- `reports/auradin/limited_detail_collection_summary_20260703_expanded.md`

현재 expanded seed 기준:

| 필드 | filled | hard-filter eligible |
|---|---:|---:|
| `shadeOptions` | 802 / 1020 (78.6%) | 662 / 1020 (64.9%) |
| `colorFamily` | 712 / 1020 (69.8%) | 251 / 1020 (24.6%) |
| `undertone` | 665 / 1020 (65.2%) | 82 / 1020 (8.0%) |
| `intensity` | 441 / 1020 (43.2%) | 1 / 1020 (0.1%) |
| `finish` | 469 / 1020 (46.0%) | 331 / 1020 (32.5%) |
| `texture` | 936 / 1020 (91.8%) | 439 / 1020 (43.0%) |
| `suitableFor` | 588 / 1020 (57.6%) | 170 / 1020 (16.7%) |
| `sellingPoints` | 482 / 1020 (47.3%) | 284 / 1020 (27.8%) |
| `oliveYoungListed` | 344 / 1020 (33.7%) | 344 / 1020 (33.7%) |

현재 상태:

- normalized rows: 1,020
- catalog seed rows: 1,020
- knowledge docs: 2,040
- collection status: `complete` 5, `partial` 1,015

해석:

- seed는 retrieval/search 연결용으로는 사용 가능하다.
- 완성 catalog는 아니다.
- `undertone`, `intensity`, `suitableFor`, `sellingPoints`는 hard-filter 근거가 아직 부족하다.
- 올리브영 상세 수집만으로 만든 seed가 아니며, Naver offer, 공식몰, 여러 공개 retail source가 섞인 제한 detail seed다.

## Safety and Data Hygiene

현재 확인된 원칙:

- raw HTML 장기 저장 없음
- 리뷰 원문 저장 없음
- 성분/전성분 저장 없음
- 이미지 원본/바이트 저장 없음
- `colorHex`, `colorLab` 저장 없음
- `oliveYoungListed=false` 생성하지 않음
- confidence `< 0.65` 핵심 필드는 hard filter에서 제외

주의:

- `madeInCountry`는 과거 산출물/공식 batch에 남아 있을 수 있다.
- 사용자가 제조국 수집 중단을 지시했으므로 이후 collector/merge에서는 신규 제조국 수집을 제외해야 한다.

## Failure Taxonomy

| failure type | 의미 | 영향 |
|---|---|---|
| `no_oliveyoung_goods_no` | 후보 상품명에서 올리브영 상품번호를 찾지 못함 | 올리브영 상세 접근 불가 |
| `http_status:429` | 상세 페이지 접근 제한 | 상세 metadata 추출 실패 |
| `security_challenge` | 보안 확인/대기 화면 | 상세 DOM/옵션 추출 실패 |
| `search_security_challenge` | 올리브영 검색 페이지 자체 보안 확인 | 검색->클릭 플로우 실패 |
| `match_score_below_0.5` | 후보 상품과 검색 결과 매칭 신뢰도 부족 | 오매칭 방지를 위해 보류 |
| `not_found` | source에서 매칭 가능한 상품을 찾지 못함 | 해당 source 기여 없음 |

## What Worked

- Naver 후보 Top10이 상세 catalog가 아니라는 grain을 유지했다.
- `oliveYoungListed=true`는 positive evidence가 있을 때만 생성했다.
- `oliveYoungListed=false`는 생성하지 않았다.
- 상세 필드는 evidence, sourceType, sourceUrl, confidence 구조로 저장했다.
- low-confidence 필드는 hard filter에서 제외했다.
- ProductCatalogItem seed와 ProductKnowledgeDocument seed를 생성했다.
- raw HTML/review/ingredient/image 원본 저장 없이 수집했다.

## What Did Not Work

- 올리브영 HTTP 상세 fetch는 대부분 `403`이었다.
- 올리브영 browser detail fetch는 `429` 또는 security challenge에 막혔다.
- 올리브영 search page browser flow도 검색 단계에서 security challenge에 막혔다.
- 속도 낮춤, browser-only, headful smoke는 상세 metadata 수집률을 개선하지 못했다.
- Chrome extension route는 현재 세션에서 browser backend가 노출되지 않아 실행하지 못했다.
- 전체 1,020개를 올리브영만으로 상세 보강하는 목표는 달성되지 않았다.

## Immediate Next Decisions

1. Git remote/branch 정리
   - 현재 remote가 302 repo를 가리키므로, 수집을 더 하기 전에 repo 원격 기준을 바로잡아야 한다.

2. 수집 범위 결정
   - `올리브영만`을 고집하면 현재 환경에서는 상세 metadata 목표치 달성이 어렵다.
   - 검색 품질 목표 달성이 우선이면 공식몰, 공개 retail API/HTML, Naver offer를 병행해야 한다.

3. 올리브영을 계속 시도할 경우
   - Chrome extension 또는 사용자의 실제 Chrome profile이 잡히는 환경이 필요하다.
   - 그래도 captcha/security challenge가 보이면 우회하지 않고 `blocked`로 남겨야 한다.

4. 검색 에이전트로 넘어갈 경우
   - 현재 seed는 retrieval용으로 연결 가능하다.
   - 단, hard-filter 가능한 필드와 uncertainty 필드를 분리해서 사용해야 한다.
