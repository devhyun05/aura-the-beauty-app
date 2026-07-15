# 01. 현재 상태와 실현 가능성

## 판단

| 기능 | 현재 가능성 | 판단 근거 | 선행 작업 |
| --- | --- | --- | --- |
| 제품 추천 허브 복원 | 높음 | 화면·route·API가 삭제되지 않고 남아 있음 | 홈 진입 경로와 화면 구조 변경 |
| 시즌 추천 | 높음 | AR과 독립적으로 트렌드 신호+편집 컬렉션 구성 가능 | 정식 상품 카탈로그, 출처·유효기간 |
| 저장 AR 룩 기반 추천 | 중간 | AR 조정값 타입은 있으나 저장 단계에서 유실 | 최종 레시피 영속화, shade Lab 데이터 |
| 좋아요 기반 개인화 | 중간 | 서버 좋아요 API는 있음 | 보안 수정, 이벤트/랭킹 설계 |
| 검색·클릭 기반 개인화 | 낮음→중간 | 현재 영속 이벤트가 없음 | 동의, 이벤트 수집, 품질·삭제 파이프라인 |
| 유사 사용자 추천 | 낮음 | 집단 데이터·동의·최소 모수 없음 | P2로 분리, 집계형 코호트 구축 |

따라서 `AR 기능이 완벽하지 않아 구현이 불가능한가?`에 대한 답은 “아니다”이다. UI, 계약, 데이터 모델과 시즌 추천은 지금 구현할 수 있다. 다만 AR 제품 rail은 저장된 최종 레시피가 없을 때 정직한 empty state를 보여줘야 하며, 실제 색상 일치 결과는 두 가지 조건을 충족한 뒤 활성화해야 한다.

1. 사용자가 저장한 최종 AR 룩이 기존 recipe v2를 포함해 부위별 authoring color·피니시·강도·opacity·blend mode를 보존한다.
2. 추천 대상 제품 shade가 측정 또는 검수된 색상·피니시 근거를 가진다.

## 현재 진입 경로

- `apps/mobile/src/app/navigation/routes/homeRoutes.tsx`에서 홈의 `추천 제품` 액션이 현재 `AuradinSearch`로 바로 이동한다.
- `ProductRecommendation` route와 `ProductRecommendationScreen`은 그대로 남아 있다.
- `RootNavigator`에도 `ProductRecommendation`, `AuradinSearch`가 모두 등록돼 있다.
- 다른 전역 진입점 일부는 이미 `ProductRecommendation`을 사용한다.

권고 변경은 삭제나 재구축이 아니라 다음처럼 진입 책임을 되돌리는 것이다.

```text
Home 추천 제품
  → ProductRecommendation 허브
      ├─ 정확한 제품 검색
      ├─ AURADIN 대화형 탐색
      ├─ 저장한 AR 룩과 닮은 제품
      ├─ 지금 주목할 시즌 룩
      ├─ 나를 위한 추천
      └─ 비슷한 컬러 취향이 좋아한 제품
```

이때 `ProductRecommendation`은 새로 만든 AURADIN 스타일의 랜딩 화면이 아니다. 현재 홈에 보이는 `추천 제품` 카테고리 버튼의 목적지이며, 기존 제품 추천 페이지에서 이미 제공하던 다음 요소를 구현 자산으로 가져간다.

- 기준 보고서 선택: `getFaceAnalysisReports({limit: 20})`로 받은 얼굴진단 리포트 중 하나를 추천 기준으로 선택
- 추천 기준 룩/이미지 선택: `makeupLookOptions`, `lookIndex`, SecureStore 기반 최근 선택값
- 기존 추천 API: `GET /api/products/recommendations?report_id=...&look_index=...`
- 카테고리 탭: `전체`, `립`, `블러셔`, `아이섀도우`, `아이라이너`, `베이스`
- 정렬: 매치 높은 순, 낮은 가격순, 높은 가격순
- 제품 카드: 이미지, 브랜드, 제품명, shade, 가격, 색상 팔레트, 구매 링크
- 좋아요: `GET /api/products/liked`, `POST/DELETE /api/products/{productId}/like`
- 기존 mock fallback은 개발용 fixture로만 남기고, production API 실패 시에는 정직한 empty/error state를 표시

V2의 변경은 이 화면을 버리고 AURADIN hero를 붙이는 것이 아니라, 기존 구조를 제품 추천 허브로 유지하면서 `AR 필터 기반 추천`, `시즌 상품`, `아우라딘에게 물어보기`를 section으로 추가하는 것이다.

## 현재 백엔드 계약

기존 API는 유지돼 있다.

- `GET /api/products/recommendations`
- `GET /api/products/liked`
- `POST /api/products/{productId}/like`
- `DELETE /api/products/{productId}/like`

현재 추천 API 입력은 `category`, `lookIndex`, `reportId` 중심이다. 모바일 service도 `lookIndex`, `reportId`만 전달하므로 저장된 AR 룩 ID나 최종 레시피를 직접 사용하지 않는다.

## 현재 추천이 “진짜 AR 색상 추천”이 아닌 이유

### 1. 최종 AR 조정값이 저장되지 않는다

모바일에는 이미 `FullFaceMakeupRecipe version: 2`와 `foundation`, `lip`, `blush`, `brow`, `eyeliner`, `lens` region 계약이 있고, 부위별 `colorHex`, finish, intensity, opacity, blend mode, texture/shape 관련 값도 존재한다. 그러나 현재 일부 저장 플로우는 filter/preset ID만 navigation 메모리에 남기거나 최종 shape payload를 버린다. 앱 재시작 후 재현 가능한 canonical saved-look envelope가 없다.

또한 `colorHex`는 shader에 넣는 authoring color다. 사용자가 카메라에서 본 색은 원래 피부/입술 pixel, intensity, opacity, blend mode, 조명과 합성된 결과이므로 이를 `최종 표시색`이라고 부르면 안 된다. P0는 `authoring_color_v1` 의미로 비교하고 `선택한 AR 색과 가까워요`라고 설명한다. 향후 합성색을 쓰려면 표준 기준면 또는 on-device 일시 계산으로 별도 `predicted_composite_v1`을 정의하고 독립적으로 검증해야 한다.

기존 `/api/ar/filter-states`도 전역적인 색상·타입·텍스처 ID 위주여서 부위별 최종 조합을 표현하기 부족하다. 반면 기존 `saved_makeup_styles.style_payload`는 `saved_ar_look_v1` envelope 안에 원본 recipe v2와 추천용 normalization projection을 함께 저장할 수 있으므로 최종 저장소로 확장하기 적절하다.

### 2. Naver 결과의 색상은 실제 shade 측정치가 아니다

현재 Naver 상품 응답에 붙는 palette는 카테고리별 기본색 성격이다. 제목·카테고리에서 파생한 정보로는 `같은 색상의 화장품`을 입증할 수 없다. 동일 제품도 shade별 색이 다르고, 화면상의 swatch는 조명·화이트밸런스·발색 방식에 따라 달라진다.

### 3. 현재 매치율은 보정된 점수다

현 코드에는 기본점수와 여러 가산점을 합한 뒤 62–99 범위로 제한하는 경로가 있다. 이는 사용자에게 확률·정확도처럼 보일 수 있지만 실측 보정이나 정답 데이터 기반 calibration이 아니다. 제품 카드에서 `% 매치`를 제거하는 것이 우선이다.

### 4. 임베딩 대상이 색상 자체가 아니다

현재 임베딩은 리포트/프로필 텍스트와 상품 텍스트를 사용한다. 언어 임베딩은 `청순한 여름 글로우` 같은 의미적 유사성에는 도움이 되지만, 근소한 shade 차이·명도·채도·색상차를 보장하지 않는다.

## 시즌 추천이 먼저 가능한 이유

시즌 컬렉션은 다음 세 층으로 분리하면 AR 저장 완성도를 기다릴 필요가 없다.

1. 트렌드 신호: 동일 기간의 검색/클릭 추이, 룩톡 반응, 에디터 조사
2. 편집 판단: 과장·중복·일시적 노이즈를 제거하고 룩 테마로 명명
3. 상품 매핑: 권리가 확인된 카탈로그의 활성 상품만 연결

Naver Shopping Insight의 값은 절대 판매량이 아니라 조회 기간 내 상대 클릭 비율이다. 그러므로 `7월 2주차 검색 클릭 추이가 상승한 글로우 립`처럼 표현할 수는 있지만 `가장 많이 팔린 립`이라고 쓰면 안 된다.

## Naver 관련 시급한 외부 변화

2026-07-12 기준 Naver Developers의 쇼핑 검색 API는 2026-07-31 종료 공지가 게시돼 있다. API HUB 전환 공지도 별도로 존재하지만, 현재 공개된 API HUB 문서만으로 기존 쇼핑 상품 검색과 동등한 대체 endpoint를 확인할 수 없다. “대체 endpoint가 없다”는 부분은 문서에 기반한 추론이므로 Naver에 서면 확인해야 한다.

결론:

- 신규 V2의 상품 원천을 기존 Naver Shopping Search에 묶지 않는다.
- Naver Shopping Insight는 시즌 신호 provider로만 격리한다.
- 실제 상품은 자체·제휴·정식 라이선스 shade 카탈로그에서 제공한다.
- 기존 연동은 종료일 전 feature flag로 끌 수 있게 만들고, 약관 검토 전 장기 저장·재정렬을 확대하지 않는다.

## 현재 반드시 수정할 보안 문제

`products.py`의 like 처리 경로는 외부 상품 ID일 때 클라이언트가 보낸 상품명·이미지·구매 URL·추천 이유 등을 `products`에 upsert하며, 같은 `external_key`가 있으면 공용 메타데이터를 갱신한다. 인증된 사용자라 해도 임의 URL/상품 payload로 공용 카탈로그를 오염시키는 공격이 가능하다.

V2 전에 다음으로 바꿔야 한다.

- 좋아요 요청은 서버가 발급한 내부 product UUID만 받는다.
- 외부 공급자 결과를 즉시 좋아요해야 한다면 짧은 TTL의 서버 서명 token을 쓴다.
- 상품명·이미지·구매 URL·source/license는 서버 카탈로그만 갱신한다.
- 구매 URL은 provider별 도메인 allowlist와 HTTPS 검사를 통과해야 한다.

## 재사용할 것과 버릴 것

### 재사용

- 기존 navigation route 이름
- 기존 `ProductRecommendationScreen`의 보고서 선택, 룩 선택, 카테고리 탭, 정렬, 제품 카드, 팔레트, 구매 링크, 좋아요 UX
- `requestBackendJson` 호출 패턴
- `productRecommendationService.ts`의 `/products/recommendations` 매핑과 `reportId/lookIndex` 계약
- 기존 좋아요 API의 사용자별 관계 모델
- `saved_makeup_styles`와 `/api/makeup-styles`
- 커뮤니티의 이벤트 batch/idempotency 패턴
- 기존 AURADIN 검색 화면 로직과 공식 wordmark/hero asset
- Tamagui theme token과 기존 아이콘

### 교체 또는 격리

- 1,500줄 안팎의 단일 추천 screen 구조 → 섹션형 screen/components/hooks
- 카테고리 대표색을 실제 shade처럼 다루는 palette
- 62–99로 제한한 표시용 매치율
- 프로덕션 API 실패 시 조용히 mock 상품을 보여주는 동작
- AURADIN만의 로컬 좋아요 상태
- 클라이언트 payload 기반 상품 upsert
- 신규 기능의 Naver Shopping Search 의존

## 권고 출시 절단면

### Demo/내부 QA

- 실제 저장 recipe가 없으면 AR empty state
- 검수된 소량의 seed shade 카탈로그만 사용
- 시즌 컬렉션은 수동 에디터 구성 가능
- 모든 mock/seed에는 내부 QA 배지

### Production MVP

- AR recipe 영속화/삭제 가능
- 라이선스가 확인된 상품과 shade 근거
- AR 색상/피니시 랭킹
- 시즌 컬렉션과 출처·유효기간
- 통합 좋아요
- 보안 P0 수정, 개인정보 동의/삭제/보존 적용

### 후속

- 검색·클릭 개인화
- 다중 무장 밴딧 또는 학습형 reranking
- 충분한 모수의 익명 집계형 컬러 취향 코호트
