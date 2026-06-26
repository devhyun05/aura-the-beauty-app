# 모바일 다음 리팩터링 TODO

작성일: 2026-06-26

이 문서는 네이밍 리팩터링 이후 다음 AI 작업자에게 넘길 구조 리팩터링 후보와 실행 순서를 정리한다. 목표는 기능 변경을 크게 만들지 않고, 변경이 잦은 화면과 모델을 작게 쪼개 다음 기획 반영 비용을 줄이는 것이다.

## 0. 작업 시작 전 주의사항

- 현재 브랜치 `feature/arfilterscreen-refactor0626`의 원격 최신 커밋은 `d8e96fa` 기준이다.
- 로컬 작업트리에는 iOS 생성물과 `apps/mobile/package*.json` 변경이 별도로 남아 있을 수 있다. 이 변경은 이번 리팩터링 범위가 아니므로 stage/commit하지 않는다.
- 새 작업은 원격 최신 브랜치 기준의 깨끗한 작업트리나 별도 worktree에서 시작한다.
- 모바일 프론트엔드 작업 전에는 반드시 `docs/mobile/FRONTEND_WORK_GUIDE.md`를 읽는다.
- 기능 변경과 구조 변경을 섞지 않는다. 화면 동작은 유지하고 컴포넌트, hook, service, route adapter 경계를 먼저 나눈다.

## 1. 우선순위 요약

| 우선순위 | 작업 | 이유 | 권장 커밋 타입 |
| --- | --- | --- | --- |
| P0 | 작업트리/브랜치 기준 정리 | 원격 push는 임시 클론에서 완료됐고 로컬에는 별도 dirty file이 남아 있다. 안전한 시작점이 필요하다. | `chore` |
| P1 | `ARFilterScreen` 분리 | 1234줄 규모이며 옵션 선택, 카드 렌더링, 카메라 UI, 저장 상태 로직이 한 파일에 몰려 있다. | `refactor` |
| P1 | 형태 편집 모델 순수 함수화 | `shapePoint.position`/`offset` 모델은 생겼지만 손가락 조작, reset, 저장 프리셋 로직이 아직 얕다. | `refactor` |
| P2 | `navigationAdapters.tsx` 플로우별 분리 | 627줄 규모이고 모든 route adapter가 한 파일에 있어 충돌과 탐색 비용이 크다. | `refactor` |
| P2 | 저장/레시피 route 이름 최종화 | `MakeupFilterSaveForm`, `ExtractedMakeupLookRecipe*`는 현재명/권장명 상태가 함께 문서에 남아 있다. | `refactor` |
| P3 | 큰 화면 추가 분리 | `ProfileEditScreen`, `FaceAnalysisReportDetailScreen`, `FullscreenOverlay`가 각각 700줄 이상이다. | `refactor` |

## 2. P0. 작업트리/브랜치 기준 정리

해야 할 일:

- 원격 `feature/arfilterscreen-refactor0626` 최신 커밋을 기준으로 새 작업을 시작한다.
- 로컬에 남아 있는 다음 변경은 이번 작업 범위에 포함하지 않는다.
  - `apps/mobile/ios/.gitkeep` 삭제
  - `apps/mobile/package.json`
  - `apps/mobile/package-lock.json`
  - `apps/mobile/ios/*` 생성물
- 기존 로컬 변경을 정리해야 한다면 사용자에게 먼저 확인한다. 임의로 `git reset --hard`, `git clean`, iOS 폴더 삭제를 하지 않는다.

완료 기준:

- 작업 대상 diff가 `apps/mobile/src`와 필요한 `docs/mobile` 문서로 제한된다.
- unrelated dirty file이 stage되지 않는다.

## 3. P1. `ARFilterScreen` 분리

대상 파일:

- `apps/mobile/src/features/ar/screens/ARFilterScreen.tsx`
- `apps/mobile/src/features/ar/screens/ARFilterScreen.test.tsx`
- `apps/mobile/src/features/ar/services/filterCustomizationService.ts`

현재 문제:

- 화면 파일이 1200줄 이상이다.
- 카메라 레이어, 비교 모드, 부위 선택, 옵션 그룹 선택, 룩/컬러/타입/질감/형태 카드, 저장 버튼 활성화 조건이 한 파일에 함께 있다.
- 기획 변경이 들어올 때 작은 UI 수정도 큰 diff가 된다.

권장 분리:

- `components/ARFilterCameraPreview.tsx`
- `components/ARFilterModeTabs.tsx`
- `components/ARFilterMakeupAreaTabs.tsx`
- `components/ARFilterOptionGroupTabs.tsx`
- `components/ARFilterOptionCardList.tsx`
- `components/ARFilterBottomActions.tsx`
- `hooks/useARFilterSelectionState.ts`
- `services/arFilterOptionRules.ts`

분리할 순수 로직:

- 전체 선택 시 `룩`, `형태`만 노출하는 규칙
- 부위 선택 시 `룩`, `컬러`, `타입`, `질감`, `형태`를 노출하는 규칙
- 전체 룩 선택 후 개별 옵션 수정 시 전체 룩 선택을 해제하고 저장 가능 상태로 바꾸는 규칙
- `원본` 카드 선택 시 해당 옵션/부위 필터를 제거하거나 형태 기본 상태로 돌리는 규칙
- 저장 버튼 활성화 조건

완료 기준:

- `ARFilterScreen.tsx`는 화면 조립과 route-level state 전달 중심으로 작아진다.
- 주요 선택 규칙은 순수 함수 테스트로 검증된다.
- UI 동작은 리팩터링 전과 동일하다.

## 4. P1. 형태 편집 모델 정리

대상 파일:

- `apps/mobile/src/features/ar/services/filterCustomizationService.ts`
- `apps/mobile/src/features/ar/mocks/filterCustomization.mock.ts`
- `apps/mobile/src/features/ar/screens/ARFilterShapeAdjustScreen.tsx`

현재 기준:

- 사용자가 옮기는 점은 `shapePoint`다.
- `shapePoint.position`은 기준/현재 좌표다.
- `shapePoint.offset`은 기준점 대비 이동량이다.
- 실제 얼굴 인식 랜드마크를 옮기는 것이 아니므로 `landmarkPoint`를 쓰지 않는다.

권장 추가 함수:

- `updateFilterShapePointOffset(state, shapePointId, offset)`
- `resetFilterShapePointOffset(state, shapePointId)`
- `resetFilterShapePoints(state)`
- `getResolvedShapePointPosition(shapePoint)`
- `createShapePresetFromState(state)`

완료 기준:

- 형태점 렌더링 좌표 계산이 화면 컴포넌트에 흩어져 있지 않다.
- reset/save/preset으로 이어질 수 있는 데이터 모델이 service에 모인다.
- 슬라이더 기반 조작을 전제로 한 이름을 새로 만들지 않는다.

## 5. P2. `navigationAdapters.tsx` 플로우별 분리

대상 파일:

- `apps/mobile/src/app/navigation/navigationAdapters.tsx`
- `apps/mobile/src/app/navigation/RootNavigator.tsx`
- `apps/mobile/src/app/navigation/routeTypes.ts`
- `apps/mobile/src/app/navigation/routeChrome.ts`

현재 문제:

- 모든 route adapter가 한 파일에 모여 있다.
- 기능별 screen import와 flow state 사용처가 섞여 있어 rename/route 변경 시 충돌 범위가 커진다.

권장 구조:

```text
apps/mobile/src/app/navigation/routes/
├─ authRoutes.tsx
├─ faceAnalysisRoutes.tsx
├─ makeupFeedbackRoutes.tsx
├─ referenceMakeupExtractionRoutes.tsx
├─ arRoutes.tsx
├─ profileRoutes.tsx
└─ recommendationRoutes.tsx
```

완료 기준:

- `RootNavigator.tsx`는 route component를 기능별 파일에서 import한다.
- 각 route adapter 파일은 하나의 기능/플로우만 담당한다.
- route name, linking path, chrome policy는 기존과 동일하게 유지된다.

## 6. P2. 저장/레시피 화면명 최종화

현재 남은 후보:

- `MakeupFilterSaveFormScreen` 현재명, 권장 이름 `MakeupFilterSaveScreen`
- `ExtractedMakeupLookRecipeDetailScreen` 현재명, 권장 이름 `MakeupRecipeDetailScreen`
- `ExtractedMakeupLookRecipeSaveCompleteScreen` 현재명, 권장 이름 `MakeupRecipeSaveCompleteScreen`

판단 기준:

- 저장 화면이 단순 폼 컴포넌트인지 route 화면인지 분리한다.
- route는 `MakeupFilterSave`, 내부 폼 컴포넌트는 `MakeupFilterSaveForm`처럼 역할을 나눌 수 있다.
- 레시피 화면은 레퍼런스 추출 결과에서 진입하더라도, 산출물 자체가 메이크업 레시피라면 `MakeupRecipe*` 계열이 더 짧고 재사용 가능하다.

완료 기준:

- route name, screen file, component name, document name이 같은 기준을 따른다.
- `APP_SCREEN_FLOW_FEATURE_SPEC.md`, `AR_FILTER_SCREEN_FEATURE_SPEC.md`, `NAMING_DECISIONS.md`의 현재명/권장명 문구가 최신 상태로 바뀐다.

## 7. P3. 큰 화면 추가 분리 후보

후보 파일:

- `apps/mobile/src/features/profile/screens/ProfileEditScreen.tsx`
- `apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx`
- `apps/mobile/src/shared/ui/FullscreenOverlay.tsx`
- `apps/mobile/src/features/makeup-feedback/screens/MakeupCorrectionGuideOverlayScreen.tsx`

권장 접근:

- 먼저 순수 데이터/표시 컴포넌트를 분리한다.
- 스타일 토큰, icon token, typography token 사용 규칙을 유지한다.
- 화면 동작을 바꾸지 않는 커밋으로 작게 나눈다.

## 8. 검증 명령

각 작업 후 최소 검증:

```bash
git diff --check
npm --prefix apps/mobile run typecheck
```

검색 검증:

```bash
rg -n "PhotoCaptureGuide|MakeupLookRecipeTab|ProfileData|getProfileData|ProductRecommendationItem|StyleOptionGroup|FacePartId|MakeupStyleFaceArea|FilterLandmark|FilterLocation|MakeupStyle|makeupStyle|ExtractedMakeupStyle|ARFilterLocationAdjust|ARFilterStyleAdjust|GuideCategory|ImageAnalysis|image-analysis" apps/mobile/src
```

예상 결과:

- 앱 코드 검색 결과가 없어야 한다.
- 문서 히스토리에 남은 레거시 이름은 과거명/권장명/완료 여부가 명시되어 있어야 한다.

### 8.1 2026-06-26 P1 진행 상태

- P0: 로컬의 `apps/mobile/ios/*`, `apps/mobile/package.json`, `apps/mobile/package-lock.json` 변경은 unrelated dirty file로 유지하고 stage하지 않는다. 작업 diff는 `apps/mobile/src/features/ar`와 이 문서로 제한한다.
- P1 `ARFilterScreen` 분리: 화면 파일은 route-level 조립 중심으로 줄이고, 카메라 프리뷰, 모드 탭, 부위 탭, 옵션 그룹 탭, 옵션 카드 목록, 하단 액션, 촬영 컨트롤을 `features/ar/components`로 분리했다.
- P1 선택 상태: `useARFilterSelectionState` hook을 추가해 선택 상태와 핸들러를 화면에서 분리했다.
- P1 선택 규칙: `services/arFilterOptionRules.ts`에 전체/부위별 옵션 그룹, 원본 카드 동작, 토탈메이크업룩 선택 해제, 저장 버튼 활성화 규칙을 순수 함수로 분리했다.
- P1 형태 모델: `filterCustomizationService.ts`에 `updateFilterShapePointOffset`, `resetFilterShapePointOffset`, `resetFilterShapePoints`, `getResolvedShapePointPosition`, `createShapePresetFromState`를 추가했다.

## 9. Goal 모드 프롬프트

```text
목표: 모바일 앱 네이밍 리팩터링 이후 남은 구조 리팩터링을 docs/mobile/NEXT_REFACTOR_TODO.md 기준으로 수행해줘. 우선순위는 P0 작업트리 기준 확인, P1 ARFilterScreen 분리, P1 형태 편집 모델 정리 순서야.

반드시 먼저 읽을 문서:
- docs/mobile/FRONTEND_WORK_GUIDE.md
- docs/mobile/NEXT_REFACTOR_TODO.md
- docs/mobile/NAMING_DECISIONS.md
- docs/mobile/NAMING_REFACTOR_WORK_PLAN.md
- docs/mobile/APP_SCREEN_FLOW_FEATURE_SPEC.md
- docs/mobile/AR_FILTER_SCREEN_FEATURE_SPEC.md

작업 전 주의:
- 현재 원격 feature/arfilterscreen-refactor0626 최신 커밋은 d8e96fa 기준이다.
- 로컬에 apps/mobile/ios/*, apps/mobile/package.json, apps/mobile/package-lock.json 변경이 남아 있을 수 있다. 이 변경들은 unrelated dirty file이므로 건드리거나 stage/commit하지 마.
- 새 작업은 원격 최신 브랜치 기준의 깨끗한 작업트리 또는 별도 worktree에서 시작해.
- 임의로 git reset --hard, git clean, iOS 생성물 삭제를 하지 마.

작업 범위:
1. ARFilterScreen.tsx를 컴포넌트, hook, 순수 rule/service로 분리한다.
2. 전체 선택 시 룩/형태만 노출, 부위 선택 시 룩/컬러/타입/질감/형태 노출, 전체 룩 선택 후 옵션 수정 시 저장 버튼 활성화 같은 규칙을 순수 함수로 분리한다.
3. shapePoint 편집 모델을 보강한다. shapePoint.position은 좌표, shapePoint.offset은 기준점 대비 이동량이라는 정의를 유지한다.
4. updateFilterShapePointOffset, resetFilterShapePoints, getResolvedShapePointPosition, createShapePresetFromState 같은 순수 함수를 추가한다.
5. 화면 동작은 바꾸지 말고 구조만 작게 나눈다.
6. 필요한 경우 테스트는 순수 함수 중심으로 추가/수정한다.
7. 문서 변경이 필요하면 docs/mobile/NEXT_REFACTOR_TODO.md와 관련 기획 문서에 현재 상태를 반영한다.

금지:
- React Native style, StyleSheet, styles를 Look으로 바꾸지 마.
- landmarkPoint라는 이름을 사용자 조정점에 쓰지 마.
- MakeupLookFilterScreen, MakeupLookSaveScreen, LookEdit 계열 이름을 새로 만들지 마.
- unrelated dirty file을 stage하지 마.

검증:
- git diff --check
- npm --prefix apps/mobile run typecheck
- rg -n "PhotoCaptureGuide|MakeupLookRecipeTab|ProfileData|getProfileData|ProductRecommendationItem|StyleOptionGroup|FacePartId|MakeupStyleFaceArea|FilterLandmark|FilterLocation|MakeupStyle|makeupStyle|ExtractedMakeupStyle|ARFilterLocationAdjust|ARFilterStyleAdjust|GuideCategory|ImageAnalysis|image-analysis" apps/mobile/src

완료 조건:
- ARFilterScreen의 책임이 화면 조립 중심으로 줄어든다.
- AR 필터 선택 규칙과 shapePoint 계산 로직이 테스트 가능한 순수 함수로 분리된다.
- 타입체크가 통과한다.
- unrelated dirty file은 그대로 보존된다.
- 변경사항을 refactor 타입 커밋으로 묶을 수 있게 정리되어 있다.
```
