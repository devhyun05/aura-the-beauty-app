# 15개 추천 메이크업 필터 구현 마일스톤

이 문서는 `docs/spec.md`를 실제 구현으로 옮기기 위한 우선순위 기반 작업 계획이다. 목표는 발표/데모에 바로 보이는 사용자 경험을 먼저 만들고, 이후 AR 상태 유지와 테스트를 단단하게 만드는 것이다.

## P0. 준비 및 기준 고정

### 목표

작업 범위와 안전 기준을 구현 전에 고정한다.

### 작업

- `docs/spec.md`를 구현 기준 문서로 삼는다.
- 모바일 작업 전 `docs/mobile/FRONTEND_WORK_GUIDE.md`를 다시 확인한다.
- 현재 작업트리에 다른 변경이 많으므로 이번 구현 범위 파일만 수정한다.
- 새 라이브러리는 추가하지 않는다.
- 추천 필터 패널 작업에서는 실제 백엔드, 실제 Unity/ARKit/ARCore, 실제 이미지 분석을 새로 구현하지 않는다.
- 사용자가 별도로 요청한 눈썹 AR 런타임 작업은 이 제한의 예외로 둔다. 이 경우 기존 MediaPipe/iOS/Unity bridge와 `E3RegionMaskOverlay` 흐름을 재사용하고, lip/blush 구현은 변경하지 않는다.

### 산출물

- 구현자가 따라야 할 기준: `docs/spec.md`
- 구현 순서: `docs/plan.md`
- 규범: `AGENTS.md`

### 완료 조건

- 추천 필터 패널 구현 범위가 홈 추천 패널, 추천 필터 데이터, AR 초기 진입, 저장 연결로 제한되어 있다.
- 눈썹 AR 런타임 구현을 병행할 경우 generated lip pipeline을 직접 수정하지 않고 generated brow pipeline을 별도로 추가한다.

## P1. 추천 필터 데이터와 타입 추가

### 목표

UI보다 먼저 15개 필터를 안정적인 데이터 모델로 만든다.

### 작업

- `apps/mobile/src/shared/types/makeupGuide.ts`에 추천 필터용 필드를 추가한다.
- `RecommendedMakeupFilter`를 `MakeupFilter` 확장 타입으로 만들거나, 기존 `MakeupFilter`에 필요한 선택 필드를 추가한다.
- `apps/mobile/src/shared/mocks/makeupGuide.mock.ts`에 15개 필터를 추가한다.
- 각 필터에는 다음 값을 반드시 넣는다.
  - id
  - imageSource
  - headline
  - displayTitle 또는 title
  - description
  - categoryTags
  - keywords
  - embeddingVector
  - matchScore
  - presetValues
  - colorOptions
  - typeOptions
  - textureOptions
  - makeupAreas
- 기존 AR 테스트가 기대하는 기본 필터가 깨지지 않도록 첫 번째 필터 또는 default helper 기대값을 함께 조정한다.

### 세부 데이터 주의사항

- 15개 id는 `docs/spec.md`와 동일하게 유지한다.
- `embeddingVector`는 길이를 모두 같게 한다.
- `matchScore`는 0~100 숫자로 둔다.
- `presetValues.intensity`는 0~1 범위로 둔다.
- `makeupAreas`는 Unity bridge가 처리 가능한 영역을 우선 사용한다.

### 완료 조건

- service 없이 mock 데이터만 import해도 15개 추천 필터가 타입 에러 없이 존재한다.

## P2. 추천 service 구현

### 목표

화면이 mock 배열을 직접 알지 않도록 추천 정렬과 조회를 service로 분리한다.

### 작업

- `apps/mobile/src/shared/services/makeupGuideService.ts`에 함수를 추가한다.
  - `getRecommendedMakeupFilters`
  - `sortMakeupFiltersByRecommendationScore`
  - `getRecommendedMakeupFilterById`
  - `mapMakeupFilterToSavedLook`
- cosine similarity helper를 순수 함수로 작성한다.
- user vector가 없으면 기본 mock vector를 사용한다.
- 필터 id가 없거나 잘못된 경우 첫 추천 필터로 fallback한다.
- 기존 `getDefaultMakeupFilter`, `getFiltersByCategory`는 유지한다.

### 정렬 정책

1. keyword match 점수
2. vector similarity 점수
3. matchScore
4. id 오름차순

### 완료 조건

- 홈, 전체 목록, AR, 저장 화면이 모두 service를 통해 같은 추천 필터 데이터를 조회할 수 있다.

## P3. 이미지 asset 준비

### 목표

15개 필터가 서로 다른 모델 얼굴 이미지를 사용하게 한다.

### 작업

- `apps/mobile/src/assets/images/makeup-filters/` 폴더를 만든다.
- 15개 이미지 파일을 추가한다.
- 이미지가 아직 준비되지 않았다면 임시로 기존 `looks` asset을 쓰되, 구현 TODO를 남기지 말고 asset 교체 작업을 별도 커밋 범위로 분리한다.
- 최종 데모 전에는 반드시 15개 서로 다른 얼굴 이미지로 교체한다.

### 생성/선정 기준

- 가상 모델만 사용한다.
- 실존 인물 닮은꼴을 피한다.
- 같은 얼굴 반복을 금지한다.
- 이미지 안에 텍스트를 넣지 않는다.
- 메이크업 특징이 모바일 카드에서도 보이게 한다.

### 완료 조건

- 15개 필터의 `imageSource`가 15개 서로 다른 파일을 참조한다.

## P4. 홈 추천 패널 교체

### 목표

사용자가 가장 먼저 보는 홈에서 새 경험을 확인할 수 있게 한다.

### 작업

- `apps/mobile/src/features/home/screens/HomeScreen.tsx`에서 `RecommendedLooksSection`을 추천 필터 섹션으로 교체한다.
- 섹션 제목을 `추천 메이크업 필터`로 바꾼다.
- `getRecommendedMakeupFilters` 결과 상위 6~8개를 표시한다.
- 카드 전체를 AR 진입 버튼으로 만든다.
- 카드 UI:
  - 이미지 cover
  - 하단 scrim
  - headline
  - displayTitle
  - match pill
  - AR 적용 pill
- 카드 press handler는 필터 id를 부모로 올린다.

### Navigation 연결

- `apps/mobile/src/app/navigation/routes/homeRoutes.tsx`에서 카드 탭 시 `ARFilter`로 이동한다.
- route param:
  - `initialMakeupFilterId`
  - `initialGuideMode: 'half'`
  - `source: 'recommendedFilter'`

### 완료 조건

- 홈에서 `저장된 메이크업` 문구가 사라진다.
- 추천 카드 탭 시 선택 필터 id가 AR route로 전달된다.

## P5. 전체 추천 필터 화면 개편

### 목표

홈보다 많은 15개 필터를 탐색할 수 있는 전체 화면을 만든다.

### 작업

- `apps/mobile/src/features/home/screens/FilterStoreScreen.tsx`를 추천 필터 전체 목록으로 재구성한다.
- `getRecommendedMakeupFilters` 전체 결과를 사용한다.
- 카테고리 칩을 구현한다.
  - 전체
  - 글로우
  - 스모키
  - 핑크
  - 브라운
  - 트렌드
  - 유니크
- 2열 그리드를 유지한다.
- 카드에는 이미지 오버레이, 설명, 키워드 2개, match score를 표시한다.
- 카드 탭 시 홈 카드와 같은 AR route param을 전달한다.

### 완료 조건

- 전체 보기에서 15개 필터를 모두 볼 수 있다.
- 카테고리 칩 선택 시 필터링된다.

## P6. AR route param 확장

### 목표

추천 카드에서 선택한 필터가 AR 화면 초기 상태에 반영되게 한다.

### 작업

- `apps/mobile/src/app/navigation/routeTypes.ts`의 `ARFilter` param을 확장한다.
- `apps/mobile/src/app/navigation/routes/arRoutes.tsx`에서 params를 `ARFilterScreen`으로 넘긴다.
- quick action AR 진입은 기존 동작을 유지한다.
- 추천 필터 진입은 `initialGuideMode` 기본값을 `half`로 처리한다.

### 완료 조건

- TypeScript navigation 타입 에러가 없다.
- 기존 `navigation.navigate('ARFilter')` 호출도 계속 동작한다.

## P7. AR 선택 상태 초기화

### 목표

AR 화면이 선택된 추천 필터를 처음부터 적용한 상태로 열린다.

### 작업

- `useARFilterSelectionState`에 `initialMakeupFilterId`와 `initialSource`를 전달한다.
- 추천 필터 id가 유효하면 초기 state를 다음처럼 설정한다.
  - selectedMakeupArea: `all`
  - selectedTotalMakeupLookId: filter id
  - selectedPointMakeupLookId: `original`
  - selectedColorId: filter preset colorId 또는 첫 color option
  - selectedTypeId: filter preset typeId 또는 첫 type option
  - selectedTextureId: filter preset textureId 또는 첫 texture option
  - selectedShapeId: filter preset shapeId 또는 `original`
- source가 `recommendedFilter`면 `hasUnsavedMakeupChanges`를 true로 둔다.

### 완료 조건

- 추천 필터 진입 직후 AR 룩 카드에서 해당 필터가 활성화된다.
- 저장 버튼이 활성화되어 있다.

## P8. AR 화면 UX 확인 및 저장 버튼 정책

### 목표

추천 필터 적용 이후 사용자가 조정하거나 그대로 저장할 수 있게 한다.

### 작업

- `ARFilterScreen`에서 `source='recommendedFilter'`일 때 저장 버튼 활성 조건을 조정한다.
- 기존 세부 옵션 조정 동작은 유지한다.
- `반반 가이드` 모드가 route param대로 켜지는지 확인한다.
- `형태 수정` 버튼은 기존 `ARFilterShapeAdjust`로 이동한다.
- 형태 수정 후 돌아왔을 때 최소한 선택 필터 id가 유지되게 한다.

### 완료 조건

- 추천 필터를 수정하지 않아도 저장할 수 있다.
- 기존 quick action AR의 저장 정책은 의도치 않게 바뀌지 않는다.

## P9. 저장 플로우 일반화

### 목표

추천 필터 저장과 reference extraction 저장이 같은 저장 UI를 공유하게 한다.

### 작업

- `NavigationFlowState`에 `selectedRecommendedMakeupFilterId`를 추가한다.
- 추천 AR 저장 시 이 값을 세팅한다.
- `MakeupFilterSaveRouteScreen`에서 저장 source를 판별한다.
  - 추천 필터 source면 `mapMakeupFilterToSavedLook(filter)` 사용
  - reference extraction source면 기존 `buildSavedMakeupLook(photo)` 유지
- `MakeupFilterSaveScreen` 문구를 일반화한다.
  - `저장할 메이크업 룩`
  - `AR 적용값과 조정값이 함께 저장돼요.`
- 저장 완료 화면 문구도 추천 필터 제목을 사용할 수 있게 한다.

### 완료 조건

- 추천 필터 저장 후 `savedMakeupLook`에 올바른 `MakeupLookPreview`가 들어간다.
- 기존 reference extraction 저장 흐름이 깨지지 않는다.

## P10. 마이페이지 및 전체 룩 목록 반영

### 목표

저장한 추천 필터가 사용자 페이지에서 확인된다.

### 작업

- `ProfileScreen`은 이미 `savedMakeupLook`를 앞에 붙이는 구조이므로 유지한다.
- `MakeupLookListScreen`에도 `savedMakeupLook` prop을 추가한다.
- `recommendationRoutes.tsx`에서 navigation flow state의 `savedMakeupLook`를 전달한다.
- 중복 id가 있으면 mock 목록에서 제거하고 저장 룩을 앞에 둔다.

### 완료 조건

- 저장 직후 마이페이지 `메이크업 룩` 첫 카드가 저장한 추천 필터다.
- 전체 룩 목록에도 저장한 추천 필터가 포함된다.

## P11. 테스트 추가 및 수정

### 목표

핵심 데이터, routing, 저장 mapping을 회귀 없이 검증한다.

### 작업

- `makeupGuideService.test.ts`
  - 추천 필터 15개 반환
  - imageSource/sourceImageId 중복 없음
  - 정렬 안정성
  - id fallback
  - saved look mapping
- `HomeScreen.test.ts`
  - 섹션 제목 변경
  - 카피 줄바꿈 helper
  - press handler route payload
- `FilterStoreScreen.test.tsx`
  - render smoke
  - 카테고리 필터 helper
- `ARFilterScreen.test.tsx`
  - initial id 선택
  - half guide mode
  - recommended source save enabled
- `flowState.test.tsx`
  - initial state에 추천 필터 id 필드 존재

### 완료 조건

- 기존 smoke 테스트가 새 스펙에 맞게 업데이트된다.

## P12. 타입체크 및 수동 QA

### 목표

데모 전에 깨진 흐름과 레이아웃 문제를 잡는다.

### 작업

- `cd apps/mobile`
- `npm run typecheck`
- iOS 시뮬레이터 또는 Expo에서 다음 흐름을 확인한다.
  - 홈 진입
  - 추천 카드 탭
  - AR 화면 초기 적용
  - 반반 가이드 전환
  - 옵션 조정
  - 형태 수정 진입
  - 저장
  - 마이페이지 확인
  - 전체 룩 목록 확인

### UI QA 체크

- 카드 텍스트가 이미지 밖으로 넘치지 않는다.
- 한글 줄바꿈이 자연스럽다.
- 하단 scrim 대비가 충분하다.
- 402x874 기준 홈 화면이 답답하지 않다.
- 15개 이미지 얼굴이 반복되지 않는다.
- 같은 색조 카드가 연속으로 너무 많이 보이지 않는다.

### 완료 조건

- TypeScript 에러가 없다.
- 데모 핵심 흐름이 수동으로 통과한다.

## P13. 후속 작업

### 실제 AI 추천 연동

- mock keyword/vector 계산을 백엔드 embedding API로 교체한다.
- 사용자 얼굴 분석 결과에서 personal color, skin tone, face shape, 선호 무드를 vector input으로 만든다.

### 실제 이미지 추출 연동

- 썸네일 이미지에서 palette, eye/lip/cheek region, finish를 추출하는 API를 붙인다.
- 현재 `presetValues`는 API 응답 fallback으로 유지한다.

### 실제 AR 품질 개선

- Unity layer에서 base, contour, eye 표현력을 확장한다.
- mask texture와 opacity를 필터별로 더 세분화한다.

### 눈썹 AR 런타임 확장

- 기존 lip/blush path를 수정하지 않고 `generated brow` path를 별도로 추가한다.
- MediaPipe Face Landmarker는 brow/eye landmark 기준점과 eye exclusion zone을 만드는 데 사용한다.
- 눈썹 마스크는 솜털 단위 segmentation이 아니라 큰 brow ROI/envelope을 기준으로 만든다.
- 기존 사용자 눈썹은 완전 삭제가 아니라 필터 shape 밖으로 벗어난 부분을 약하게 neutralize/tone lift한다.
- Unity 적용은 `region: brow`와 generated brow mask texture를 사용하고, lip generated mask payload와 blush session mask 동작은 회귀 없이 유지한다.
- 첨부 또는 생성한 brow asset은 Unity 적용 전에 alpha channel과 checkerboard baked 여부를 확인한다.

## 최종 완료 기준

- `docs/spec.md`의 acceptance criteria를 모두 만족한다.
- 홈 추천 패널, 전체 추천 목록, AR 초기 적용, 저장, 마이페이지 반영이 연결되어 있다.
- 15개 추천 필터가 서로 다른 얼굴 이미지로 보인다.
- 기존 주요 흐름이 회귀하지 않는다.
