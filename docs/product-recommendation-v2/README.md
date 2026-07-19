# 제품 추천 V2 기획 패키지

작성일: 2026-07-12  
상태: 역사 기획 패키지 + 현재 구현 정본 링크
대상: iOS 우선 Expo React Native 앱 + FastAPI 백엔드

## 현재 구현 기준 (2026-07-20)

추천제품 허브의 첫 번째 shelf는 저장 AR 룩이 아니라 사용자가 선택한 상황별 메이크업 추천
보고서와 `anchor/bold/discovery` 룩을 기준으로 한다. 제품은 hard eligibility, 비-base
Lab/ΔE·피니시 규칙, 제한된 Bedrock Titan embedding 재정렬을 거친 verified catalog에서만
표시한다. 계산은 보고서 저장 시 룩별 versioned snapshot으로 고정되며 일반 화면 조회는 순위를
다시 계산하지 않는다. `eye`는 구조화 단계에 따라 shadow와 liner를 분리한다. 이 범위의 최신 source of truth는
[13. 메이크업 추천 보고서 기반 제품 추천 정본](13-makeup-report-product-recommendations.md)이며,
아래 초기 AR 중심 기획과 충돌하면 13번 문서를 우선한다. 기존 AR API와 저장 룩 흐름은
호환성을 위해 유지한다.

## 한 줄 결론

제품 추천을 앱의 메인 허브로 복원하고, AURADIN은 허브 위에서 이동 가능한 젤리 orb 보조 진입점으로 연결한다. 1차 출시는 `저장한 AR 룩과 닮은 제품`과 `지금 주목할 시즌 룩`에 집중한다.

중요한 구현 기준: 홈의 8개 카테고리 중 `추천 제품`을 눌렀을 때는 기존 `ProductRecommendationScreen` 기반 제품 추천 페이지가 먼저 떠야 한다. AURADIN hero 화면은 이 진입을 대체하지 않는다. 기존 제품 추천 화면의 기준 보고서 선택, 추천 기준 룩/이미지 선택, 카테고리 탭, 정렬, 제품 카드, 색상 팔레트, 구매 링크, 좋아요, `/api/products/recommendations` 호출은 P0에서 보존하고 그 위에 AR/시즌/AURADIN entry를 붙인다.

AR 기반 추천은 가능하다. 다만 현재 저장 플로우가 최종 색상·피니시·강도 조정을 영속화하지 않으므로 곧바로 “실제 색상 기반 추천”을 제공하면 안 된다. 기존 `FullFaceMakeupRecipe version: 2`를 깨지 않고 `saved_ar_look_v1` envelope로 저장한 뒤, shader 입력색인 `authoringColor`와 실제 shade 색상 근거가 있는 자체·제휴·정식 라이선스 카탈로그를 비교해야 한다. 피부·opacity·blend를 거친 화면 합성색과 authoring color는 같은 값이 아님을 UI와 알고리즘에서 구분한다.

시즌 추천은 AR 연동보다 먼저 만들 수 있다. Naver Shopping Insight는 계절·검색 추이 신호로만 사용하고, 추천할 실제 상품은 권리가 확인된 카탈로그에서 가져온다.

## UI 참고 이미지

![제품 추천 V2 고해상도 UI 콘셉트](assets/product-recommendation-hifi-concept.png)

위 이미지는 초기 콘셉트 보관용이며 최종 UI 시안이 아니다. 실제 구현의 UI source of truth는 현재 앱 홈, 기존 `ProductRecommendationScreen`, 그리고 [00번 구현 계획](00-product-recommendation-implementation-plan.md)이다. 홈 카테고리 grid에서 `추천 제품`을 누르면 제품 추천 허브로 들어가고, AURADIN은 edge-snapped 젤리 orb로 허브 안에서 호출한다.

![제품 추천 V2 사용자 플로우와 데이터 경계](assets/product-recommendation-system-flow.png)

## 가장 중요한 결정 8개

1. 홈의 `추천 제품`은 `ProductRecommendation`으로 이동한다. AURADIN이 추천 허브를 대체하지 않는다.
2. AURADIN은 제품 카드와 하단 네비게이션을 가리지 않는 edge-snapped 젤리 orb로 둔다. 탭은 대화 탐색, 길게 누른 뒤 드래그는 안전 영역 내 위치 이동이다.
3. AR 섹션은 저장된 최종 룩이 있을 때만 제품을 노출한다. 없으면 `AR 룩 만들기`를 안내하며 목업 제품으로 위장하지 않는다.
4. recipe v2의 authoring color와 측정된 shade를 부위별 CIELAB/ΔE2000으로 비교한다. 합성 화면색으로 오인하지 않으며 임베딩은 무드·문맥 보조 신호로만 제한한다.
5. `62–99% 매치`처럼 보정된 퍼센트는 제거한다. 검증 전에는 `선택한 AR 색과 가까워요`, `글로스 피니시가 같아요` 같은 근거 칩을 쓴다.
6. 시즌 섹션에는 기준 기간, 트렌드 출처, 에디터 검수 시점을 표시한다. 클릭 추이를 판매량이나 실제 인기 순위로 표현하지 않는다.
7. 좋아요는 제품 family 단위이며 모든 추천 섹션과 AURADIN이 하나의 서버 저장소를 공유한다. 클라이언트가 보낸 상품 메타데이터로 서버 카탈로그를 갱신하지 않는다.
8. 유사 사용자 추천은 별도 동의와 충분한 집단 크기를 확보한 뒤 P2로 출시한다. 얼굴 유사성을 쓰지 않고 `비슷한 컬러 취향`으로 설명한다.

## 문서 구조

| 문서 | 용도 |
| --- | --- |
| [00. 제품 추천 구현 계획](00-product-recommendation-implementation-plan.md) | 실제 구현 기준: 범위, UI, AR/시즌 기술, 단계, 승인·출시 게이트 |
| [01. 현재 상태와 실현 가능성](01-current-state-and-feasibility.md) | 기존 코드 감사, AR/시즌 가능 여부, 기술 부채 |
| [02. UX와 앱 플로우](02-ux-and-app-flow.md) | 정보 구조, 화면 명세, AURADIN 배치, 상태·접근성 |
| [03. 추천 시스템 설계](03-recommendation-system-design.md) | AR 색상, 시즌, 인게이지먼트, 코호트 랭킹 |
| [04. API·데이터 아키텍처](04-api-data-architecture.md) | 계약, 스키마, 이벤트, 마이그레이션 |
| [05. 보안·개인정보·법무](05-security-privacy-legal.md) | 위협, 동의, 보존, Naver/광고/초상권 이슈 |
| [06. 구현 로드맵과 사전 승인](06-implementation-roadmap-and-approvals.md) | 단계, 변경 파일, 필요한 권한·결정 일괄 목록 |
| [07. QA·지표·출시 게이트](07-qa-metrics-and-release-gates.md) | 테스트, 관측, 실험, 출시/중단 기준 |
| [08. 조사 출처](08-research-sources.md) | 공식 문서와 법령 링크 |
| [09. 역할별 반박과 결정 기록](09-decision-log-and-red-team.md) | UX·기술·보안·법무 관점의 논쟁과 채택/기각 이유 |
| [10. 담당 구현 문서](10-owner-product-recommendation-page-spec.md) | 담당 변경 후 제품 추천 페이지 구현 범위와 기능 명세 |
| [13. 메이크업 추천 보고서 기반 제품 추천 정본](13-makeup-report-product-recommendations.md) | 현재 첫 shelf, 하이브리드 랭킹, API·fallback·소유권 계약 |

## 우선순위

| 우선순위 | 범위 | 출시 조건 |
| --- | --- | --- |
| P0 | 허브 UI, AURADIN 연결, 시즌 섹션, 서버 신뢰 경계 수정 | 실제 카탈로그, 시즌 근거, 보안 수정, 상태 UI |
| P0 | 저장 AR 룩 기반 추천 | `saved_ar_look_v1` + recipe v2 adapter, shade Lab 데이터, AR 저장 성공 |
| P1 | 검색·좋아요 통합, 개인화 이벤트 | 별도 동의, 이벤트 품질·삭제 경로, 최소 데이터 |
| P2 | 유사 취향 코호트, 고급 임베딩 | 충분한 모수·오프라인 평가·법무/개인정보 검토 |

## 즉시 구현하면 안 되는 항목

- 제품명이나 카테고리의 대표색을 실제 shade 색상처럼 사용
- 저장되지 않은 AR 조정값을 사용했다고 표시
- Naver 검색 결과를 장기 저장·재정렬해 자체 상품 카탈로그처럼 제공
- 클릭 비율을 `판매 1위`, `가장 많이 구매`처럼 표현
- 클라이언트 상품 payload로 공용 상품명·구매 URL·이미지를 upsert
- 얼굴 사진·랜드마크·원본 프레임을 추천 이벤트에 포함
- 사용자 동의 없이 행동 기반 또는 코호트 개인화 활성화

## 이번 산출물의 변경 범위

이 폴더와 이미지 자산만 추가했다. 앱·백엔드·DB 런타임 코드는 변경하지 않았으며, 기존 iOS·Unity 작업 파일과 `docs/product-ideation/`은 건드리지 않았다.
