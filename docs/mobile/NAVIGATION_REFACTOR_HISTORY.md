# Mobile Navigation Refactor History

작성일: 2026-06-25

이 문서는 모바일 앱의 화면 구조, React Navigation 전환, 헤더/푸터 chrome 정리, 데모용 딥링크 상태 구성 과정을 커밋 히스토리 기준으로 정리한 기록이다. 과거 내역은 이전 커밋 메시지와 변경 파일 범위를 기준으로 작성했다.

> 후속 네이밍 정리 참고: 2026-06-25 이후 현재 코드에서는 과거 `Feedback*` route가 `MakeupFeedback*`/`MakeupCorrection*`으로, 과거 `Filter*` 추출 route가 `ReferenceMakeupExtraction*`/`ExtractedMakeupStyle*`로 정리되었다. 2026-06-26 네이밍 결정에서는 사용자-facing 메이크업 저장/추천/추출 결과 단위를 `스타일`이 아니라 `룩/Look`으로 통일하고, AR 편집/저장은 `MakeupFilterEditScreen`/`MakeupFilterSaveScreen` 축으로 정리하기로 했다. 이 문서 본문에 남아 있는 옛 이름은 당시 navigation refactor 히스토리를 설명하기 위한 과거 명칭이다.

## 현재 브랜치

- 이전 브랜치: `codex/mobile-linking-demo-flow-state`
- 변경 브랜치: `refactor/mobile-linking-demo-flow-state`
- 기준 브랜치 흐름: `refactor/frontendflowcheck0624` 위에 딥링크/데모 상태와 이 히스토리 문서를 추가

## 작업 배경

초기 모바일 앱은 `AppRoot.tsx`의 `activeScreen` 상태와 긴 `renderScreen()` 분기로 화면을 전환했다. 이 방식은 프로토타입에는 빠르지만, 메인 탭, 상세 화면, AR/카메라 풀스크린, 피드백 플로우, 필터 추출 플로우가 늘어나면서 다음 기준이 흩어졌다.

- 어떤 화면이 메인 shell인지, 상세 화면인지, 풀스크린인지
- 어떤 화면에서 앱 헤더와 푸터를 보여야 하는지
- footer의 `home`, `capture`, `custom` 동작이 어느 route로 연결되는지
- feedback/filter처럼 route param으로 넘기기 어려운 임시 상태를 어디서 관리하는지
- 데모나 캡처를 위해 특정 화면으로 직접 진입할 수 있는지

이번 리팩터링의 핵심은 화면 전환 책임을 React Navigation으로 옮기고, 헤더/푸터 정책을 `routeChrome.ts` 중심으로 모으는 것이다.

## 최근 작업 상세

### 후속 정리: 모바일 도메인 네이밍 결정 문서화

2026-06-26 후속 기획 정리에서 화면/route 이름과 도메인 용어가 섞여 있던 지점을 별도 문서로 분리했다.

추가된 문서:

- `docs/mobile/NAMING_DECISIONS.md`
- `docs/mobile/NAMING_REFACTOR_WORK_PLAN.md`

확정한 주요 기준은 다음과 같다.

- `스타일/Style`은 룩 도메인에서는 레거시 이름으로 보고 `룩/Look` 계열로 통일한다.
- `MakeupFilter`는 저장/적용 가능한 메이크업 효과 전체, `MakeupLook`은 사용자가 인식하는 룩 단위로 구분한다.
- `TotalMakeupLook`은 얼굴 전체 룩, `PointMakeupLook`은 립/아이/치크 등 특정 부위 룩이다.
- AR 필터 편집 화면은 `LookEdit`이 아니라 현재 필터 조합 전체를 편집하는 `MakeupFilterEditScreen`으로 정리한다.
- AR 필터 저장 화면은 `MakeupLookSaveScreen`이 아니라 `MakeupFilterSaveScreen`으로 정리한다.
- `위치/Location` 옵션은 `형태/Shape`로 정리하고, 사용자가 옮기는 형태 조정점은 `shapePoint`로 부른다.
- `shapePoint.position`은 좌표, `shapePoint.offset`은 기준점 대비 이동량이다.
- 얼굴 분석은 `FaceAnalysis`, 메이크업 피드백은 `MakeupFeedback`, 레퍼런스 추출은 `ReferenceMakeupExtraction`으로 분리한다.
- `Guide`는 AR 반반가이드 같은 기준 UI에 남기고, 사용법 안내는 `Tutorial`, 메이크업 구성/절차는 `MakeupRecipe`, 적용 기준선/규칙은 `Guideline`으로 분리한다.
- 실제 제품은 `Product`, 추천 결과 항목은 `RecommendedProduct`, 추천 기능/플로우는 `ProductRecommendation`으로 구분한다.
- 계정 기본 정보는 `UserProfile`, 마이페이지 표시용 요약은 `MyPageProfileSummary`, 추천/분석에 쓰는 뷰티 특성은 `BeautyProfile`으로 분리한다.

현재 navigation route에는 아직 `ImageAnalysis*`, `ARFilterLocationAdjust`, `ARFilterStyleAdjust`, `ExtractedMakeupStyle*`, `MakeupStyleList` 같은 레거시 이름이 남아 있다. 이 이름들은 과거 route 계약을 설명하기 위해 히스토리 문서에서는 유지하되, 새 작업에서는 `NAMING_REFACTOR_WORK_PLAN.md`의 rename 순서를 따른다.

### `feat: 모바일 딥링크와 데모 상태 추가`

커밋: `ea9563c`

`AppRoot.tsx`에 React Navigation linking 설정을 추가했다. 앱 커스텀 스킴과 Expo 로컬 URL을 prefix로 등록하고, root stack route 및 nested tab route를 URL path에 매핑했다.

주요 path 예시는 다음과 같다.

- `aiarmakeup://login`
- `aiarmakeup://tabs/home`
- `aiarmakeup://tabs/custom`
- `aiarmakeup://tabs/my-page`
- `aiarmakeup://image-analysis-report/:reportId?`
- `aiarmakeup://feedback-tip/:pointId`
- `aiarmakeup://filter-recipe-detail`

`flowState.tsx`에는 데모와 화면 캡처를 위한 초기 상태를 넣었다. 이전에는 feedback result, selected filter photo, saved makeup style이 `null`일 수 있어서 딥링크로 결과/상세 화면에 바로 들어가면 placeholder로 빠질 수 있었다. 현재는 mock feedback result, 기본 filter photo, 저장된 makeup style preview를 초기값으로 갖게 해서 직접 진입 화면도 확인 가능하게 했다.

검증:

- `npm --prefix apps/mobile run typecheck`

### 후속 정리: 딥링크 설정 검증과 route path 누락 방지

이번 작업은 이미 들어가 있던 딥링크 설정이 앱 설정까지 실제로 이어져 있는지 확인하고, 앞으로 route가 늘어날 때 URL path 매핑을 빠뜨리지 않도록 테스트를 보강한 것이다.

딥링크는 두 겹의 설정이 함께 맞아야 동작한다.

첫 번째는 앱을 여는 문이다. Expo app config의 `scheme` 값이 여기에 해당한다. 현재 `apps/mobile/app.json`에는 `expo.scheme`이 `aiarmakeup`으로 등록되어 있다. 이 값이 있어야 iOS가 `aiarmakeup://...` 형태의 URL을 이 앱으로 전달할 수 있다. 이 설정이 빠지거나 Navigation 설정과 다르면, React Navigation 쪽 path 매핑이 아무리 맞아도 앱 자체가 URL을 받지 못한다.

두 번째는 앱 안에서 어느 화면으로 갈지 정하는 지도다. React Navigation의 `NavigationContainer`에 들어가는 `linking` 설정이 이 역할을 한다. 예를 들어 `aiarmakeup://feedback-tip/eyeline-point`가 들어오면 앱은 먼저 `aiarmakeup` 스킴으로 열리고, 그 다음 `feedback-tip/:pointId` path를 해석해 `FeedbackTip` route와 `pointId` param으로 연결한다.

이번 정리에서는 이 두 설정을 다음처럼 다뤘다.

- `linkingConfig.ts`
  - `APP_DEEP_LINK_SCHEME`을 `aiarmakeup`으로 고정했다.
  - native app URL prefix인 `aiarmakeup://`와 Expo 개발용 prefix인 `exp://127.0.0.1:8082/--/`, `exp://localhost:8082/--/`를 한 곳에 모았다.
  - root stack route와 main tab route의 path mapping을 `rootStackLinkingScreens`, `mainTabLinkingScreens`로 분리했다.
  - `navigationLinking`을 export해 `AppRoot.tsx`의 `NavigationContainer`가 같은 설정 객체를 사용하게 했다.

- `linkingConfig.test.ts`
  - `apps/mobile/app.json`의 `expo.scheme`과 `APP_DEEP_LINK_SCHEME`이 같은지 검증한다.
  - `NavigationContainer` prefix에 `aiarmakeup://`와 Expo 개발 URL이 들어 있는지 검증한다.
  - `rootStackRoutes`의 모든 route가 linking screen config에 존재하는지 확인한다.
  - `mainTabRoutes`의 모든 tab route가 `MainTabs` nested linking config에 존재하는지 확인한다.
  - 반대로 linking config에 routeTypes에 없는 알 수 없는 route 이름이 들어가지 않았는지도 확인한다.
  - `ImageAnalysisReportDetail`의 optional `reportId`, `FeedbackTip`의 required `pointId`처럼 param path가 필요한 route의 path 형식도 확인한다.

이 테스트가 막아주는 문제는 단순한 오타 이상이다. 새 화면을 `routeTypes.ts`와 `RootNavigator.tsx`에는 추가했지만 딥링크 path를 빠뜨리면, 앱 내부 버튼 이동은 되는데 외부 URL 직접 진입은 실패할 수 있다. 반대로 path config에 오래된 route 이름이 남으면 실제 navigator에는 없는 주소가 문서나 QA 시나리오에 남을 수 있다. 그래서 route 목록과 linking map을 같은 계약으로 묶어두는 것이 중요하다.

검증:

- RED: `apps/mobile/node_modules/.bin/tsc --ignoreConfig --noEmit --pretty false --skipLibCheck true --target es2020 --module preserve --moduleResolution bundler --jsx react-jsx --allowSyntheticDefaultImports true --esModuleInterop true --resolveJsonModule true apps/mobile/src/app/navigation/linkingConfig.test.ts` 실행 시 `Cannot find module './linkingConfig'`로 실패하는 것을 확인했다.
- GREEN: `apps/mobile/node_modules/.bin/tsc --ignoreConfig --noEmit --pretty false --skipLibCheck true --target es2020 --module preserve --moduleResolution bundler --jsx react-jsx --allowSyntheticDefaultImports true --esModuleInterop true --resolveJsonModule true apps/mobile/src/app/navigation/linkingConfig.test.ts apps/mobile/src/app/navigation/linkingConfig.ts apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app-root/AppRoot.tsx`
- app config scheme 확인: `node -e "const config=require('./apps/mobile/app.json'); if (config.expo.scheme !== 'aiarmakeup') { console.error('scheme mismatch:', config.expo.scheme); process.exit(1); } console.log(config.expo.scheme);"`
- 전체 타입체크: `npm --prefix apps/mobile run typecheck`

### 후속 정리: 데모 초기 상태 분리

이후 후속 작업으로 `flowState.tsx`에 직접 들어가 있던 데모 seed를 기본 앱 상태에서 분리했다.

분리 전에는 `NavigationFlowStateProvider`의 기본 초기값이 다음 데모 데이터를 바로 포함했다.

- `feedbackResult`: `createMockMakeupFeedback(...)`로 만든 mock feedback 결과
- `selectedFilterPhoto`: `getFilterExtractionDataSync().photos[0]`
- `savedMakeupStyle`: 캡처용 저장룩 preview

이 방식은 딥링크로 `FeedbackResult`, `FeedbackGuide`, `FeedbackTip`, `FilterResult`, `FilterRecipeDetail` 같은 화면에 바로 들어가 캡처하기에는 편했다. 하지만 일반 앱 시작 상태에서도 결과/저장룩이 이미 존재하는 것처럼 보일 수 있어 production 기본값으로는 부적절했다.

분리 후 책임은 다음과 같다.

- `flowState.tsx`
  - 일반 앱 기본 상태만 제공한다.
  - `feedbackResult`, `savedMakeupStyle`, `selectedFilterPhoto`는 `null`로 시작한다.
  - `selectedFeedbackPhoto`만 기존처럼 `{source: 'camera'}`를 기본 선택값으로 둔다.
  - `NavigationFlowStateProvider`는 `initialState` prop을 받을 수 있어 외부에서 명시적으로 seed를 주입할 수 있다.

- `demoFlowState.ts`
  - 데모/캡처 전용 seed를 제공한다.
  - `getDemoNavigationFlowState()`가 mock feedback result, 기본 filter photo, 캡처용 saved makeup style을 만든다.
  - mock import와 filter extraction mock 접근은 이 파일에만 남긴다.

이제 일반 앱은 `NavigationFlowStateProvider`를 prop 없이 사용해 깨끗한 상태로 시작하고, 화면 캡처나 딥링크 검토처럼 seed가 필요한 경우에만 `getDemoNavigationFlowState()`를 명시적으로 주입하면 된다. 이 정리는 데모 편의성과 일반 앱 초기 상태를 분리하기 위한 조치다.

데모 seed 사용 예시는 다음과 같다.

```tsx
import {getDemoNavigationFlowState} from '../app/navigation/demoFlowState';

<NavigationFlowStateProvider initialState={getDemoNavigationFlowState()}>
  <NavigationContainer>{/* ... */}</NavigationContainer>
</NavigationFlowStateProvider>
```

현재 `AppRoot.tsx`는 이 prop을 넘기지 않으므로 일반 앱 실행은 빈 flow state에서 시작한다.

검증:

- `apps/mobile/node_modules/.bin/tsc --ignoreConfig --noEmit --pretty false --skipLibCheck true --target es2020 --module esnext --moduleResolution bundler --jsx react-jsx --allowSyntheticDefaultImports true --esModuleInterop true apps/mobile/src/app/navigation/flowState.test.tsx apps/mobile/src/app/navigation/flowState.tsx apps/mobile/src/app/navigation/demoFlowState.ts`

### 후속 정리: 상세 헤더 route chrome 완전 통합

이번 작업에서는 `sub` depth 화면의 normal detail header를 feature screen 내부에서 완전히 제거하고, route adapter가 공통 `DetailRouteChrome`으로 한 번만 렌더하도록 통합했다.

핵심 방향은 다음과 같다.

- `routeChrome.ts`
  - 상세 화면 title의 단일 출처 역할을 유지한다.
  - 기존 `rightAction: 'custom'` 같은 임시 표현을 `rightActions: ['share', 'close']`, `['done']`, `['close']`처럼 실제 UI 액션 이름으로 바꿨다.
  - 현재 route-level 상세 액션은 `share`, `close`, `done` 세 가지다.

- `detailHeaderChrome.tsx`
  - 새 route-level detail header renderer다.
  - `getDetailHeaderPresentation(routeName)`이 `routeChrome.ts`의 title/rightActions를 읽어 헤더 표시 계약을 만든다.
  - `DetailRouteChrome`은 `AppHeader`를 한 번 렌더하고, 그 아래에 feature screen content를 배치한다.
  - `onBack`, `onClose`, `onShare`, `onDone` callback을 route adapter에서 받아 route별 동작으로 연결한다.
  - close-only 화면은 왼쪽 빈 슬롯을 예약해 center title 정렬을 유지한다.

- `navigationAdapters.tsx`
  - `ImageAnalysisLoading`, `ImageAnalysisReportsList`, `ImageAnalysisReportDetail`, `ProfileEdit`, `MakeupStyleList`, `LikedProductList`, `FeedbackEntry`, `FeedbackLoading`, `FeedbackResult`, `FeedbackGuide`, `FeedbackTip`, `FilterUpload`, `FilterResult`, `FilterSave`, `FilterRecipeDetail`을 `DetailRouteChrome`으로 감싼다.
  - `FeedbackCapture`, `FaceCapture`, `ARMakeupFilter`, `FilterLoading`, `FilterTryOn`, terminal saved screens처럼 immersive/terminal로 분류된 화면은 local overlay나 bottom action을 유지한다.
  - fallback `RoutePlaceholder`는 `showHeader={false}`로 route-level detail header 아래에 중복 헤더 없이 표시한다.

- `ImageAnalysisReportDetailScreen`
  - 내부 `AppHeader`, share/close header button, header 전용 liquid glass target을 제거했다.
  - 공유 메시지는 report/profile 데이터가 필요하므로 화면이 `onHeaderShareActionChange`로 현재 공유 함수를 route adapter에 등록한다.
  - adapter의 공유 액션 등록 callback은 `useCallback`으로 고정해 effect cleanup/register가 불필요하게 반복되지 않도록 했다.
  - route header의 share 버튼은 report가 로드되기 전에는 disabled 상태가 되고, 로드 후 등록된 공유 함수를 실행한다.

- feature screen 정리 범위
  - 제거한 screen-local normal `AppHeader` 대상: analysis detail/list/loading, profile edit, recommendation lists, feedback detail/progress/tip/guide/entry, filter upload/result/save/recipe detail.
  - 남긴 local controls 대상: camera/AR/try-on/progress/terminal 성격의 fullscreen 화면. 이 버튼들은 앱 상세 헤더가 아니라 촬영/AR 런타임의 일부로 본다.

테스트도 새 계약에 맞춰 조정했다.

- `detailHeaderChrome.test.ts`
  - route title과 `FeedbackEntry`, `FilterUpload`, `FilterSave`, `ImageAnalysisReportDetail`의 rightActions를 검증한다.
- feedback screen tests
  - 더 이상 각 screen이 `AppHeader` presentation을 export한다고 가정하지 않는다.
  - 화면 JSX props 계약만 유지하고, 헤더 정책은 route-level 테스트로 이동했다.
- image analysis report detail test
  - `headerPlacement`를 `route-level`로 바꾸고, header action button liquid glass target이 screen 책임이 아님을 확인한다.

검증:

- `apps/mobile/node_modules/.bin/tsc --ignoreConfig --noEmit --pretty false --skipLibCheck true --target es2020 --module esnext --moduleResolution bundler --jsx react-jsx --allowSyntheticDefaultImports true --esModuleInterop true apps/mobile/src/app/navigation/detailHeaderChrome.test.ts apps/mobile/src/app/navigation/detailHeaderChrome.tsx apps/mobile/src/app/navigation/routeChrome.ts apps/mobile/src/app/navigation/navigationAdapters.tsx apps/mobile/src/shared/ui/RoutePlaceholder.tsx apps/mobile/src/features/analysis/screens/ImageAnalysisReportDetailScreen.tsx apps/mobile/src/features/analysis/screens/ImageAnalysisReportDetailScreen.test.tsx`
- `npm --prefix apps/mobile run typecheck`

### `refactor: 모바일 화면 전환을 React Navigation으로 변경`

커밋: `f7cb613`

가장 큰 구조 변경이다. `AppRoot.tsx`가 직접 화면을 switch 하던 구조를 제거하고, React Navigation 기반 구조로 바꿨다.

추가된 주요 파일:

- `apps/mobile/src/app/navigation/RootNavigator.tsx`
- `apps/mobile/src/app/navigation/MainTabNavigator.tsx`
- `apps/mobile/src/app/navigation/navigationAdapters.tsx`
- `apps/mobile/src/app/navigation/mainTabChrome.ts`
- `apps/mobile/src/app/navigation/navigationState.ts`

삭제된 legacy 파일:

- `apps/mobile/src/app-root/navigation.ts`
- `apps/mobile/src/app-root/navigation.test.ts`

역할 분리는 다음처럼 바뀌었다.

- `AppRoot.tsx`: font, Tamagui, safe area, status bar, `NavigationContainer`만 담당
- `RootNavigator.tsx`: auth, onboarding, main tabs, detail, fullscreen route 등록
- `MainTabNavigator.tsx`: `HomeTab`, `CustomTab`, `MyPageTab`와 custom `AppFooter` 연결
- `navigationAdapters.tsx`: 기존 screen component의 props와 React Navigation callback을 연결
- `navigationState.ts`: nested route를 풀어 현재 route의 status bar style 계산
- `mainTabChrome.ts`: 메인 탭 header copy와 footer active state 계산

이 커밋에서 `activeScreen`, `renderScreen()`, local `AppShell`이 제거됐다. 메인 화면의 shell 역할은 이제 `MainTabNavigator`와 `MainTabChrome`이 맡는다.

### `docs: 모바일 내비게이션 계획 구현 상태 반영`

커밋: `8922b24`

`docs/mobile/REACT_NAVIGATION_CHROME_PLAN.md`가 구현 전 계획 중심으로 남아 있던 부분을 실제 코드 상태에 맞게 수정했다.

반영한 내용:

- `AppRoot.tsx`가 provider와 navigation host만 맡는다는 현재 상태
- `mainTabChrome.ts`, `navigationState.ts`, `mainTabChrome.test.ts` 추가
- `MainTabs`가 `NavigatorScreenParams<MainTabParamList>`를 받는 타입 구조
- AR 조정 화면의 back route를 전체 root route가 아니라 필요한 route로 좁힌 점
- 완료한 dependency, route chrome, flow state, navigator 전환 작업 체크
- 상세 visual header 완전 이관은 후속 작업으로 남겨둔 점

## 커밋 기반 연표

| Commit | Type | 내용 |
| --- | --- | --- |
| `a602601` | `refactor` | 모바일 아이콘 방향을 Lucide 기반으로 정리했다. 이후 header/footer/action icon을 하나의 아이콘 방향으로 맞추는 기반이 됐다. |
| `345f825` | `feat` | 홈 히어로 캐러셀 순환을 추가했다. 메인 홈 화면이 탭 shell 안에서 반복 진입되어도 독립적으로 동작하는 UI 흐름을 강화했다. |
| `7ce289e` | `refactor` | 화면 chrome 정책을 중앙화하기 시작했다. 이 단계에서 shell/header/fullscreen을 구분하는 사고방식이 생겼고, 이후 `routeChrome.ts`의 depth/category/kind 모델로 이어졌다. |
| `e9a0560` | `refactor` | 피드백 상세 헤더를 공통화했다. 피드백 플로우가 여러 화면으로 나뉘면서 헤더 표현을 중복하지 않으려는 첫 정리였다. |
| `3884a36` | `docs` | `REACT_NAVIGATION_CHROME_PLAN.md`를 추가했다. entry/main/sub/immersive/terminal depth와 기능별 category, route inventory를 문서화했다. |
| `0807081` | `refactor` | 피드백 화면 헤더 기준을 정리했다. 별도 `FeedbackDetailHeader`를 제거하고 각 피드백 화면이 `AppHeader` 기준을 따르도록 맞췄다. |
| `1116a2c` | `chore` | React Navigation 의존성을 추가했다. `@react-navigation/native`, native stack, bottom tabs, `react-native-screens`를 설치하고 `react-dom` 버전을 React와 맞췄다. |
| `dbbbc24` | `refactor` | `routeTypes.ts`, `routeChrome.ts`, `navigation.test.ts`를 추가했다. route 이름, route params, depth/category/chrome policy, footer target helper를 typed config로 고정했다. |
| `aaea9f2` | `refactor` | `NavigationFlowStateProvider`를 추가했다. feedback result, selected feedback photo, selected filter photo, saved makeup style을 route param 대신 flow state로 옮겼다. |
| `f7cb613` | `refactor` | 실제 화면 전환을 React Navigation으로 변경했다. root stack, main tabs, adapters, status bar sync를 추가하고 old activeScreen router를 삭제했다. |
| `8922b24` | `docs` | 계획 문서를 실제 구현 상태에 맞게 갱신했다. 완료된 작업과 후속 작업을 분리했다. |
| `ea9563c` | `feat` | 딥링크 path mapping과 데모용 초기 flow state를 추가했다. URL 직접 진입 및 화면 캡처용 흐름이 쉬워졌다. |

## 현재 구조 요약

```text
apps/mobile/src/
  app-root/
    AppRoot.tsx
  app/
    navigation/
      RootNavigator.tsx
      MainTabNavigator.tsx
      routeTypes.ts
      linkingConfig.ts
      routeChrome.ts
      mainTabChrome.ts
      detailHeaderChrome.tsx
      navigationState.ts
      flowState.tsx
      demoFlowState.ts
      navigationAdapters.tsx
```

현재 기준은 다음과 같다.

- route 이름과 params는 `routeTypes.ts`가 관리한다.
- 딥링크 scheme, URL prefix, route path mapping은 `linkingConfig.ts`가 관리한다.
- 화면 depth/category/chrome/status bar/title은 `routeChrome.ts`가 관리한다.
- 메인 탭의 header copy와 footer active state는 `mainTabChrome.ts`가 관리한다.
- 상세 헤더 렌더링과 route-level 오른쪽 액션은 `detailHeaderChrome.tsx`가 관리한다.
- route-local이 아닌 임시 UI 상태는 `flowState.tsx`가 관리한다.
- 데모/캡처용 초기 flow seed는 `demoFlowState.ts`가 별도로 관리한다.
- feature screen은 자체 콘텐츠 UI를 유지하고, adapter가 navigation callback과 route-level chrome을 연결한다.

## 헤더와 푸터 정리 상태

정리 완료:

- 메인 shell header/footer는 `MainTabNavigator`와 `MainTabChrome`으로 모였다.
- `HomeTab`, `CustomTab`, `MyPageTab`은 feature screen 내부에서 `AppFooter`를 직접 다루지 않는다.
- footer의 `capture`는 tab route가 아니라 root stack의 `ARMakeupFilter` action으로 연결된다.
- 상세 화면 title과 share/close/done action은 route-level `DetailRouteChrome`에서 렌더된다.
- `sub` depth feature screen은 normal `AppHeader`를 직접 렌더하지 않는다.
- fullscreen 화면의 status bar style은 route chrome 기반으로 동기화된다.

후속 정리:

- 새로 추가되는 `sub` route는 `navigationAdapters.tsx`에서 반드시 `DetailRouteChrome`으로 감싸고, feature screen 내부에 normal `AppHeader`를 추가하지 않는다.
- share처럼 화면 데이터가 필요한 header action은 route param으로 callback을 넘기지 말고, 현재처럼 flow/local state 또는 registration callback으로 adapter에 연결한다.
- immersive 화면의 overlay button과 terminal 화면의 bottom action은 detail header와 다른 UX이므로 계속 별도 관리한다.

## 검증 기록

최근 구조 변경 후 다음 검증을 통과했다.

```bash
npm --prefix apps/mobile run typecheck
```

commitlint 설정은 루트 `commitlint.config.js` 기준으로 `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`만 허용한다. 이번 히스토리 문서 커밋도 이 규칙에 맞춰 `docs` 타입으로 남긴다.

## 화면 캡처 산출물

이번 브랜치에는 React Navigation 전환 이후 전체 화면 상태를 검토할 수 있는 캡처 산출물을 포함한다.

최신 캡처본:

- `apps/mobile/screenshots/all-screens-20260625-160028/`
- `apps/mobile/screenshots/all-screens-20260625-160028.zip`

이번 최신 캡처는 iPhone 17 Pro iOS Simulator에서 Expo Go를 실행한 뒤, React Navigation deep link path로 route를 하나씩 열어 저장했다. 결과 화면처럼 flow state가 필요한 화면은 실제 loading route를 먼저 통과시켜 mock result state가 채워진 상태에서 캡처했다. 캡처 중 entry 화면과 filter extraction 계열은 `exp://localhost:8082/--/` prefix가 가장 안정적으로 동작해 해당 prefix로 재캡처했다.

최신 캡처 파일 구성:

- `00_contact_sheet.jpg`: 29개 화면을 한 장에 모은 검토용 contact sheet
- `01_Login.png`부터 `29_RecipeSaved.png`: route별 개별 화면 캡처

포함 경로:

- `apps/mobile/screenshots/all-screens-20260625-142436/`
- `apps/mobile/screenshots/all-screens-20260625-142436.zip`

주요 파일:

- `00_contact_sheet.jpg`: 29개 화면을 한 장에 모은 검토용 contact sheet
- `01_Login.png`부터 `29_RecipeSaved.png`: route별 개별 화면 캡처

캡처 대상 route:

- Entry: `Login`, `Tutorial`
- Main tabs: `HomeTab`, `CustomTab`, `MyPageTab`
- Analysis: `FaceCapture`, `ImageAnalysisLoading`, `ImageAnalysisReportsList`, `ImageAnalysisReportDetail`
- Profile/recommendation: `ProfileEdit`, `MakeupStyleList`, `LikedProductList`
- AR: `ARMakeupFilter`, `ARFilterLocation`, `ARFilterStyle`
- Feedback: `FeedbackEntry`, `FeedbackCapture`, `FeedbackLoading`, `FeedbackResult`, `FeedbackGuide`, `FeedbackTip`
- Filter extraction: `FilterUpload`, `FilterLoading`, `FilterResult`, `FilterTryOn`, `FilterSave`, `FilterSaved`, `FilterRecipeDetail`, `RecipeSaved`

이 산출물은 PR 리뷰에서 화면 분류와 chrome 정책이 실제 렌더링에 어떻게 반영됐는지 확인하기 위한 자료다. 특히 메인 탭 shell, 상세 헤더, 풀스크린 AR/촬영 화면, terminal 저장 완료 화면을 한 번에 비교할 수 있다.
