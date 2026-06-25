# Mobile Navigation And Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Latest naming note (2026-06-26):** This document preserves route names from the navigation refactor period. For new work, use `docs/mobile/NAMING_DECISIONS.md` and `docs/mobile/NAMING_REFACTOR_WORK_PLAN.md` as the naming source of truth. In particular, makeup-domain `Style` names should move to `Look`, AR edit/save surfaces should move to `MakeupFilterEditScreen`/`MakeupFilterSaveScreen`, `Location` options should move to `Shape`/`shapePoint`, face analysis should move from `ImageAnalysis*` to `FaceAnalysis*`, and recommended product items should use `RecommendedProduct`.

**Goal:** Replace the current `activeScreen` state router with React Navigation and make header/footer behavior consistent across the mobile app.

**Architecture:** React Navigation owns route state, back behavior, and tab selection. Existing visual components (`AppHeader`, `AppFooter`, `AppScreen`) remain the design system surfaces, while a central route chrome config decides whether each route shows a main tab shell, a detail header, or a fullscreen layout.

**Tech Stack:** React Native, Expo, TypeScript, React Navigation, Tamagui, existing shared theme/UI tokens.

---

## Why This Work Exists

The app currently switches screens from `apps/mobile/src/app-root/AppRoot.tsx` with local `activeScreen` state. That worked for the prototype, but the app now has main tabs, nested detail screens, fullscreen camera/AR flows, makeup feedback flows, reference makeup extraction flows, and saved-result flows.

Without React Navigation, every new screen needs manual decisions for:

- where back navigation goes
- whether the footer is visible
- whether the header is brand, detail, custom, or hidden
- where selected flow data is stored
- how a screen is deep-linked or revisited

This migration moves those decisions into navigation and chrome config files instead of scattering them across feature screens.

## Screen Classification System

Before choosing a header, footer, or layout wrapper, classify each screen by depth and function. This classification is the design contract for the app.

`routeChrome.ts` is intentionally broader than a simple header/footer lookup table. It is the central screen classification map: each route declares its depth, functional category, visible chrome type, status bar policy, and detail header copy/actions in one place. This keeps screen structure decisions out of feature screens and makes new routes easier to review.

Use this distinction when discussing screens:

- **Screen content** is the feature UI itself: makeup results, cards, lists, photos, forms, CTA buttons, guide overlays, and other user-facing content inside the screen.
- **Screen chrome** is the shared frame around that content: app header, footer, status bar style, route-level detail header, fullscreen mode, and common layout shell.

Feature teams should mostly own screen content. Navigation/chrome files own whether that content is shown inside a main tab shell, a detail page, an immersive runtime, or a completion surface.

### Depth Levels

Depth describes where the screen sits in the user journey and how much shared app frame it should show.

| Depth | Meaning | Header | Footer | Examples |
| --- | --- | --- | --- | --- |
| `entry` | before the user enters the app or during initial entry | none or bespoke onboarding header | hidden | `Login`, `Tutorial` |
| `main` | top-level app tab surface | brand header | visible | `HomeTab`, `CustomTab`, `ProfileTab` |
| `sub` | one step inside a main surface: detail, list, or form | detail header | hidden | `ProfileEdit`, `LikedProductList`, `MakeupFeedbackResult` |
| `immersive` | focused experience where normal header/footer would get in the way | local overlay controls only | hidden | `FaceCapture`, `ARFilter`, `ARFilterLocationAdjust` |
| `terminal` | end-of-flow confirmation or completion screen | no app header, bottom actions | hidden | `ExtractedMakeupStyleSaveComplete`, `ExtractedMakeupStyleRecipeSaveComplete` |

### Functional Categories

Category describes what the screen does within its depth. Two screens can both be `sub`, but one may be a `list` and another may be a `form-edit`, so their content and right-side header actions can differ.

| Category | Purpose | Layout Rules |
| --- | --- | --- |
| `auth` | login or account entry before the main app | centered brand/content, no app footer |
| `onboarding` | first-run education or setup guidance | immersive copy, primary CTA, no app footer |
| `main-home` | home dashboard and primary recommendations entry | brand header, footer, section stacks |
| `main-recommendation` | product recommendation hub | brand/product header, footer, reusable content sections |
| `main-profile` | user hub and saved activity entry points | brand header, footer visible with no active footer item |
| `feature-entry` | starts a feature flow from a main surface | detail header or close header, one primary action |
| `list` | saved/list/index screen for browsing existing items | detail header, grid/list, empty state if needed |
| `detail-report` | analysis/report/read-only result screen | detail header, scroll content, route-level actions if needed |
| `form-edit` | user editing, naming, saving, or settings form | detail header, right save/done action when needed |
| `progress` | loading, analysis, extraction, or waiting state | detail header if user can go back, fullscreen only for immersive flows |
| `capture-runtime` | camera/photo acquisition surface | fullscreen, overlay close/back controls |
| `ar-runtime` | AR, try-on, or filter adjustment runtime | fullscreen, overlay controls |
| `completion` | saved/done confirmation at the end of a flow | centered icon/title/copy, bottom actions |
| `navigation-host` | navigator container route that only hosts child routes | no visible UI of its own |

### Current Screen Inventory

Use this table as the starting point for `routeChrome.ts`. If a screen is added later, add it here first, then implement the route.

| Route | Depth | Category | Chrome | Design Notes |
| --- | --- | --- | --- | --- |
| `Login` | `entry` | `auth` | fullscreen | Keep auth-specific layout; no app header/footer. |
| `Tutorial` | `entry` | `onboarding` | fullscreen | Keep onboarding-specific layout; no app footer. |
| `MainTabs` | `main` | `navigation-host` | fullscreen host | Does not render visible UI directly. |
| `HomeTab` | `main` | `main-home` | brand header + footer | `AuraLogo` header, active footer `home`. |
| `CustomTab` | `main` | `main-recommendation` | brand header + footer | Product recommendation copy, active footer `custom`. |
| `ProfileTab` | `main` | `main-profile` | brand header + footer | Footer visible with no active footer item. |
| `FaceCapture` | `immersive` | `capture-runtime` | fullscreen | Camera-like close/capture overlay only. |
| `ImageAnalysisLoading` | `sub` | `progress` | detail header | Route-level detail header title `얼굴 분석`. |
| `ImageAnalysisReportsList` | `sub` | `list` | detail header | Grid/list index screen. |
| `ImageAnalysisReportDetail` | `sub` | `detail-report` | detail header with actions | Preserve share and close actions. |
| `ProfileEdit` | `sub` | `form-edit` | detail header | Profile form; logout remains screen content action. |
| `MakeupStyleList` | `sub` | `list` | detail header | Saved makeup styles grid. |
| `LikedProductList` | `sub` | `list` | detail header | Liked product grid. |
| `ARFilter` | `immersive` | `ar-runtime` | fullscreen | AR/camera runtime. |
| `ARFilterLocationAdjust` | `immersive` | `ar-runtime` | fullscreen | AR adjustment runtime. |
| `ARFilterStyleAdjust` | `immersive` | `ar-runtime` | fullscreen | AR adjustment runtime. |
| `MakeupFeedbackEntry` | `sub` | `feature-entry` | detail header with close action | Route-level close header title `메이크업 피드백`. |
| `MakeupFeedbackCapture` | `immersive` | `capture-runtime` | fullscreen | Camera/gallery acquisition. |
| `MakeupFeedbackLoading` | `sub` | `progress` | detail header | Route-level detail header title `메이크업 피드백`. |
| `MakeupFeedbackResult` | `sub` | `detail-report` | detail header | Makeup feedback report result. |
| `MakeupCorrectionGuide` | `sub` | `detail-report` | detail header | Makeup correction guide overlay explanation. |
| `MakeupCorrectionTip` | `sub` | `detail-report` | detail header | One selected makeup correction point. |
| `ReferenceMakeupExtractionUpload` | `sub` | `feature-entry` | detail header with close action | Current code title is `메이크업 추출`; tab row stays in screen content. |
| `ReferenceMakeupExtractionLoading` | `immersive` | `progress` | fullscreen | Current code uses local compact back affordance. |
| `ReferenceMakeupExtractionResult` | `sub` | `detail-report` | detail header | Extracted makeup analysis. |
| `ExtractedMakeupStyleAdjust` | `immersive` | `ar-runtime` | fullscreen | Extracted makeup style try-on/editor runtime. |
| `ExtractedMakeupStyleSaveForm` | `sub` | `form-edit` | detail header with save action | Preserve right `완료` action. |
| `ExtractedMakeupStyleSaveComplete` | `terminal` | `completion` | fullscreen | Saved confirmation with bottom actions. |
| `ExtractedMakeupStyleRecipeDetail` | `sub` | `detail-report` | detail header | Route-level title is `상세 분석`; tab row stays in content. |
| `ExtractedMakeupStyleRecipeSaveComplete` | `terminal` | `completion` | fullscreen | Recipe saved confirmation with bottom actions. |

### 현재 앱 화면별 상태

현재 앱의 화면 상태는 `routeChrome.ts`, `RootNavigator.tsx`, `MainTabNavigator.tsx`, `DetailRouteChrome` 기준으로 다음처럼 정리된다. 팀원이 새 화면을 추가하거나 기존 화면을 수정할 때는 이 표에서 같은 성격의 화면을 먼저 찾고, 같은 depth/category/chrome 규칙을 따르는 것이 기본이다.

| 화면/Route | 현재 depth | category | 현재 chrome 상태 |
| --- | --- | --- | --- |
| `Login` | `entry` | `auth` | 로그인 진입 화면. 앱 공통 헤더/푸터 없이 fullscreen으로 표시한다. |
| `Tutorial` | `entry` | `onboarding` | 온보딩/촬영 안내 진입 화면. 앱 공통 푸터 없이 자체 온보딩 UI를 사용한다. |
| `MainTabs` | `main` | `navigation-host` | 실제 화면을 그리지 않는 탭 navigator host다. |
| `HomeTab` | `main` | `main-home` | 메인 홈 탭. brand header와 footer를 보여주고 footer `home`이 active다. |
| `CustomTab` | `main` | `main-recommendation` | 추천 탭. brand/product header와 footer를 보여주고 footer `custom`이 active다. |
| `ProfileTab` | `main` | `main-profile` | 마이페이지 탭. brand header와 footer를 보여주지만 active footer item은 없다. |
| `FaceCapture` | `immersive` | `capture-runtime` | 얼굴 촬영 화면. 일반 header/footer 없이 카메라형 overlay control만 사용한다. |
| `ImageAnalysisLoading` | `sub` | `progress` | 얼굴 분석 진행 화면. route-level detail header title은 `얼굴 분석`이다. |
| `ImageAnalysisReportsList` | `sub` | `list` | 이미지 분석 결과 목록. route-level detail header title은 `이미지 분석 결과`다. |
| `ImageAnalysisReportDetail` | `sub` | `detail-report` | 맞춤 분석 보고서 상세. route-level detail header title은 `맞춤 분석 보고서`, 오른쪽 action은 `share`, `close`다. |
| `ProfileEdit` | `sub` | `form-edit` | 프로필 수정 폼. route-level detail header title은 `프로필 수정`이고 로그아웃은 화면 콘텐츠 action이다. |
| `MakeupStyleList` | `sub` | `list` | 저장된 메이크업 스타일 목록. route-level detail header title은 `메이크업 스타일`이다. |
| `LikedProductList` | `sub` | `list` | 좋아요 상품 목록. route-level detail header title은 `좋아요 목록`이다. |
| `ARFilter` | `immersive` | `ar-runtime` | AR 메이크업 필터 런타임. 일반 header/footer 없이 fullscreen overlay UI를 사용한다. |
| `ARFilterLocationAdjust` | `immersive` | `ar-runtime` | AR 필터 위치 조정 화면. fullscreen이며 local overlay controls를 사용한다. |
| `ARFilterStyleAdjust` | `immersive` | `ar-runtime` | AR 필터 스타일 조정 화면. fullscreen이며 local overlay controls를 사용한다. |
| `MakeupFeedbackEntry` | `sub` | `feature-entry` | 메이크업 피드백 시작 화면. route-level title은 `메이크업 피드백`, 오른쪽 action은 `close`다. |
| `MakeupFeedbackCapture` | `immersive` | `capture-runtime` | 메이크업 피드백 사진 촬영/선택 화면. 일반 header/footer 없이 capture UI를 사용한다. |
| `MakeupFeedbackLoading` | `sub` | `progress` | 메이크업 피드백 분석 진행 화면. route-level detail header title은 `메이크업 피드백`이다. |
| `MakeupFeedbackResult` | `sub` | `detail-report` | 메이크업 피드백 결과 보고서. route-level detail header title은 `메이크업 피드백`이다. |
| `MakeupCorrectionGuide` | `sub` | `detail-report` | 수정 가이드 오버레이 설명 화면. route-level detail header title은 `가이드 오버레이`다. |
| `MakeupCorrectionTip` | `sub` | `detail-report` | 선택된 메이크업 수정 포인트의 수정팁. route-level detail header title은 `수정팁`이다. |
| `ReferenceMakeupExtractionUpload` | `sub` | `feature-entry` | 레퍼런스 이미지 기반 메이크업 추출 시작/사진 선택 화면. route-level title은 `메이크업 추출`, 오른쪽 action은 `close`다. |
| `ReferenceMakeupExtractionLoading` | `immersive` | `progress` | 레퍼런스 메이크업 추출 진행 화면. fullscreen이며 진행 화면 안의 compact back affordance를 사용한다. |
| `ReferenceMakeupExtractionResult` | `sub` | `detail-report` | 추출된 메이크업 분석 결과. route-level detail header title은 `분석 결과`다. |
| `ExtractedMakeupStyleAdjust` | `immersive` | `ar-runtime` | 추출된 메이크업 스타일 try-on 조정 화면. 일반 header/footer 없이 fullscreen runtime UI를 사용한다. |
| `ExtractedMakeupStyleSaveForm` | `sub` | `form-edit` | 추출된 메이크업 스타일 저장 폼. route-level detail header title은 `메이크업 스타일 저장`, 오른쪽 action은 `done`이다. |
| `ExtractedMakeupStyleSaveComplete` | `terminal` | `completion` | 메이크업 스타일 저장 완료 화면. header/footer 없이 완료 메시지와 하단 action을 보여준다. |
| `ExtractedMakeupStyleRecipeDetail` | `sub` | `detail-report` | 메이크업 레시피 상세 분석. route-level title은 `상세 분석`, 내부 tab row는 화면 콘텐츠로 유지한다. |
| `ExtractedMakeupStyleRecipeSaveComplete` | `terminal` | `completion` | 레시피 저장 완료 화면. header/footer 없이 완료 메시지와 하단 action을 보여준다. |

### Design Contract By Classification

- `main` screens use the shared brand header and footer. They do not render `AppHeader` or `AppFooter` inside feature screens.
- `sub` screens use one route-level detail header. Feature screens should not render their own normal `AppHeader` after migration.
- `immersive` screens do not use route-level `AppHeader`; they may keep local overlay buttons that belong to the camera/AR experience.
- `terminal` screens do not show a header or footer; primary/secondary actions live in the bottom action area.
- `progress` screens are not automatically fullscreen. If the user should be able to back out through normal navigation, use a detail header.
- If a new screen does not fit one of these categories, add the category to this document before implementing the screen.

## Implementation State

### Current Router

- `apps/mobile/src/app-root/AppRoot.tsx`
  - owns app providers
  - loads shared fonts
  - hosts `NavigationContainer`
  - syncs `StatusBar` style from `routeChrome`

- `apps/mobile/src/app/navigation/*`
  - owns typed routes, deep link mapping, route chrome policy, React Navigation stack/tabs, flow state, and route adapters
  - replaces the legacy `activeScreen` router and old `app-root/navigation.ts`

### Migration Note

The main shell header/footer is route-level now. Detail screen titles and detail header actions are also route-level through `routeChrome`, `detailHeaderChrome.tsx`, and `navigationAdapters.tsx`. Feature screens in `sub` depth should render content only and should not render their own normal `AppHeader`.

### Existing Shared Chrome Components

- `apps/mobile/src/shared/ui/AppHeader.tsx`
  - brand header when no `onBack` is passed
  - centered detail header when `onBack` or `leftSlot` is passed

- `apps/mobile/src/shared/ui/AppFooter.tsx`
  - custom visual bottom tab bar
  - supports `home`, `capture`, and `custom`

- `apps/mobile/src/shared/ui/AppScreen.tsx`
  - reusable safe-area-aware content wrapper
  - supports `standalone`, `belowShellHeader`, `safeArea`, and `none` top padding modes

## Target Structure

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
      navigationAdapters.tsx
      navigation.test.ts
      mainTabChrome.test.ts
  shared/
    ui/
      AppHeader.tsx
      AppFooter.tsx
      AppScreen.tsx
```

### Responsibility Split

| File | Responsibility |
| --- | --- |
| `AppRoot.tsx` | App providers only: fonts, Tamagui, safe area, status bar host, navigation container. |
| `RootNavigator.tsx` | Root stack routes: auth, onboarding, main tabs, detail routes, fullscreen routes. |
| `MainTabNavigator.tsx` | Bottom tab routes: home, product recommendation, hidden my page route, and footer capture action. |
| `routeTypes.ts` | Typed route names and route params. |
| `linkingConfig.ts` | App deep link scheme, URL prefixes, route path mapping, and route coverage helpers. |
| `routeChrome.ts` | Single source of truth for header/footer/fullscreen policy and header copy. |
| `mainTabChrome.ts` | Main tab header copy and footer target helpers. |
| `detailHeaderChrome.tsx` | Detail route `AppHeader` renderer and route-level share/close/done action slots. |
| `navigationState.ts` | Active nested route and status bar style helpers. |
| `flowState.tsx` | Temporary flow state that should not be passed through navigation params. |
| `navigationAdapters.tsx` | Thin adapters that pass navigation callbacks into existing screen components during migration. |
| `navigation.test.ts` | Pure tests for route mapping, chrome policy, status bar policy, and footer tab mapping. |

## Route Model

Use typed route names instead of string screen state.

```ts
import type {NavigatorScreenParams} from '@react-navigation/native';

export type ARFilterBackRouteName =
  | 'ARFilter'
  | 'ImageAnalysisReportDetail';

export type RootStackParamList = {
  Login: undefined;
  Tutorial: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FaceCapture: undefined;
  ImageAnalysisLoading: undefined;
  ImageAnalysisReportsList: undefined;
  ImageAnalysisReportDetail: {reportId?: string} | undefined;
  ProfileEdit: undefined;
  MakeupStyleList: undefined;
  LikedProductList: undefined;
  ARFilter: undefined;
  ARFilterLocationAdjust: {backRoute?: ARFilterBackRouteName} | undefined;
  ARFilterStyleAdjust: {backRoute?: ARFilterBackRouteName} | undefined;
  MakeupFeedbackEntry: undefined;
  MakeupFeedbackCapture: undefined;
  MakeupFeedbackLoading: undefined;
  MakeupFeedbackResult: undefined;
  MakeupCorrectionGuide: undefined;
  MakeupCorrectionTip: {pointId: string};
  ReferenceMakeupExtractionUpload: undefined;
  ReferenceMakeupExtractionLoading: undefined;
  ReferenceMakeupExtractionResult: undefined;
  ExtractedMakeupStyleAdjust: undefined;
  ExtractedMakeupStyleSaveForm: undefined;
  ExtractedMakeupStyleSaveComplete: undefined;
  ExtractedMakeupStyleRecipeDetail: undefined;
  ExtractedMakeupStyleRecipeSaveComplete: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  CustomTab: undefined;
  ProfileTab: undefined;
};

export type RootStackRouteName = keyof RootStackParamList;
export type MainTabRouteName = keyof MainTabParamList;
export type RouteName = RootStackRouteName | MainTabRouteName;
```

### Navigation Params Rule

Only pass serializable route params.

Allowed:

- ids
- route names
- small strings
- booleans

Not allowed:

- `ImageSourcePropType`
- callback functions
- full feedback result objects
- selected mock objects

Use `flowState.tsx` for non-serializable or flow-local values.

## Route Chrome Policy

Replace the current `screenChromeByScreen` with route-level config.

```ts
export type ScreenDepth = 'entry' | 'main' | 'sub' | 'immersive' | 'terminal';

export type ScreenCategory =
  | 'auth'
  | 'onboarding'
  | 'main-home'
  | 'main-recommendation'
  | 'main-profile'
  | 'feature-entry'
  | 'list'
  | 'detail-report'
  | 'form-edit'
  | 'progress'
  | 'capture-runtime'
  | 'ar-runtime'
  | 'completion'
  | 'navigation-host';

export type RouteChromeKind = 'mainTab' | 'detail' | 'fullscreen';
export type DetailHeaderRightAction = 'share' | 'close' | 'done';

type RouteChromeBase = {
  category: ScreenCategory;
  depth: ScreenDepth;
};

export type RouteChrome =
  | (RouteChromeBase & {
      kind: 'mainTab';
      headerVariant: 'home' | 'custom' | 'default';
      footerTab?: 'home' | 'custom';
      statusBarStyle: 'dark';
    })
  | (RouteChromeBase & {
      kind: 'detail';
      title: string;
      rightActions?: readonly DetailHeaderRightAction[];
      statusBarStyle: 'dark';
    })
  | (RouteChromeBase & {
      kind: 'fullscreen';
      statusBarStyle: 'dark' | 'light';
    });
```

### Main Tab Routes

| Route | Screen | Header | Footer |
| --- | --- | --- | --- |
| `HomeTab` | `HomeScreen` | brand header with `AuraLogo` | active `home` |
| `CustomTab` | `ProductRecommendationScreen` | product recommendation header | active `custom` |
| `ProfileTab` | `MyPageScreen` | default brand header | footer visible, no active footer item |

### Capture Action

The footer `capture` item should behave as an action, not a persistent tab route. Do not add `CaptureTab` to `MainTabParamList`.

When the user presses the capture tab button:

```ts
navigation.getParent()?.navigate('ARFilter');
```

The footer can still render the camera button visually, but the current tab remains whichever content tab was active before capture.

### Detail Routes

| Route | Header Title | Source Screen |
| --- | --- | --- |
| `ImageAnalysisLoading` | `얼굴 분석` | `ImageAnalysisLoadingScreen` |
| `ProfileEdit` | `프로필 수정` | `ProfileEditScreen` |
| `ImageAnalysisReportsList` | `이미지 분석 결과` | `ImageAnalysisReportsListScreen` |
| `ImageAnalysisReportDetail` | `맞춤 분석 보고서` with share/close actions | `ImageAnalysisReportDetailScreen` |
| `MakeupStyleList` | `메이크업 스타일` | `MakeupStyleListScreen` |
| `LikedProductList` | `좋아요 목록` | `LikedProductListScreen` |
| `MakeupFeedbackEntry` | `메이크업 피드백` with close action | `MakeupFeedbackEntryScreen` |
| `MakeupFeedbackLoading` | `메이크업 피드백` | `MakeupFeedbackLoadingScreen` |
| `MakeupFeedbackResult` | `메이크업 피드백` | `MakeupFeedbackResultScreen` |
| `MakeupCorrectionTip` | `수정팁` | `MakeupCorrectionTipScreen` |
| `MakeupCorrectionGuide` | `가이드 오버레이` | `MakeupCorrectionGuideOverlayScreen` |
| `ReferenceMakeupExtractionUpload` | `메이크업 추출` with close action | `ReferenceMakeupExtractionUploadScreen` |
| `ReferenceMakeupExtractionResult` | `분석 결과` | `ReferenceMakeupExtractionResultScreen` |
| `ExtractedMakeupStyleSaveForm` | `메이크업 스타일 저장` with save action | `ExtractedMakeupStyleSaveFormScreen` |
| `ExtractedMakeupStyleRecipeDetail` | `상세 분석` | `ExtractedMakeupStyleRecipeDetailScreen` |

### Fullscreen Routes

| Route | Reason |
| --- | --- |
| `Login` | entry/auth surface |
| `Tutorial` | onboarding surface |
| `FaceCapture` | camera-like capture experience |
| `ARFilter` | AR/camera surface |
| `ARFilterLocationAdjust` | AR adjustment surface |
| `ARFilterStyleAdjust` | AR adjustment surface |
| `MakeupFeedbackCapture` | camera/photo picker surface |
| `ReferenceMakeupExtractionLoading` | focused progress screen |
| `ExtractedMakeupStyleAdjust` | try-on surface |
| `ExtractedMakeupStyleSaveComplete` | completion surface |
| `ExtractedMakeupStyleRecipeSaveComplete` | completion surface |

## Header Design Standard

### Brand Header

Used only for main app surfaces.

Required:

- left side: title area or `AuraLogo`
- right side: profile button
- subtitle copy comes from route chrome config
- no back button

Examples:

- `HomeTab`
- `CustomTab`
- `ProfileTab`

### Detail Header

Used for routes that are one level below a main surface.

Required:

- left side: back button by default
- center: one-line route title
- right side: empty balancing slot unless route config defines `rightActions`
- close-only routes may use an empty left balancing slot and a right close button
- no feature-local duplicate header

Examples:

- `ProfileEdit`
- `LikedProductList`
- `MakeupCorrectionTip`
- `ExtractedMakeupStyleSaveForm`

### Fullscreen Header

Do not use `AppHeader`.

Fullscreen routes may use local overlay controls when the UI is camera-like, AR-like, loading-focused, or completion-focused.

Allowed local controls:

- close button over camera/AR
- compact back button inside a loading screen
- completion action buttons at the bottom

Not allowed:

- duplicating the default detail header inside fullscreen routes
- using text characters as icons
- adding another icon library

## Footer Design Standard

Only `MainTabNavigator` renders `AppFooter`.

Rules:

- Footer is hidden on all root stack detail and fullscreen routes.
- Footer uses existing `AppFooter`.
- `home` tab maps to `HomeTab`.
- `custom` tab maps to `CustomTab`.
- `capture` tab navigates to `ARFilter` as an action.
- Do not render `AppFooter` inside feature screens.

## Flow State Model

Create `apps/mobile/src/app/navigation/flowState.tsx`.

It should hold only values that cannot safely be route params:

```ts
type NavigationFlowState = {
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  savedMakeupStyle: MakeupStylePreview | null;
  makeupFeedbackResult: MakeupFeedbackResult | null;
};
```

Expose a hook:

```ts
export function useNavigationFlowState(): NavigationFlowStateContextValue;
```

Keep business logic inside feature services. This provider only carries cross-route UI flow state.

## Implementation Tasks

### Task 1: Add React Navigation Dependencies

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/package-lock.json`

- [x] **Step 1: Install navigation packages**

Run:

```bash
npm --prefix apps/mobile install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx --prefix apps/mobile expo install react-native-screens
```

Expected:

- `apps/mobile/package.json` includes React Navigation packages.
- `apps/mobile/package-lock.json` updates.
- No Tamagui replacement or extra UI library is added.
- Do not add `react-native-gesture-handler` unless a later navigator requires it.
- `react-native-safe-area-context` is already installed and should not be duplicated manually.

- [x] **Step 2: Verify dependency tree**

Run:

```bash
npm --prefix apps/mobile ls @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
```

Expected:

- Command exits `0`.
- Installed versions are printed.

- [x] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "chore: React Navigation 의존성 추가"
```

### Task 2: Create Typed Route And Chrome Config

**Files:**

- Create: `apps/mobile/src/app/navigation/routeTypes.ts`
- Create: `apps/mobile/src/app/navigation/routeChrome.ts`
- Create: `apps/mobile/src/app/navigation/navigation.test.ts`

- [x] **Step 1: Move route names into `routeTypes.ts`**

Create route types matching the route model above.

- [x] **Step 2: Add route chrome config**

Create `routeChromeByRoute` with one entry for every `RootStackRouteName` and every `MainTabRouteName`.

The config must satisfy:

```ts
export const routeChromeByRoute = {
  Login: {
    category: 'auth',
    depth: 'entry',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  Tutorial: {
    category: 'onboarding',
    depth: 'entry',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MainTabs: {
    category: 'navigation-host',
    depth: 'main',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  FaceCapture: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  ImageAnalysisLoading: {
    category: 'progress',
    depth: 'sub',
    kind: 'detail',
    title: '얼굴 분석',
    statusBarStyle: 'dark',
  },
  ARFilter: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  MakeupFeedbackEntry: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    title: '메이크업 피드백',
    rightActions: ['close'],
    statusBarStyle: 'dark',
  },
  MakeupFeedbackLoading: {
    category: 'progress',
    depth: 'sub',
    kind: 'detail',
    title: '메이크업 피드백',
    statusBarStyle: 'dark',
  },
  HomeTab: {
    category: 'main-home',
    depth: 'main',
    kind: 'mainTab',
    headerVariant: 'home',
    footerTab: 'home',
    statusBarStyle: 'dark',
  },
  CustomTab: {
    category: 'main-recommendation',
    depth: 'main',
    kind: 'mainTab',
    headerVariant: 'custom',
    footerTab: 'custom',
    statusBarStyle: 'dark',
  },
  ProfileTab: {
    category: 'main-profile',
    depth: 'main',
    kind: 'mainTab',
    headerVariant: 'default',
    statusBarStyle: 'dark',
  },
} satisfies Record<RouteName, RouteChrome>;
```

Complete every missing route explicitly. The TypeScript `satisfies Record<RouteName, RouteChrome>` check should fail until all route names are covered.

- [x] **Step 3: Add pure tests**

`navigation.test.ts` should assert:

```ts
expectEqual(getRouteChrome('HomeTab').kind, 'mainTab', 'home tab chrome');
expectEqual(getRouteChrome('HomeTab').depth, 'main', 'home tab depth');
expectEqual(getRouteChrome('ProfileEdit').kind, 'detail', 'profile edit chrome');
expectEqual(getRouteChrome('ProfileEdit').category, 'form-edit', 'profile edit category');
expectEqual(getRouteChrome('MakeupFeedbackLoading').kind, 'detail', 'makeup feedback loading chrome');
expectEqual(getRouteChrome('MakeupFeedbackLoading').category, 'progress', 'makeup feedback loading category');
expectEqual(getRouteChrome('ARFilter').kind, 'fullscreen', 'AR chrome');
expectEqual(getRouteChrome('ARFilter').depth, 'immersive', 'AR depth');
expectEqual(getFooterTargetRoute('capture'), 'ARFilter', 'capture footer action');
```

- [x] **Step 4: Run scoped typecheck**

Run:

```bash
apps/mobile/node_modules/.bin/tsc --ignoreConfig --noEmit --pretty false --skipLibCheck true --target es2020 --module esnext --moduleResolution bundler --jsx react-jsx --allowSyntheticDefaultImports true --esModuleInterop true apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app/navigation/routeChrome.ts apps/mobile/src/app/navigation/navigation.test.ts
```

Expected:

- Command exits `0`.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app/navigation/routeChrome.ts apps/mobile/src/app/navigation/navigation.test.ts
git commit -m "refactor: 모바일 라우트 chrome 설정 추가"
```

### Task 3: Add Navigation Flow State Provider

**Files:**

- Create: `apps/mobile/src/app/navigation/flowState.tsx`
- Create: `apps/mobile/src/app/navigation/flowState.test.tsx`
- Modify: `apps/mobile/src/app-root/AppRoot.tsx`

- [x] **Step 1: Create provider**

`flowState.tsx` should export:

```ts
export function NavigationFlowStateProvider({children}: {children: React.ReactNode}) {
  return <NavigationFlowStateContext.Provider value={value}>{children}</NavigationFlowStateContext.Provider>;
}

export function useNavigationFlowState() {
  const context = useContext(NavigationFlowStateContext);

  if (!context) {
    throw new Error('useNavigationFlowState must be used inside NavigationFlowStateProvider');
  }

  return context;
}
```

The value should include the current flow values and setter functions currently owned by `AppRoot.tsx`.

- [x] **Step 2: Wrap the app root**

In `AppRoot.tsx`, wrap the navigator area with `NavigationFlowStateProvider` after fonts are loaded.

- [x] **Step 3: Add provider guard test**

`flowState.test.tsx` should validate the hook error message string through an exported pure helper:

```ts
expectEqual(
  getNavigationFlowStateProviderErrorMessage(),
  'useNavigationFlowState must be used inside NavigationFlowStateProvider',
  'flow state provider guard message',
);
```

- [x] **Step 4: Commit**

```bash
git add apps/mobile/src/app/navigation/flowState.tsx apps/mobile/src/app/navigation/flowState.test.tsx apps/mobile/src/app-root/AppRoot.tsx
git commit -m "refactor: 모바일 내비게이션 흐름 상태 분리"
```

### Task 4: Create Root Navigator And Main Tab Navigator

**Files:**

- Create: `apps/mobile/src/app/navigation/RootNavigator.tsx`
- Create: `apps/mobile/src/app/navigation/MainTabNavigator.tsx`
- Create: `apps/mobile/src/app/navigation/navigationAdapters.tsx`
- Modify: `apps/mobile/src/app-root/AppRoot.tsx`

- [x] **Step 1: Create `RootNavigator`**

`RootNavigator` should use:

```ts
import {createNativeStackNavigator} from '@react-navigation/native-stack';
```

All root stack screens should set `headerShown: false` at the navigator level. Visual headers come from route chrome wrappers, not React Navigation default headers.

- [x] **Step 2: Create `MainTabNavigator`**

`MainTabNavigator` should use:

```ts
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
```

Use the existing `AppFooter` as a custom tab bar. The adapter must map React Navigation tab state to `FooterTabKey`.

Rules:

- `HomeTab` maps to active footer tab `home`.
- `CustomTab` maps to active footer tab `custom`.
- `ProfileTab` is a hidden tab route reached from the header profile button; render the footer with no active tab.
- Footer item `capture` calls `navigation.getParent()?.navigate('ARFilter')` and does not correspond to a tab route.

- [x] **Step 3: Add adapters for existing screens**

Create thin adapter components that keep feature screens mostly unchanged during migration.

Example:

```tsx
function HomeRouteScreen({navigation}: HomeRouteScreenProps) {
  return (
    <MainTabChrome routeName="HomeTab">
      <HomeScreen
        onPressARFilter={() => navigation.getParent()?.navigate('ARFilter')}
        onPressReferenceMakeupExtraction={() => navigation.getParent()?.navigate('ReferenceMakeupExtractionUpload')}
        onPressFaceDiagnosis={() => navigation.getParent()?.navigate('Tutorial')}
        onPressMakeupFeedback={() => navigation.getParent()?.navigate('MakeupFeedbackEntry')}
        onPressProductRecommendations={() => navigation.navigate('CustomTab')}
      />
    </MainTabChrome>
  );
}
```

- [x] **Step 4: Replace `activeScreen` routing**

`AppRoot.tsx` should render:

```tsx
<NavigationFlowStateProvider>
  <NavigationContainer>
    <RootNavigator />
  </NavigationContainer>
</NavigationFlowStateProvider>
```

The old `activeScreen`, `renderScreen()`, and local `AppShell` should be removed after all route adapters are connected.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/navigation/RootNavigator.tsx apps/mobile/src/app/navigation/MainTabNavigator.tsx apps/mobile/src/app/navigation/navigationAdapters.tsx apps/mobile/src/app-root/AppRoot.tsx
git commit -m "refactor: 모바일 화면 전환을 React Navigation으로 변경"
```

### Task 5: Centralize Detail Header Policy

**Files:**

- Modify: `apps/mobile/src/features/profile/screens/ProfileEditScreen.tsx`
- Modify: `apps/mobile/src/features/image-analysis/screens/ImageAnalysisLoadingScreen.tsx`
- Modify: `apps/mobile/src/features/image-analysis/screens/ImageAnalysisReportsListScreen.tsx`
- Modify: `apps/mobile/src/features/image-analysis/screens/ImageAnalysisReportDetailScreen.tsx`
- Modify: `apps/mobile/src/features/recommendation/screens/MakeupStyleListScreen.tsx`
- Modify: `apps/mobile/src/features/recommendation/screens/LikedProductListScreen.tsx`
- Modify: `apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionUploadScreen.tsx`
- Modify: `apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionResultScreen.tsx`
- Modify: `apps/mobile/src/features/reference-makeup-extraction/screens/ExtractedMakeupStyleSaveFormScreen.tsx`
- Modify: `apps/mobile/src/features/reference-makeup-extraction/screens/ExtractedMakeupStyleRecipeDetailScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackEntryScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackLoadingScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackResultScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-feedback/screens/MakeupCorrectionTipScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-feedback/screens/MakeupCorrectionGuideOverlayScreen.tsx`

- [x] **Step 1: Inject detail titles from `routeChrome`**

Route adapters should pass `getDetailRouteTitle(routeName)` into detail screens so production header titles come from `routeChrome`.

- [ ] **Step 2: Remove screen-local `AppHeader` imports**

Each detail screen can later become content-only. Route adapters or navigator options should provide the visual header.

- [ ] **Step 3: Normalize `AppScreen` padding**

Detail route content should use:

```tsx
<AppScreen topPadding="belowShellHeader">
  {children}
</AppScreen>
```

If a detail screen already owns scroll behavior, use `scroll={false}` and keep the inner scroll view.

- [ ] **Step 4: Preserve special actions**

`ImageAnalysisReportDetailScreen` currently has share and close actions. Move those actions into route-level `rightSlot` config or a route-specific chrome adapter. Do not remove the actions.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features apps/mobile/src/app/navigation
git commit -m "refactor: 상세 화면 헤더를 라우트 chrome으로 이동"
```

### Task 6: Keep Fullscreen Screens Intentionally Fullscreen

**Files:**

- Modify: `apps/mobile/src/app/navigation/routeChrome.ts`
- Modify: `apps/mobile/src/features/face-capture/screens/FaceCaptureScreen.tsx`
- Modify: `apps/mobile/src/features/ar/screens/ARFilterScreen.tsx`
- Modify: `apps/mobile/src/features/ar/screens/ARFilterLocationAdjustScreen.tsx`
- Modify: `apps/mobile/src/features/ar/screens/ARFilterStyleAdjustScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackCaptureScreen.tsx`
- Modify: `apps/mobile/src/features/reference-makeup-extraction/screens/ExtractedMakeupStyleAdjustScreen.tsx`

- [x] **Step 1: Verify fullscreen routes**

Every fullscreen route should have `kind: 'fullscreen'` in `routeChrome.ts`.

- [x] **Step 2: Preserve overlay controls**

Keep local close/back controls only where they are part of camera, AR, loading, or completion UI.

- [x] **Step 3: Normalize status bar style**

Use route chrome status bar values:

```ts
FaceCapture: {kind: 'fullscreen', statusBarStyle: 'light'}
MakeupFeedbackCapture: {kind: 'fullscreen', statusBarStyle: 'light'}
ARFilter: {kind: 'fullscreen', statusBarStyle: 'light'}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/navigation apps/mobile/src/features/face-capture apps/mobile/src/features/ar apps/mobile/src/features/makeup-feedback apps/mobile/src/features/reference-makeup-extraction
git commit -m "refactor: 풀스크린 화면 chrome 정책 정리"
```

### Task 7: Remove Legacy AppRoot Navigation Helpers

**Files:**

- Modify: `apps/mobile/src/app-root/AppRoot.tsx`
- Delete: `apps/mobile/src/app-root/navigation.ts`
- Delete: `apps/mobile/src/app-root/navigation.test.ts`

- [x] **Step 1: Delete obsolete state router helpers**

Remove helpers that only existed for the old `activeScreen` router after every route uses React Navigation.

- [x] **Step 2: Keep or move pure constants**

If a helper is still useful, move it to `apps/mobile/src/app/navigation/routeChrome.ts` or `apps/mobile/src/app/navigation/navigationAdapters.tsx`.

- [x] **Step 3: Delete obsolete tests**

Remove tests that validate old `AppScreenKey` behavior. Keep route chrome tests.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app-root apps/mobile/src/app/navigation
git commit -m "refactor: 기존 activeScreen 라우터 제거"
```

## Verification Checklist

Run these checks after the full migration:

```bash
npm --prefix apps/mobile run typecheck
```

Expected:

- exits `0`
- no TypeScript errors

Run the app:

```bash
npm --prefix apps/mobile run ios
```

Manual demo path:

```text
Login
→ Tutorial
→ HomeTab
→ FaceCapture or ARFilter
→ ImageAnalysisLoading
→ ImageAnalysisReportDetail
→ ReferenceMakeupExtractionUpload
→ ReferenceMakeupExtractionResult
→ ExtractedMakeupStyleAdjust
→ ExtractedMakeupStyleSaveComplete
→ ProfileTab
→ ProfileEdit
```

Visual checks:

- Every route has a documented depth and functional category.
- `routeChrome.ts` matches the Current Screen Inventory table.
- Main tab routes show brand header and footer.
- Detail routes show one shared detail header.
- Fullscreen routes do not show the shared header or footer.
- Back buttons return through navigation history.
- Footer capture button opens the AR/capture flow without changing the active content tab permanently.
- Text does not overlap header/footer on 402 x 874.

## Commit Order

Use these commit messages unless a task scope changes:

```text
chore: React Navigation 의존성 추가
refactor: 모바일 라우트 chrome 설정 추가
refactor: 모바일 내비게이션 흐름 상태 분리
refactor: 모바일 화면 전환을 React Navigation으로 변경
refactor: 상세 화면 헤더를 라우트 chrome으로 이동
refactor: 풀스크린 화면 chrome 정책 정리
refactor: 기존 activeScreen 라우터 제거
```

## Non-Goals

- Do not implement backend APIs.
- Do not implement Unity, ARKit, or ARCore.
- Do not replace Tamagui.
- Do not replace `AppHeader`, `AppFooter`, or shared theme tokens.
- Do not redesign feature screen content while migrating navigation.
- Do not pass non-serializable objects through React Navigation params.

## Acceptance Criteria

- `AppRoot.tsx` no longer owns `activeScreen` route switching.
- React Navigation owns root stack and main tabs.
- `routeChrome.ts` is the single source of truth for route depth, category, and chrome policy.
- Feature screens do not duplicate normal detail headers.
- `AppFooter` is rendered only by the tab navigator.
- Current demo flow remains reachable.
- TypeScript verification passes.
