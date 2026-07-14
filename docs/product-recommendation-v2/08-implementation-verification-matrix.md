# 제품추천 V2 구현 검증 매트릭스

이 문서는 `00-product-recommendation-implementation-plan.md`와
`06-implementation-roadmap-and-approvals.md`의 전체 범위를 코드·자동 테스트·실기기 검증으로
추적한다. P0/P1/P2는 순서일 뿐 범위 구분이 아니다.

## 자동 검증 상태

| # | 요구사항 | 구현·검증 근거 | 상태 |
|---|---|---|---|
| 1 | 제품 추천 허브 진입 복원 | `homeRoutes.tsx`, `RootNavigator.tsx`, 모바일 제품추천 계약 검사 | 자동 검증 완료 |
| 2 | 기존 화면/API 회귀 보존 | `ProductRecommendationScreen.tsx`, legacy `/products/recommendations`, 전체 backend suite | 자동 검증 완료 |
| 3 | 제품 검색 | `ProductSearchResultScreen.tsx`, trusted `search_catalog`, 검색 이벤트·private cache 테스트 | 자동 검증 완료 |
| 3-a | 추천 목적별 전체보기·카테고리 탐색 | 독립 `ProductRecommendationShelf` route, 전체·베이스·아이섀도우·아이브로우·치크·립·아이라이너 탭, 2열 반응형 grid, 목적별 reason 유지 | 자동·실기기 route 검증 완료 |
| 4 | 이동형 AURADIN orb | `AuradinFloatingOrb.tsx`, edge snap/long press/drag/Reduce Motion 정적 계약 | 자동 검증 완료, 촉감 QA 대기 |
| 5 | 시즌 상품 end-to-end | signed manifest, editor/reviewer/publisher RBAC, two-person publish, ETag, stale 표시, manual suspend/rollback, automated expiry, PostgreSQL 계약 | 자동 검증 완료 |
| 6 | AR 룩 저장과 완료 연결 | `savedArLookService.ts`, idempotent `clientRequestId`, 저장 완료 `arStyleId` route, PostgreSQL round-trip | 자동 검증 완료 |
| 7 | 실제 shade/finish AR 추천 | Lab/CIEDE2000, evidence/rights filter, delta-E 상한, known-vector·PostgreSQL 테스트 | 자동 검증 완료 |
| 8 | 상세·판매처·좋아요 통합 | trusted outbound, family like + shade context, tombstone, 화면별 focus resync | 자동 검증 완료 |
| 9 | 검색·좋아요·클릭 이벤트 | consent-gated server/client events, viewport/dedupe/idempotency/rate-limit 테스트 | 자동 검증 완료 |
| 10 | 닉네임 개인화 | decay profile, experiment split, 다양성 cap, private response | 자동 검증 완료, 실제 신호 활성화 대기 |
| 11 | 비슷한 컬러 취향 | 별도 opt-in, broad bucket, k>=100, item support>=5, contribution cap | 자동 검증 완료, 실제 모수·privacy 승인 대기 |
| 12 | 동의·철회·삭제·보존 | 목적별 consent, 즉시 파생 데이터 삭제, account cascade, retention cleanup | 자동 검증 완료 |
| 13 | 보안·catalog 신뢰 경계 | signed import, catalog-admin RBAC, allowlist/SSRF, rights/provenance, configurable offer freshness read gate, monitor exit gate, composite FK, audit/quarantine/rollback | 자동 검증 완료 |
| 14 | 모바일·backend·DB·알고리즘 테스트 | mobile type/contract/theme, full pytest, actual PostgreSQL schema/integration | 자동 검증 완료 |
| 15 | 실제 앱 전체 흐름 | iPhone 13 개발 앱 실행, 홈/허브, 개인화·시즌 전체보기 route, 좋아요/동의 API, 6개 시즌 카테고리 응답 확인 | 부분 실기기 완료; AR camera·접근성·오프라인 촉감 QA 대기 |

외부 상품 사용권·운영 secret·실제 모수·법무 승인이 없는 기능은 가짜 데이터로 대체하지
않는다. 해당 section은 feature flag 아래 비활성 또는 명시적 empty/off 상태를 유지한다.

## 실기기 검증 순서

사용자가 기기 연결 완료를 명시적으로 알린 뒤에만 다음 순서로 실행한다.

1. 앱 시작 → 로그인/홈 진입. 개발 환경변수와 무관하게 AURADIN이 자동으로 열리지 않는지 확인한다.
2. 홈 `추천 제품` → `ProductRecommendation` 허브가 열리는지 확인한다.
3. 기존 보고서·룩 선택, 카테고리 탭, 정렬, 카드, 좋아요가 유지되는지 확인한다.
4. 검색 → 결과 → 상세 → 판매처 → 뒤로가기와 좋아요 목록의 상태 일치를 확인한다.
5. AURADIN orb 탭·롱프레스·드래그·좌우 snap·스크롤 축소·복귀 상태를 확인한다.
6. AR 룩 저장 → 저장 완료 → `이 룩과 맞는 제품 보기` → 선택한 `arStyleId` section을 확인한다.
7. 시즌/AR/개인화/cohort의 ready·empty·off·error·retry 문구가 실제 서버 상태와 일치하는지 확인한다.
8. 네트워크 단절/복구, 작은 화면, safe area, 키보드, Dynamic Type, VoiceOver, Reduce Motion을 확인한다.
9. 동의 설정의 수락·철회·전체 삭제 후 이벤트와 추천 section 상태가 즉시 바뀌는지 확인한다.
10. 실제 권리 승인 catalog가 제공된 경우에만 shade·피니시 근거, 제휴 표시, seller outbound를 확인한다.

## 자동 검증 명령

```bash
cd apps/mobile
npm run typecheck
npm run test:product-recommendation
npm run test:auradin-theme-scope

cd ../../services/backend
../../.venv/bin/python -m pytest -q
AURA_PRODUCT_RECOMMENDATION_TEST_DATABASE_URL=<isolated-postgres-url> \
  ../../.venv/bin/python -m pytest -q tests/test_product_recommendation_postgres.py
```

실제 앱 실행, Simulator 부팅, 실기기 설치는 이 자동 검증 명령에 포함하지 않는다.

## 2026-07-13 실기기·로컬 통합 확인

- 연결 기기: iPhone 13 (`iPhone14,5`). Simulator는 사용하지 않았다.
- 설치된 개발 앱을 Metro에 연결해 새 번들을 실행했고 홈 API와 제품추천 section API가 200으로 응답했다.
- 개인화 `더보기`가 `/products/recommendations/personalized?limit=30`, 시즌 `더보기`가 `/products/recommendations/seasonal?limit=30`을 호출하는 독립 화면으로 열렸다.
- 시즌 전체보기는 실제 외부 판매 결과 18개를 반환했고 6개 카테고리가 각 3개씩 포함됐다. 허브 limit 12 응답은 round-robin으로 각 카테고리 2개씩 포함했다.
- 시즌 상품·이미지 URL은 전부 HTTPS 신뢰 경계를 통과했으며 위험 URL은 0개였다.
- 허브 재진입 갱신은 이미 표시한 상품을 유지한 채 백그라운드에서 수행하고, 검색·상세 화면은 늦게 끝난 이전 요청이 최신 결과를 덮지 않도록 request generation을 검증한다.
- 검색 제출 이벤트는 원문 query를 저장하지 않고, 전용 shelf의 이벤트 category는 7개 허용 enum만 통과시켜 개인정보 최소화와 모바일·서버 계약을 일치시켰다.
- 개발 PostgreSQL에 `schema.sql:product-category-brow-v1`을 적용했고 schema check가 통과했다.
- 자동 회귀 결과: backend `623 passed, 2 skipped`, mobile typecheck·제품추천 계약·AURADIN theme scope 통과.
- 남은 수동 QA: 수정 후 탭 높이 시각 확인, AURADIN drag/snap 촉감, AR camera 저장 왕복, 네트워크 단절/복구, Dynamic Type, VoiceOver, Reduce Motion.
