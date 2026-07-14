# 07. QA·지표·출시 게이트

## 완료의 정의

화면이 보이는 것만으로 완료하지 않는다. 각 vertical slice는 계약, 실패 상태, 데이터 근거, 접근성, 보안, 관측, rollback을 함께 만족해야 한다.

## 테스트 피라미드

### 1. 순수 로직 unit test

- sRGB hex parsing/validation
- sRGB→XYZ→Lab known vector
- ΔE2000 reference pair
- finish/category compatibility
- reason code generation
- score tie/diversity behavior
- recipe v2 round-trip과 `saved_ar_look_v1` adapter, enum/range/version
- `blush→cheek`, `eyeliner→liner`, raw→canonical finish normalization
- authoring color가 합성색으로 잘못 표시되지 않는 reason/copy
- seasonal validity/expiry
- event allowlist/dedupe
- purchase URL domain validation

### 2. Backend API contract

- `success()` envelope/camelCase
- AR ready/noArStyle/unsupported/noProducts
- AR multi-region group/default/cursor
- 다른 사용자 style ID → 정보 누설 없는 404
- makeup style `clientRequestId` retry/detail/archive/delete/cleanup
- DB 미구성 public read safe fallback의 정확한 범위
- write는 auth+DB 필수
- seasonal expired/draft collection 미노출
- seasonal editor/publisher RBAC와 publish/suspend audit
- like UUID only, product-family 상태, optional source shade·신규 like 권리 검증, idempotent create/delete
- 만료/blocked liked item의 sanitized tombstone과 unlike 가능 상태
- malicious product body/URL 무시 또는 4xx
- event batch limit/idempotency/clock skew/rate limit
- product/shade/asset/offer 각각 inactive/unlicensed/권리만료/품절 candidate 제외
- provider timeout partial fallback

### 3. DB/schema

- fresh schema와 기존 DB post migration 모두 같은 구조
- SQL idempotency
- DBML sync
- unique/FK/check/index
- duplicate shade/item/event 방지
- `(user_id, client_request_id)` style 중복 방지
- product family→shade/asset/offer cardinality와 legacy backfill/quarantine
- account/style/product deletion 영향
- retention cleanup
- migration rollback 또는 forward-fix runbook

### 4. Mobile service/navigation

- `requestBackendJson` query/response mapping
- `ProductRecommendation({arStyleId})` contract
- 홈 → hub, hub → AURADIN → back
- AR 저장 완료 → hub selected style
- search → result → detail → back state
- server heart state가 모든 화면에서 일치
- route-owned `DetailRouteChrome`가 한 번만 보이고 title/right action이 맞음
- stale request/cancel/refresh race
- dev fixture가 production bundle에서 활성화되지 않음

### 5. Component/state

각 section별:

- loading skeleton
- ready
- empty
- partial error/retry
- offline/stale
- pagination end
- long Korean/English product names
- missing image/price/shade
- sold out/inactive
- liked optimistic update rollback

### 6. E2E 시나리오

```text
홈
→ 추천 제품
→ AR 룩 없음
→ AR 룩 만들기
→ 색·피니시 조정
→ 저장
→ 이 룩과 맞는 제품 보기
→ 추천 근거 확인
→ 제품 상세
→ 좋아요
→ 좋아요 제품 목록 확인
```

```text
홈
→ 추천 제품
→ 시즌 컬렉션
→ 기준 기간·출처 확인
→ 제품 상세
→ 판매처 이동
→ 외부 도메인/광고 표시 확인
```

```text
추천 제품
→ AURADIN
→ “2만원대 뮤트 로즈 글로우 립”
→ 결과
→ 좋아요
→ 허브로 뒤로가기
→ 동일 heart 상태와 스크롤 복원
```

## 실행할 기본 검증

현재 `apps/mobile/package.json`에는 aggregate `test` script가 없다. 구현 범위에 `test:product-recommendation` contract script를 추가하고 다음처럼 실행한다.

```bash
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run test:auradin-theme-scope
npm --prefix apps/mobile run test:product-recommendation
cd services/backend && pytest
```

추가:

- backend targeted route/security/ranking tests
- schema checker
- migration on empty DB and current snapshot
- iOS simulator smoke
- 실기기 AR save round-trip
- visual snapshot/screenshot 비교

## 추천 품질 gate

### AR

- [ ] 모든 노출 item에 검수된 shade/evidence가 있음
- [ ] title-inferred shade는 기본 결과에서 제외
- [ ] 전문가 relevance set에서 합의한 Recall@K/NDCG@K 통과
- [ ] category별 표본과 실패 사례 review
- [ ] fake percentage 없음
- [ ] no style/no eligible products에서 정직한 상태
- [ ] 특정 브랜드·고가 상품 concentration 제한

정량 기준값은 첫 전문가 set을 만든 뒤 고정한다. 데이터 없이 임의 목표를 적고 통과 처리하지 않는다.

### 시즌

- [ ] 모든 collection에 validFrom/validUntil/reviewedAt/source
- [ ] Insight ratio를 판매량으로 표현하지 않음
- [ ] expired collection 0건
- [ ] 품절/가격 stale 비율이 합의한 상한 이하
- [ ] editor approval
- [ ] 광고/제휴 item 표시

### 개인화

- [ ] opt-in 계정만 raw event/derived profile 생성
- [ ] impression denominator와 position 기록
- [ ] control 대비 primary metric 개선
- [ ] hide/unlike·다양성 guardrail 악화 없음
- [ ] 철회/삭제 end-to-end

## UX·접근성 gate

- [ ] iPhone 기준 402×874와 작은 화면에서 clipping 없음
- [ ] safe area, keyboard, pull-to-refresh
- [ ] Dynamic Type 최대 접근성 크기에서 핵심 작업 가능
- [ ] VoiceOver 순서·label·selected state
- [ ] 모든 핵심 target 44×44pt 이상
- [ ] 색만으로 shade/상태 전달하지 않음
- [ ] 명암 WCAG AA 확인
- [ ] Reduce Motion에서 반복 animation 없음
- [ ] 부분 API 실패가 전체 화면을 막지 않음

Apple은 iOS 버튼의 편안한 터치 영역으로 44×44pt를 권고하며, WCAG 2.2의 target size minimum도 함께 참고한다. 실제 디자인 token과 플랫폼 접근성 도구로 검증한다.

## 성능 예산 시작점

절대 SLA는 실제 기기/네트워크 baseline 후 확정한다.

| 지표 | 시작 목표 |
| --- | --- |
| Hub shell 표시 | navigation 후 300ms 이내 체감 표시 |
| AURADIN orb/search 상호작용 | API와 무관하게 즉시 |
| 각 section P75 | warm 1s 내, cold 2s 내 콘텐츠 또는 명확한 skeleton |
| 이미지 | 화면 크기에 맞는 CDN variant, lazy load |
| scroll | 중급 iPhone에서 눈에 띄는 frame drop 없음 |
| event | UI를 block하지 않는 batch, bounded retry queue |
| provider | 짧은 timeout + circuit breaker, AR/season 격리 |

측정:

- section latency/error/empty rate
- image load failure
- provider quota/timeout
- list render/JS frame
- API cache hit/stale serve
- app version/algorithmVersion별 지표

## 제품 지표

### Primary

- AR section qualified impression → product detail rate
- AR 추천 → like rate
- AR save 완료 → `이 룩과 맞는 제품 보기` rate
- 시즌 collection → detail rate
- 추천 근거 열람/이해도 조사

### Secondary

- AURADIN orb open rate와 검색 성공률
- exact search zero-result rate
- likes list revisit
- seller outbound rate
- 새로운 브랜드/가격대 발견 비율

### Guardrail

- unlike/hide rate
- 빠른 back/accidental tap
- empty/error/stale/sold-out rate
- 고가/특정 브랜드 concentration
- 개인화 동의 철회율·문의
- seller 도메인 차단/보안 alert
- 앱 crash/scroll regression

seller outbound는 구매 전환과 동일하지 않다. 판매 데이터가 계약상 들어오지 않는 한 `구매율`이라고 부르지 않는다.

## Event 품질 gate

- impression은 카드의 합의된 비율이 일정 시간 viewport에 있을 때 1회
- 같은 run/product/section의 짧은 반복은 dedupe
- screen mount만으로 모든 rail item impression을 보내지 않음
- eventId client UUID, server unique
- occurred/received timestamp 둘 다 기록
- offline queue size/TTL 제한
- account switch/logout 시 다른 사용자 queue 전송 금지
- raw face/report/query가 context에 들어가지 않는 allowlist test

## 보안·개인정보 gate

- [ ] like catalog poisoning regression test
- [ ] IDOR test
- [ ] SSRF/redirect/domain allowlist test
- [ ] cache cross-user test
- [ ] prompt injection/hallucinated product test
- [ ] secret scan
- [ ] logs/traces/error reporting payload review
- [ ] consent off/withdraw/delete test
- [ ] retention cleanup dry-run/report
- [ ] external API terms/license evidence attached

## Feature flag와 rollout

권고 flag:

- `product_hub_v2`
- `seasonal_recommendations_v1`
- `ar_recipe_persistence_v1`
- `ar_product_recommendations_v1`
- `engagement_personalization_v1`
- `cohort_recommendations_v1`
- `legacy_naver_product_search`

순서:

1. 팀/개발 계정
2. staging seed catalog
3. internal dogfood
4. 1–5% production, 개인화는 별도 opt-in
5. 지표/guardrail 관찰
6. 25% → 50% → 100%

AR recommendation은 초기 shadow ranking을 수행하되 사용자 개인정보를 새로 수집하지 않는 범위에서 전문가 평가와 결과 차이를 먼저 본다.

## 자동 rollback/kill 조건

- 카탈로그 오염 또는 악성 URL 노출
- cross-user AR/likes/cache 노출
- raw 얼굴/landmark가 외부 AI·로그·event로 전송
- expired/unlicensed 상품 대량 노출
- error/crash가 baseline 대비 합의한 임계 초과
- provider 약관/서비스 종료로 사용권한 불명확
- 개인정보 동의 off 계정의 이벤트 수집 확인

kill switch는 UI만 숨기는 것이 아니라 provider call/event collection/background job도 중지해야 한다.

## Release sign-off

| 역할 | 확인 |
| --- | --- |
| Product/Design | IA, copy, empty/error, AURADIN 역할 |
| Mobile | navigation, states, accessibility, performance |
| Backend/Data | contracts, ranking, schema, provider, rollback |
| AR | recipe completeness, renderer round-trip |
| Security | auth, catalog boundary, URLs, logging, secrets |
| Privacy/Legal | consent, retention, terms, licenses, ads, minors |
| Editorial/Commerce | season source, product accuracy, expiry |
| QA | device/E2E/regression evidence |

한 역할이 미정이면 production 출시를 개발 완료로 간주하지 않는다.
