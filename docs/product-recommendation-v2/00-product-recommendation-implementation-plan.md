# 제품 추천 페이지 구현 계획서

작성일: 2026-07-13  
문서 상태: 구현 기준안  
담당 범위: 홈의 `추천 제품`에서 진입하는 제품 추천 허브

## 1. 이 문서의 결론

제품 추천 페이지는 AURADIN 화면으로 대체하지 않는다. 홈에서 `추천 제품`을 누르면 기존 `ProductRecommendationScreen`을 기반으로 한 제품 추천 허브가 먼저 열리고, 그 안에서 AR 추천·시즌 상품·검색·좋아요를 제공한다. AURADIN은 이 허브에서 더 구체적인 조건을 말로 탐색하는 보조 진입점이다.

1차 출시의 중심은 다음 두 가지다.

1. 저장된 AR 룩의 색상·피니시·강도와 실제 제품 shade를 비교하는 AR 기반 추천
2. 기간·트렌드 근거·검수 시점이 있는 시즌 상품

AR 저장 데이터가 아직 준비되지 않은 사용자는 임의 상품을 `AR 추천`으로 보지 않는다. `AR 룩 만들기`와 `최근 분석으로 보기`를 제공한다. 시즌 상품은 AR과 독립적으로 먼저 출시한다.

## 2. 현재 코드 기준선과 문제

### 재사용할 코드

| 영역 | 현재 위치 | 계획 |
| --- | --- | --- |
| 제품 추천 화면 | `apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx` | 기존 보고서 선택, 룩 선택, 탭, 정렬, 카드, 구매 링크, 좋아요를 P0에서 보존 |
| 추천 API 호출 | `apps/mobile/src/features/recommendation/services/productRecommendationService.ts` | 기존 adapter를 유지하고 section API를 점진적으로 추가 |
| 라우트 | `ProductRecommendation` in `RootNavigator.tsx` | 홈의 추천 제품 목적지로 복원 |
| AURADIN agent | `AuradinSearch` route/screen | orb 탭으로 기존 대화·세션·agent 로직을 그대로 호출 |
| 추천 API | `GET /api/products/recommendations` | 기존 응답 호환. AR/시즌 section은 additive contract로 확장 |
| 좋아요 API | `GET /api/products/liked`, `POST/DELETE /api/products/{productId}/like` | 모든 section·AURADIN·마이페이지에서 동일 저장소 사용 |

### 수정해야 할 진입 오류

현재 홈의 `onPressProductRecommendations`가 `AuradinSearch`로 이동한다.

```tsx
// 현재
onPressProductRecommendations={() => rootNavigation?.navigate('AuradinSearch')}

// 목표
onPressProductRecommendations={() => rootNavigation?.navigate('ProductRecommendation')}
```

AURADIN을 바로 열어야 하는 버튼에는 `아우라딘에게 물어보기`를 명시적으로 사용한다. `추천 제품`이라는 라벨과 AURADIN hero를 한 목적지로 묶지 않는다.

## 3. 사용자 흐름과 정보 구조

```text
홈
└─ 추천 제품
   └─ 제품 추천 허브
      ├─ 제품 검색 → 검색 결과 → 제품 상세 → 판매처
      ├─ AURADIN 젤리 orb → 대화형 제품 탐색 → 제품 결과
      ├─ 저장한 AR 룩과 맞는 제품 → 제품 상세
      ├─ 지금 주목할 시즌 상품 → 시즌 컬렉션 → 제품 상세
      ├─ 서진님을 위한 추천 → 좋아요·검색·클릭 기반
      ├─ 비슷한 컬러 취향 추천 → 충분한 익명 집계 이후
      └─ 좋아요 → 마이페이지 좋아요 목록
```

### 화면 순서

1. 상단바: 뒤로가기, `제품 추천`, 알림, 채팅
2. 제품 검색: 브랜드·제품명·카테고리의 정확 검색
3. 저장한 AR 룩과 맞는 제품: P0
4. 지금 주목할 시즌 상품: P0
5. `{닉네임}님을 위한 추천`: P1
6. `비슷한 컬러 취향이 많이 저장했어요`: P2

각 section은 독립적으로 로딩·빈 상태·오류·재시도를 갖는다. AR 오류 때문에 시즌 상품까지 사라지면 안 된다.

## 4. AURADIN 젤리 orb 배치 결정

### 결정

AURADIN은 compact banner가 아니라 `젤리 orb 플로팅 아이콘`으로 제공한다. 다만 화면 아무 곳에나 놓이는 자유 이동 방식은 사용하지 않고, 가장자리 안전 영역으로 스냅되는 이동형 FAB로 만든다.

이 방식은 현재 홈 오른쪽 아래에 있는 반짝이 플로팅 액션과 패턴을 이어가면서도, 제품 추천 허브를 AURADIN hero로 덮지 않는다.

### 동작 명세

| 상태 | 동작 |
| --- | --- |
| 기본 | 오른쪽 하단, 하단 네비게이션·safe area 위에 52pt orb |
| 탭 | 기존 `AuradinSearch` route와 대화 로직 열기. 새 에이전트 화면을 제품추천 안에 재구현하지 않음 |
| 길게 누르기 300ms 후 드래그 | 이동 모드 진입. 좌·우 가장자리와 상·하단 안전 영역만 허용 |
| 손을 뗌 | 가장 가까운 가장자리로 자동 스냅하고 위치 저장 |
| 스크롤 중 | 36pt mini orb로 축소. 빠른 스크롤 중에는 숨기고 정지 후 복귀 |
| 첫 노출 | 1회만 `길게 눌러 위치를 옮길 수 있어요` 안내 |
| 접근성 | VoiceOver에서는 `아우라딘 열기`, `아우라딘 위치 이동`을 별도 action으로 제공 |

### 안전 규칙

- 제품 카드의 하트·가격·구매 버튼 위에는 놓이지 않는다.
- 하단 네비게이션과 겹치지 않는다.
- 최소 44×44pt hit target을 유지한다.
- orb 애니메이션은 loop하지 않고, reduced-motion에서는 정지한다.
- 위치는 계정 데이터로 저장하지 않고 기기별 로컬 설정으로 시작한다.
- AURADIN 오류가 제품 추천 전체 오류처럼 보이지 않도록 허브와 별도 오류 상태를 사용한다.

### 시각 규칙

- 아우라딘의 젤리 orb는 정적 이미지 또는 저비용 애니메이션으로 축소한다.
- `PersistentOrb`의 전체 화면 GL 인스턴스를 리스트 안에 중복 mount하지 않는다.
- 기본 제품 페이지는 기존 흑백·화이트 Premium K-beauty 톤을 유지하고, orb에만 하늘색·라일락·핑크 포인트를 쓴다.
- orb만 보고 의미를 모르는 사용자를 위해 첫 노출 시 짧은 label을 보여주고 이후에는 아이콘으로 축소한다.

## 5. UI 상세 설계

### AR 추천 section

```text
저장한 AR 룩과 맞는 제품                         기준 룩 변경
로즈 글로우 · 07.12 저장
[립] [블러셔] [아이라이너]
선택한 색상과 가까워요 · 글로우 피니시가 비슷해요
[제품 카드] [제품 카드] [제품 카드]
```

- region별 rail을 사용한다. 한 rail에 립·블러셔를 섞지 않는다.
- 제품 카드에는 제품명, 브랜드, shade, 가격, 근거 chip, 좋아요를 보여준다.
- 검증 전에는 `95% 일치` 같은 숫자를 사용하지 않는다.
- AR 룩이 없으면 다음 empty state만 표시한다.
  - `저장한 AR 룩이 아직 없어요`
  - `색상과 질감을 조정해 저장하면 맞는 제품을 찾아드려요`
  - 주 CTA `AR 룩 만들기`
  - 보조 CTA `최근 분석으로 추천 보기`

### 시즌 section

```text
지금 주목할 시즌 상품                         전체보기
7월 2주차 · 에디터 검수 2026.07.13
[여름 글로우 립 컬렉션]
[장마철 세미매트 베이스]
```

- 트렌드 주제 카드와 관련 제품 rail을 분리한다.
- `판매 1위`, `요즘 모두가 구매` 대신 `최근 검색 클릭 추이 상승`, `에디터 검수`를 표시한다.
- 각 카드에 `trendWindow`, `sourceUpdatedAt`, `reviewedAt`를 표시할 수 있어야 한다.
- 시즌 데이터가 만료되면 마지막 승인 콘텐츠를 stale 표시하거나 section을 숨긴다.

### 개인화 section

- `{닉네임}님을 위한 추천`
- 설명: `좋아요·검색·최근 본 제품을 반영했어요`
- 행동 데이터 동의가 없거나 데이터가 부족하면 개인화처럼 포장하지 않고 section을 숨기거나 안내한다.

### 좋아요

- 모든 section과 AURADIN은 동일한 product ID로 좋아요 상태를 공유한다.
- optimistic update 후 실패하면 원상 복구한다.
- 성공 토스트: `좋아요한 제품에 저장했어요 · 보기`
- 좋아요 버튼은 최소 44×44pt, `좋아요 추가/취소` 접근성 label을 제공한다.

## 6. 추천 기술 설계

### 6.1 AR 레시피 계약

AR runtime이 완성되지 않아도 아래 계약과 adapter를 먼저 만든다.

```ts
type SavedArLookV1 = {
  id: string;
  source: 'ar_editor' | 'preset';
  recipeVersion: 1;
  regions: Array<{
    region: 'lip' | 'blush' | 'eyeliner' | 'base';
    authoringColorHex: string;
    finish: 'matte' | 'satin' | 'gloss' | 'shimmer';
    intensity: number;
    opacity: number;
  }>;
  rendererVersion: string;
  savedAt: string;
};
```

- 원본 얼굴 프레임·랜드마크·신원 얼굴 임베딩은 이 계약에 넣지 않는다.
- 화면에 합성된 색과 shader 입력색인 `authoringColorHex`를 구분한다.
- 기존 recipe v2와 `saved_makeup_styles`를 깨지 않는 normalization adapter를 둔다.
- 저장 완료 화면에 `이 룩과 맞는 제품 보기`를 추가하고 `arStyleId`만 제품 추천 route로 전달한다.

### 6.2 AR 색상 추천

네이버 상품명에 색상 임베딩을 보내는 방식은 실제 shade를 증명하지 못한다. P0의 진짜 색상 비교는 정식 사용권이 있는 제품 shade catalog에서 수행한다.

```text
AR authoringColorHex
  → 표준 색공간 변환
  → 제품 shade Lab 값과 ΔE2000 계산
  → 카테고리·finish·intensity 필터
  → 재고·권리·품질·다양성 rerank
  → reasonCodes가 포함된 응답
```

텍스트 임베딩은 `청순한 여름 무드`, `데일리 글로우` 같은 문맥·무드 보조 신호에만 사용한다. 실제 색상 매칭을 임베딩 유사도로 단정하지 않는다.

### 6.3 시즌 추천

```text
Naver Shopping Insight 상대 클릭 추이
  → 승인된 키워드 사전
  → 동일 기간 안의 추세 계산
  → 에디터 검수
  → 권리·재고가 확인된 자체 상품 catalog 매핑
  → 만료일이 있는 시즌 collection 공개
```

Naver Shopping Search를 신규 상품 원천으로 고정하지 않는다. 2026-07-31 종료 공지와 API HUB 전환 범위를 확인하고, 상품 이미지·가격·구매 링크·shade를 저장·재가공할 권리는 별도로 확보한다.

### 6.4 추천 응답 공통 메타데이터

모든 recommendation section 응답에는 다음을 포함한다.

- `reasonCodes`
- `rankingVersion`
- `catalogVersion`
- `sourceUpdatedAt`
- `sponsored`
- `trendWindow` (시즌만)
- `recipeVersion` (AR만)
- `isStale`

## 7. API·데이터 변경 계획

### P0 기존 계약 보존

- `GET /api/products/recommendations`: 기존 화면이 기대하는 `tabs`, `products`, `sets`, look mapping을 유지
- `GET /api/products/liked`: 제품 ID 기준 좋아요 목록
- `POST/DELETE /api/products/{productId}/like`: 내부 카탈로그의 활성 제품 ID만 허용

### 추가 계약

```text
GET /api/products/recommendations/ar?arStyleId=...
GET /api/products/recommendations/seasonal?cursor=...
GET /api/products/search?q=...
POST /api/recommendation-events
```

실제 route 이름은 기존 FastAPI convention에 맞춰 확정하되, 기존 endpoint를 삭제하고 새 endpoint로만 교체하지 않는다.

### 서버 신뢰 경계

- 클라이언트가 보낸 브랜드명·구매 URL·이미지 URL로 공용 상품 row를 upsert하지 않는다.
- 좋아요 payload는 내부 `productId` 또는 서버가 발행한 서명 token만 받는다.
- 상품은 `published`, 권리 유효, 판매 상태를 통과한 경우만 새 좋아요를 허용한다.
- 오래된 좋아요 상품은 목록에서 `판매 종료`로 안전하게 표시하되 unlike는 허용한다.
- 개인화 응답은 `Cache-Control: private, no-store`를 사용한다.
- 시즌 공개 응답만 검증된 공개 캐시를 사용한다.

## 8. 모바일 구현 구조

기존 화면을 먼저 동작시킨 뒤 section을 컴포넌트로 분리한다.

```text
features/recommendation/
  screens/ProductRecommendationScreen.tsx
  components/ProductRecommendationHeader.tsx
  components/ProductSearchBar.tsx
  components/ArRecommendationSection.tsx
  components/SeasonalRecommendationSection.tsx
  components/PersonalizedRecommendationSection.tsx
  components/AuradinFloatingOrb.tsx
  components/ProductCard.tsx
  hooks/useProductRecommendations.ts
  hooks/useDraggableAuradinOrb.ts
  services/productRecommendationService.ts
  services/productSearchService.ts
  types.ts
```

구현 규칙:

- Tamagui와 기존 theme token만 사용한다.
- 새 UI/icon library를 추가하지 않는다.
- screen 안에 ranking·API·drag 계산을 직접 넣지 않는다.
- `requestBackendJson`과 기존 service pattern을 사용한다.
- mock은 개발 빌드의 명시적인 fixture로만 남기고 production fallback으로 쓰지 않는다.
- 402×874, 작은 화면, safe area, keyboard, Dynamic Type, VoiceOver, Reduce Motion을 함께 검증한다.

## 9. 구현 단계와 완료 조건

### Phase 0 — 승인과 데이터 준비

- [ ] 제품 추천 허브 진입과 AURADIN 보조 역할 승인
- [ ] AR/시즌 P0 우선순위 승인
- [ ] 제품·shade·이미지·가격·구매 링크의 정식 사용권 원천 확정
- [ ] Naver 사용 범위와 종료 대응 승인
- [ ] AR recipe 저장·개인화·유사 취향 동의/보존 정책 승인
- [ ] 시즌 editor/publisher와 품절·가격 갱신 담당자 지정

### Phase 1 — 기존 허브 복원

- [ ] 홈 `추천 제품` → `ProductRecommendation`
- [ ] 기존 제품 추천 API, 보고서 선택, 룩 선택, 탭, 정렬, 카드, 좋아요 유지
- [ ] 사용자용 empty/error/retry 문구 정리
- [ ] 기존 제품 추천 화면이 API 없이도 목업으로 위장되지 않는 개발/운영 분리

### Phase 2 — P0 UI vertical slice

- [ ] AR section ready/empty/error 상태
- [ ] 시즌 collection ready/empty/error 상태
- [ ] AURADIN edge-snapped orb, 탭·롱프레스·드래그·스냅
- [ ] 제품 상세·판매처·좋아요 연결

### Phase 3 — 시즌 end-to-end

- [ ] 시즌 schema와 승인된 collection import
- [ ] trend source, 기간, 검수일, stale policy
- [ ] 권리·재고·광고/제휴 badge
- [ ] 공급자 실패 시 마지막 승인 결과 또는 명시적 empty state

### Phase 4 — AR 저장·추천 end-to-end

- [ ] 저장 AR recipe normalization
- [ ] 저장 완료 → `arStyleId` → 제품 추천 허브
- [ ] shade Lab/ΔE2000와 finish 기반 ranking
- [ ] 실제 데이터가 없을 때 fake recommendation 차단

### Phase 5 — 개인화와 유사 취향

- [ ] 좋아요·검색·클릭 이벤트와 선택 동의
- [ ] 삭제·철회·보존기간 job
- [ ] 충분한 익명 모수 이후 컬러 취향 cohort
- [ ] 편향·재식별·다양성 평가

## 10. 보안·개인정보·법무 게이트

출시 전 다음을 통과하지 못하면 추천 결과를 공개하지 않는다.

- 원본 얼굴 영상·사진을 추천 서버에 저장하지 않음
- 신원 식별용 얼굴 임베딩을 만들지 않음
- AR recipe와 행동 데이터의 목적·보존·삭제를 문서화
- 개인화와 유사 취향을 선택 동의로 분리
- 외부 API key는 서버 secret manager에만 보관
- 상품·이미지·구매 URL의 권리와 허용 용도 확인
- 협찬·제휴 제품을 자연 추천과 분리하고 즉시 표시
- 연예인 이름·사진·AI 유사 이미지는 권리 승인 없이는 사용하지 않음
- 화장품 효능·의학적 표현은 에디터/법무 검수
- 외부 URL, 이미지 proxy, SSRF, prompt injection, IDOR, rate limit 테스트
- Naver Shopping Search 종료 및 API HUB 계약 확인

이 문서는 법률 자문을 대체하지 않는다. 실제 사용자 데이터·외부 API·광고를 활성화하기 전 법무와 개인정보 담당자의 최종 승인을 받는다.

## 11. 검증 지표와 출시 중단 기준

### 품질 지표

- AR: 전문가 검수 set의 색상 Top-K 정밀도, 중앙 ΔE2000
- 시즌: 트렌드 갱신 신선도, 품절률, stale 노출률
- 제품: 제품·브랜드·가격대 다양성, 카드 상세 진입률
- 신뢰: `색이 달라요` 피드백, 숨김·취소율, 추천 근거 열람률
- 개인화: 동의 사용자와 비동의 사용자의 데이터 분리, 삭제 SLA

### 즉시 중단 조건

- shade 근거가 없는 상품이 `AR 기반`으로 노출됨
- 만료·권리 미확인 상품이 시즌 section에 노출됨
- 한 사용자의 추천/AR recipe가 다른 사용자에게 노출됨
- 좋아요 요청으로 공용 상품명·링크·이미지가 오염됨
- Naver/외부 공급자 장애 시 임의 상품으로 자동 대체됨
- 허위·과장·의학적 표현 또는 협찬 미표시가 발견됨

## 12. 구현 시작 전 한 번에 필요한 승인

다음 항목을 승인받으면 로컬 구현과 staging QA는 계획의 기본값으로 진행한다.

1. 홈 `추천 제품`을 제품 추천 허브로 복원
2. 기존 추천 화면/API/좋아요를 삭제하지 않고 확장
3. P0를 AR 추천과 시즌 상품으로 지정
4. AURADIN은 허브 안의 이동 가능한 edge-snapped 젤리 orb로 제공
5. 실제 shade catalog가 없으면 AR 추천을 빈 상태로 유지
6. Naver는 색상 검색 엔진이 아니라 시즌 신호 또는 계약이 확인된 보조 source로 제한
7. 모바일·FastAPI·DB schema·테스트를 함께 변경
8. 새 UI/icon library를 추가하지 않음
9. 개인정보 동의·삭제·보존과 광고/제휴 표시를 구현 범위에 포함
10. production 배포, 실제 사용자 이벤트 수집, 외부 유료 API 사용은 별도 승인

## 13. 최종 완료 기준

- 홈 `추천 제품`에서 기존 제품 추천 허브가 열린다.
- 기존 제품 추천 목록·보고서/룩 선택·좋아요가 회귀하지 않는다.
- AR 저장 룩이 있으면 실제 shade/finish 근거가 있는 제품만 AR section에 표시된다.
- AR 저장 룩이 없으면 목업 상품 대신 `AR 룩 만들기`가 표시된다.
- 시즌 상품은 기간·출처·검수 시점을 가지고 AR과 독립적으로 동작한다.
- AURADIN orb는 제품 카드를 가리지 않고 탭·롱프레스·드래그·스냅이 동작한다.
- 모든 제품의 좋아요가 제품 추천·AURADIN·마이페이지에서 일치한다.
- 로딩·빈 상태·오류·새로고침·오프라인·safe area·접근성 상태가 검증된다.
- 보안·개인정보·권리·광고 게이트가 통과된다.
