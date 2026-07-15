# 06. 구현 로드맵과 사전 승인

## 구현 전략

큰 화면을 한 번에 갈아엎지 않는다. 데이터 신뢰 경계를 먼저 고치고, 독립적으로 검증 가능한 vertical slice를 순서대로 완성한다.

```text
P0 보안/계약
  → 홈 추천 제품 진입 복원 + 기존 ProductRecommendation 보존
  → 추천 허브 section 리팩터링 + AURADIN edge-snapped orb
  → 시즌 end-to-end
  → AR recipe 저장 end-to-end
  → AR 색상 추천
  → 좋아요/검색 통합
  → 동의한 engagement 개인화
  → cohort
```

## Phase 0 — 승인·데이터 준비

목표: 구현 도중 다시 멈추지 않도록 제품·데이터·권한을 확정한다.

- 이 문서의 IA와 문구 승인
- 자체·제휴·정식 라이선스 제품/shade 카탈로그 원천 지정
- Naver Shopping Search 비의존 결정과 Insight 사용범위 승인
- 개인정보 목적·동의·보존·삭제 정책 승인
- 광고·제휴·연예인 콘텐츠 정책 승인
- staging DB migration/rollback 책임자와 window 확정
- iOS test account/device/camera QA 환경 확정
- 현재 수정 중인 iOS/Unity 파일의 소유자와 병합 방법 합의

완료 조건:

- 실제 product/shade 샘플 30–100개와 packshot/swatch/offer 각각에 source/license/allowed-use/validity/evidence가 있음
- secret은 secret manager/env에 있고 채팅·repo에 없음
- production 배포는 별도 release approval임을 합의

## Phase 1 — P0 보안과 도메인 계약

### Backend

- like endpoint에서 client product payload 제거
- internal product UUID만 허용
- catalog ingestion/admin 경계 추가 또는 기존 seed 경로 강화
- seller/image URL allowlist
- 기존 `FullFaceMakeupRecipe version: 2` validation과 `saved_ar_look_v1` envelope/normalization adapter
- 기존 `saved_makeup_styles` create에 `clientRequestId` idempotency, detail/archive/delete lifecycle 추가
- 서버가 `sourceFrameMetadata`를 제거하고 recommendation projection을 재계산

### Mobile

- AR 저장 service가 최종 editor state 전체를 recipe DTO로 map
- navigation에는 `arStyleId`만 전달
- AURADIN local liked state를 서버 like service로 통합할 adapter 준비

### Tests

- 악성 purchase URL/metadata가 like로 저장되지 않음
- 다른 사용자 style ID 조회 불가
- recipe enum/range/version validation
- 동일 `clientRequestId` retry가 중복 style을 만들지 않음
- archive/delete 후 즉시 추천 제외와 thumbnail/cache cleanup
- 기존 like/unlike idempotency

완료 조건: security P0 regression test 통과.

## Phase 2 — 추천 허브 UI와 AURADIN 연결

### Navigation

- `homeRoutes.tsx`: `추천 제품` → `ProductRecommendation`
- route params에 `arStyleId`, `initialSection`
- AURADIN에 명시적 back/close
- 검색 결과/제품 상세 route 추가

### UI

- 기존 `ProductRecommendationScreen`을 기준 화면으로 유지
- 기존 기준 보고서 선택, 추천 기준 룩/이미지 선택, 카테고리 탭, 정렬, 제품 카드, 색상 팔레트, 구매 링크, 좋아요 보존
- 기존 `DetailRouteChrome`+`headerRightSlot`, search, edge-snapped AURADIN orb 추가
- AR empty/ready/error skeleton
- AR region chip과 region별 rail/default 선택
- seasonal empty/ready/error skeleton
- 개인화/P2 section은 feature flag 또는 숨김
- product rail/card/heart shared component
- production mock fallback 제거; dev fixture 명시 주입

### QA

- 402×874, small device, notch/safe area
- loading/empty/error/refresh/offline/keyboard
- Dynamic Type/VoiceOver/Reduce Motion
- AURADIN 복귀 시 state 보존

완료 조건: API가 비어 있어도 정직한 end-to-end flow가 동작.

## Phase 3 — 시즌 추천 end-to-end

가장 먼저 실제 가치를 제공할 수 있는 vertical slice다.

### Data/Backend

- seasonal collection/item schema와 migration
- product/shade/asset/offer별 권리·유효기간 schema와 강제 후보 filter
- 서명 manifest/internal CLI 또는 admin import 경계
- editor/publisher 분리 RBAC, 상태 전이, audit/rollback
- publish/review/suspend/expiry validation
- public seasonal endpoint, cache/ETag
- Naver Shopping Insight adapter는 feature flag 아래 trend signal만 생성
- provider 실패 시 최근 승인 collection fallback과 stale policy

### Mobile

- collection card, source/period/review metadata
- product detail·seller CTA·likes
- partial failure retry

### 운영

- 주 1–2회 editor review owner
- 품절/가격 stale monitor
- 광고/제휴 badge review

완료 조건: 실제 source가 있는 상품과 만료되는 시즌 컬렉션이 production-like staging에서 동작.

## Phase 4 — AR 저장 end-to-end

### Contract

- recipe v2 원본 region(`lip`, `blush`, `eyeliner`)을 보존하는 `saved_ar_look_v1` adapter
- `blush→cheek`, `eyeliner→liner`, raw finish→canonical finish normalization
- P0 color semantics를 shader 입력색인 `authoring_color`로 고정
- opacity/intensity/blend mode와 recipe/renderer version 저장
- raw face/landmark/`sourceFrameMetadata` 제외 unit test

### Save flow

- AR 저장 클릭 → `/api/makeup-styles`
- 서버 style ID 응답 → 저장 완료 화면
- `이 룩과 맞는 제품 보기` → hub with `arStyleId`
- 저장 실패/중복 retry/idempotency
- detail/archive/delete와 파생 run/cache/media cleanup
- 기본 thumbnail은 비얼굴 swatch mosaic; 얼굴 thumbnail은 별도 opt-in일 때만
- 앱 재시작 후 동일 룩 재현 smoke test

현재 dirty iOS/Unity 파일과 겹치면 그 변경을 보존한 상태에서 담당자 확인 후 최소 diff로 작업한다. JS bridge에서 충분히 얻을 수 없는 값만 native/Unity 계약을 확장한다.

완료 조건: 저장 전/후 recipe round-trip 비교와 재현성 확인.

## Phase 5 — AR shade 추천

### Catalog

- product_shades, product_assets, product_offers와 각각의 evidence/provenance/권리 만료
- Lab 값 ingest/검증
- category/finish mapping
- inactive/expired/unlicensed candidate 제거

### Ranking/API

- sRGB→Lab/ΔE2000 unit tests with known vectors
- 후보 생성과 rule-based rerank
- `runId`, algorithmVersion, reasonCodes
- `noArStyle`, `unsupportedRecipe`, `noEligibleProducts`
- `% 매치` 제거

### QA

- 전문가 relevance set
- 립/블러셔 category별 top-K review, 검수 liner가 있으면 아이라이너 확장
- 브랜드·가격 다양성
- 화면 swatch와 실제 근거의 차이 고지

완료 조건: 검수 set의 합의 기준과 no-fake-data gate 충족.

## Phase 6 — 검색·좋아요·상세 통합

- exact product search와 AURADIN filter search가 동일 catalog service 사용
- AURADIN/허브/detail/liked list가 동일 heart state
- heart는 product family 단위, 추천 shade는 문맥으로만 보존
- 신규 like의 published/rights-valid 검증과 만료 liked item sanitized tombstone
- seller outbound allowlist/affiliate disclosure
- optimistic update rollback
- Naver legacy product search feature flag off rehearsal

완료 조건: 어느 화면에서 like/unlike해도 즉시·재접속 후 일치.

## Phase 7 — 선택형 engagement 개인화

- 목적별 opt-in UI와 설정/철회
- batched idempotent event endpoint
- event별 required-field matrix; search/like/unlike/outbound는 해당 server transaction에서 기록
- impression viewport 기준과 dedupe
- raw/derived retention job
- simple decayed preference profile
- control 대비 실험, diversity guardrail

완료 조건: 동의하지 않은 계정에서 event/derived profile이 생성되지 않고, 철회 후 삭제 테스트 통과.

## Phase 8 — 유사 컬러 취향

- opt-in cohort feature
- broad bucket, `k ≥ 100` 시작점, rare bucket merge
- contribution cap/abuse filtering
- section wording and explainability
- 재식별·편향 review

완료 조건: 충분한 실제 모수, privacy review, control 대비 가치가 있을 때만 켬.

## 예상 변경 파일

정확한 파일은 구현 전 최신 branch를 다시 확인한다.

### Mobile

- `apps/mobile/src/app/navigation/routes/homeRoutes.tsx`
- `apps/mobile/src/app/navigation/routes/recommendationRoutes.tsx`
- `apps/mobile/src/app/navigation/RootNavigator.tsx`
- root route params/linking/chrome 관련 파일
- `apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx`
- `apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx`
- `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`
- 새 `features/recommendation/components`, `hooks`, `types`
- AR save flow/service mapper 관련 파일

### Backend

- `services/backend/app/api/products.py`
- `services/backend/app/api/makeup_styles.py`
- `services/backend/app/schemas/*`
- `services/backend/app/services/shopping_products.py`의 legacy 격리
- 새 catalog/trend/ranking service
- `services/backend/app/db/init_db.py`
- `services/backend/app/db/check_schema.py`
- cleanup/deletion/audit 관련 service

### DB/docs/tests

- `docs/backend/schema.sql`
- `docs/backend/aws-postgresql-schema.dbml`
- mobile route/service/component tests
- backend API/security/ranking/schema tests

## 충돌 방지

현재 worktree에는 제품 추천 계획과 무관한 iOS/Unity 수정과 `docs/product-ideation/`이 있다. 구현 시 다음을 준수한다.

- 사용자 변경을 reset/restore하지 않음
- 먼저 `git diff`로 겹치는 hunk 확인
- 가능하면 RN/backend 경계에서 구현
- native/Unity 파일 수정이 필요하면 기존 diff를 보존하고 파일 담당자와 합의
- 자동 formatter를 repo 전체에 실행하지 않음
- commit은 phase별 작고 독립적으로 구성

## 구현 시작 전 한 번에 필요한 승인·권한

사용자가 “아래 A–H를 승인”하고 필요한 자산을 안전한 경로로 제공하면, 로컬 구현 중 사소한 선택을 다시 묻지 않고 이 계획의 기본값으로 진행할 수 있다. 다만 production 배포, 실제 사용자 데이터 처리, 유료 외부 서비스 사용은 별도 실행 승인 대상이다.

### A. 제품·UX 승인

- [ ] 추천 제품의 기본 진입을 `ProductRecommendation` 허브로 복원
- [ ] 기존 제품 추천 페이지의 보고서 선택, 룩 선택, 카테고리 탭, 제품 카드, 구매 링크, 좋아요 흐름을 P0에서 보존
- [ ] AURADIN을 제품 카드·하단 네비게이션을 가리지 않는 edge-snapped 젤리 orb로 배치
- [ ] section 순서: AURADIN → AR → 시즌 → 개인화 → 코호트
- [ ] fake match percentage 제거, reason chips 사용
- [ ] AR 데이터가 없을 때 mock 상품 대신 `AR 룩 만들기`
- [ ] AR rail은 `립/블러셔/아이라이너` region별로 분리하고 립을 우선 선택

### B. 범위·코드 승인

- [ ] mobile, backend, DB schema, tests를 함께 변경
- [ ] 기존 AURADIN 내부 로직은 보존하되 back/likes/catalog 경계 수정
- [ ] 현 dirty iOS/Unity 변경을 보존하며, 불가피할 때만 겹치는 파일 수정
- [ ] 새 UI/icon library를 추가하지 않고 기존 Tamagui/assets 사용
- [ ] legacy API는 호환기간 후 feature flag/deprecation

### C. 상품 데이터·외부 API 승인

- [ ] 실제 상품 원천을 자체·제휴·정식 라이선스 카탈로그로 지정
- [ ] 기존 Naver Shopping Search를 신규 상품 source로 사용하지 않음
- [ ] Naver Shopping Insight는 시즌 trend signal로만 사용
- [ ] Naver에 API HUB의 shopping product 대체/저장·재정렬 허용범위 서면 확인
- [ ] product image, swatch, price, seller URL 각각의 이용권리·허용용도·만료일 제공

필요한 비밀값은 채팅에 붙이지 말고 server secret manager 또는 로컬 `.env`의 기존 key 이름으로 제공한다.

### D. 개인정보·법무 승인

- [ ] AR recipe 저장·추천 목적과 삭제/보존 정책
- [ ] 저장 얼굴 thumbnail은 기본 미저장; 제공 시 별도 opt-in/private media lifecycle
- [ ] engagement 개인화와 cohort의 분리된 opt-in
- [ ] 초기 보존안 또는 조직의 대체 기간
- [ ] 14세 미만 정책
- [ ] 광고·affiliate disclosure
- [ ] 연예인 이름/사진은 권리 없으면 쓰지 않음
- [ ] 처리방침/동의문/국외이전·수탁 검토 담당자 지정

### E. 보안 승인

- [ ] client product payload like 방식 폐기
- [ ] existing catalog 일회성 integrity audit
- [ ] seller/image domain allowlist 제공
- [ ] rate limit, audit log, secret rotation, incident owner
- [ ] raw face/landmark/identity embedding은 추천 pipeline에 저장하지 않음
- [ ] 시즌 production publish의 editor/publisher 분리와 audit/즉시 suspend

### F. 환경·검증 권한

- [ ] local backend/mobile test 실행
- [ ] iOS simulator와 필요 시 실기기 camera/AR QA
- [ ] staging DB migration 적용·rollback 권한과 접속 방법
- [ ] Naver API HUB/partner catalog sandbox 네트워크 호출
- [ ] AWS Bedrock을 유지할 경우 승인된 계정·region/IAM과 비용 한도

로컬 구현에는 broad 관리자 권한이 필요하지 않다. GUI/실기기/외부 네트워크/DB migration은 실행 시 환경의 보안 승인 창이 뜰 수 있으며, 이 목록에 동의해도 도구 자체의 최소권한 승인 절차는 우회하지 않는다.

### G. 운영 콘텐츠

- [ ] 시즌 컬렉션 editor와 별도 publisher, 검수 SLA
- [ ] 첫 2–4개 시즌 테마·기간·출처
- [ ] 품절/가격 갱신 책임자
- [ ] 제품 전문가 AR relevance 검수자

### H. 배포 경계

- [ ] local/staging 구현과 QA까지 자율 진행
- [ ] production DB migration, app release, 사용자 event 수집 활성화는 별도 승인
- [ ] production feature flag owner와 rollback 조건

## 승인 응답 템플릿

```text
A–H 승인합니다.
예외:
- (변경할 항목)

카탈로그 원천/담당자:
Naver 확인 담당자:
개인정보·법무 담당자:
시즌 에디터:
staging 환경 안내 위치:
```

비밀키·비밀번호·token은 이 응답에 쓰지 않는다.

## 예상 일정 단위

팀 규모와 카탈로그 준비에 따라 달라지므로 날짜 약속 대신 결과 단위로 관리한다.

- Slice 1: security contract + hub shell
- Slice 2: 실제 시즌 collection end-to-end
- Slice 3: AR recipe save round-trip
- Slice 4: AR shade ranking end-to-end
- Slice 5: unified likes/search/detail
- Slice 6: consented personalization

각 slice는 typecheck/test/visual QA/rollback 가능한 feature flag를 포함해야 완료다.
