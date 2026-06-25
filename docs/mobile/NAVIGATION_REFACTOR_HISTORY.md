# Mobile Navigation Refactor History

작성일: 2026-06-25

이 문서는 모바일 앱의 화면 구조, React Navigation 전환, 헤더/푸터 chrome 정리, 데모용 딥링크 상태 구성 과정을 커밋 히스토리 기준으로 정리한 기록이다. 과거 내역은 이전 커밋 메시지와 변경 파일 범위를 기준으로 작성했다.

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
      routeChrome.ts
      mainTabChrome.ts
      navigationState.ts
      flowState.tsx
      navigationAdapters.tsx
```

현재 기준은 다음과 같다.

- route 이름과 params는 `routeTypes.ts`가 관리한다.
- 화면 depth/category/chrome/status bar/title은 `routeChrome.ts`가 관리한다.
- 메인 탭의 header copy와 footer active state는 `mainTabChrome.ts`가 관리한다.
- route-local이 아닌 임시 UI 상태는 `flowState.tsx`가 관리한다.
- feature screen은 아직 대부분 자체 화면 UI를 유지하고, adapter가 navigation callback과 route chrome title을 주입한다.

## 헤더와 푸터 정리 상태

정리 완료:

- 메인 shell header/footer는 `MainTabNavigator`와 `MainTabChrome`으로 모였다.
- `HomeTab`, `CustomTab`, `MyPageTab`은 feature screen 내부에서 `AppFooter`를 직접 다루지 않는다.
- footer의 `capture`는 tab route가 아니라 root stack의 `ARMakeupFilter` action으로 연결된다.
- 상세 화면 title은 production route 진입 시 `getDetailRouteTitle(routeName)`에서 주입된다.
- fullscreen 화면의 status bar style은 route chrome 기반으로 동기화된다.

후속 정리:

- 일부 상세 화면은 share, close, done 같은 screen-specific action 때문에 아직 screen 내부에서 visual `AppHeader`를 렌더한다.
- 이 visual header까지 완전히 route-level chrome으로 올리려면 action slot 설계가 먼저 필요하다.
- `ImageAnalysisReportDetail`, `FilterSave`, `FilterRecipeDetail`, `FeedbackEntry`, `FilterUpload`처럼 특수 액션이 있는 화면을 우선 대상으로 삼는 것이 좋다.

## 검증 기록

최근 구조 변경 후 다음 검증을 통과했다.

```bash
npm --prefix apps/mobile run typecheck
```

commitlint 설정은 루트 `commitlint.config.js` 기준으로 `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`만 허용한다. 이번 히스토리 문서 커밋도 이 규칙에 맞춰 `docs` 타입으로 남긴다.

## 화면 캡처 산출물

이번 브랜치에는 React Navigation 전환 이후 전체 화면 상태를 검토할 수 있는 캡처 산출물을 포함한다.

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
