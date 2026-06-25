# Mobile Navigation And Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `activeScreen` state router with React Navigation and make header/footer behavior consistent across the mobile app.

**Architecture:** React Navigation owns route state, back behavior, and tab selection. Existing visual components (`AppHeader`, `AppFooter`, `AppScreen`) remain the design system surfaces, while a central route chrome config decides whether each route shows a main tab shell, a detail header, or a fullscreen layout.

**Tech Stack:** React Native, Expo, TypeScript, React Navigation, Tamagui, existing shared theme/UI tokens.

---

## Why This Work Exists

The app currently switches screens from `apps/mobile/src/app-root/AppRoot.tsx` with local `activeScreen` state. That worked for the prototype, but the app now has main tabs, nested detail screens, fullscreen camera/AR flows, feedback flows, filter extraction flows, and saved-result flows.

Without React Navigation, every new screen needs manual decisions for:

- where back navigation goes
- whether the footer is visible
- whether the header is brand, detail, custom, or hidden
- where selected flow data is stored
- how a screen is deep-linked or revisited

This migration moves those decisions into navigation and chrome config files instead of scattering them across feature screens.

## Screen Classification System

Before choosing a header, footer, or layout wrapper, classify each screen by depth and function. This classification is the design contract for the app.

### Depth Levels

| Depth | Meaning | Header | Footer | Examples |
| --- | --- | --- | --- | --- |
| `entry` | outside the signed-in app frame | none or bespoke onboarding header | hidden | `Login`, `Tutorial` |
| `main` | top-level app surface | brand header | visible | `HomeTab`, `CustomTab`, `MyPageTab` |
| `sub` | one step below a main surface | detail header | hidden | `ProfileEdit`, `LikedProductList`, `FeedbackResult` |
| `immersive` | camera, AR, try-on, or capture runtime | local overlay controls only | hidden | `FaceCapture`, `ARMakeupFilter`, `FeedbackCapture` |
| `terminal` | completion/confirmation result | no app header, bottom actions | hidden | `FilterSaved`, `RecipeSaved` |

### Functional Categories

| Category | Purpose | Layout Rules |
| --- | --- | --- |
| `auth` | login or account entry | centered brand/content, no app footer |
| `onboarding` | first-run education | immersive copy, primary CTA, no app footer |
| `main-home` | home dashboard | brand header, footer, section stacks |
| `main-recommendation` | product recommendation hub | brand/product header, footer, reusable content sections |
| `main-profile` | user hub | brand header, footer visible with no active footer item |
| `feature-entry` | starts a feature flow | detail header or close header, one primary action |
| `list` | saved/list/index screen | detail header, grid/list, empty state if needed |
| `detail-report` | analysis/report/read-only result | detail header, scroll content, route-level actions if needed |
| `form-edit` | user editing or save form | detail header, right save/done action when needed |
| `progress` | loading/analysis progress | detail header if user can go back, fullscreen only for immersive flows |
| `capture-runtime` | camera/photo acquisition | fullscreen, overlay close/back controls |
| `ar-runtime` | AR or try-on runtime | fullscreen, overlay controls |
| `completion` | saved/done confirmation | centered icon/title/copy, bottom actions |
| `navigation-host` | navigator container route | no visible UI of its own |

### Current Screen Inventory

Use this table as the starting point for `routeChrome.ts`. If a screen is added later, add it here first, then implement the route.

| Route | Depth | Category | Chrome | Design Notes |
| --- | --- | --- | --- | --- |
| `Login` | `entry` | `auth` | fullscreen | Keep auth-specific layout; no app header/footer. |
| `Tutorial` | `entry` | `onboarding` | fullscreen | Keep onboarding-specific layout; no app footer. |
| `MainTabs` | `main` | `navigation-host` | fullscreen host | Does not render visible UI directly. |
| `HomeTab` | `main` | `main-home` | brand header + footer | `AuraLogo` header, active footer `home`. |
| `CustomTab` | `main` | `main-recommendation` | brand header + footer | Product recommendation copy, active footer `custom`. |
| `MyPageTab` | `main` | `main-profile` | brand header + footer | Footer visible with no active footer item. |
| `FaceCapture` | `immersive` | `capture-runtime` | fullscreen | Camera-like close/capture overlay only. |
| `ImageAnalysisLoading` | `sub` | `progress` | detail header | Current code uses `AppHeader` title `얼굴 분석`. |
| `ImageAnalysisReportsList` | `sub` | `list` | detail header | Grid/list index screen. |
| `ImageAnalysisReportDetail` | `sub` | `detail-report` | detail header with actions | Preserve share and close actions. |
| `ProfileEdit` | `sub` | `form-edit` | detail header | Profile form; logout remains screen content action. |
| `MakeupStyleList` | `sub` | `list` | detail header | Saved makeup looks grid. |
| `LikedProductList` | `sub` | `list` | detail header | Liked product grid. |
| `ARMakeupFilter` | `immersive` | `ar-runtime` | fullscreen | AR/camera runtime. |
| `ARFilterLocation` | `immersive` | `ar-runtime` | fullscreen | AR adjustment runtime. |
| `ARFilterStyle` | `immersive` | `ar-runtime` | fullscreen | AR adjustment runtime. |
| `FeedbackEntry` | `sub` | `feature-entry` | detail header with close action | Current code uses `AppHeader` title `메이크업 피드백`. |
| `FeedbackCapture` | `immersive` | `capture-runtime` | fullscreen | Camera/gallery acquisition. |
| `FeedbackLoading` | `sub` | `progress` | detail header | Current code uses `AppHeader` title `메이크업 피드백`. |
| `FeedbackResult` | `sub` | `detail-report` | detail header | Feedback report result. |
| `FeedbackGuide` | `sub` | `detail-report` | detail header | Feedback guide overlay explanation. |
| `FeedbackTip` | `sub` | `detail-report` | detail header | One selected feedback point. |
| `FilterUpload` | `sub` | `feature-entry` | detail header with close action | Current code title is `메이크업 추출`; tab row stays in screen content. |
| `FilterLoading` | `immersive` | `progress` | fullscreen | Current code uses local compact back affordance. |
| `FilterResult` | `sub` | `detail-report` | detail header | Extracted makeup analysis. |
| `FilterTryOn` | `immersive` | `ar-runtime` | fullscreen | Try-on editor/runtime. |
| `FilterSave` | `sub` | `form-edit` | detail header with save action | Preserve right `완료` action. |
| `FilterSaved` | `terminal` | `completion` | fullscreen | Saved confirmation with bottom actions. |
| `FilterRecipeDetail` | `sub` | `detail-report` | detail header | Current code title is `상세 분석`; tab row stays in content. |
| `RecipeSaved` | `terminal` | `completion` | fullscreen | Recipe saved confirmation with bottom actions. |

### Design Contract By Classification

- `main` screens use the shared brand header and footer. They do not render `AppHeader` or `AppFooter` inside feature screens.
- `sub` screens use one route-level detail header. Feature screens should not render their own normal `AppHeader` after migration.
- `immersive` screens do not use route-level `AppHeader`; they may keep local overlay buttons that belong to the camera/AR experience.
- `terminal` screens do not show a header or footer; primary/secondary actions live in the bottom action area.
- `progress` screens are not automatically fullscreen. If the user should be able to back out through normal navigation, use a detail header.
- If a new screen does not fit one of these categories, add the category to this document before implementing the screen.

## Current State

### Existing Router

- `apps/mobile/src/app-root/AppRoot.tsx`
  - owns app providers
  - owns screen state with `activeScreen`
  - owns transient flow state such as selected feedback photo, selected filter photo, feedback result, selected report id, and AR adjustment back target
  - renders screens with a long `renderScreen()` branch
  - contains a local `AppShell` that currently means "main tab shell"

- `apps/mobile/src/app-root/navigation.ts`
  - owns pure routing helpers
  - owns `appScreens`
  - owns `screenChromeByScreen`
  - currently transitional; classify screens from actual screen structure and the inventory above, not from this map alone

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
      routeChrome.ts
      flowState.tsx
      navigationAdapters.tsx
      navigation.test.ts
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
| `routeChrome.ts` | Single source of truth for header/footer/fullscreen policy and header copy. |
| `flowState.tsx` | Temporary flow state that should not be passed through navigation params. |
| `navigationAdapters.tsx` | Thin adapters that pass navigation callbacks into existing screen components during migration. |
| `navigation.test.ts` | Pure tests for route mapping, chrome policy, header copy, and footer tab mapping. |

## Route Model

Use typed route names instead of string screen state.

```ts
export type RootStackParamList = {
  Login: undefined;
  Tutorial: undefined;
  MainTabs: undefined;
  FaceCapture: undefined;
  ImageAnalysisLoading: undefined;
  ImageAnalysisReportsList: undefined;
  ImageAnalysisReportDetail: {reportId?: string} | undefined;
  ProfileEdit: undefined;
  MakeupStyleList: undefined;
  LikedProductList: undefined;
  ARMakeupFilter: undefined;
  ARFilterLocation: {backRoute?: RootStackRouteName} | undefined;
  ARFilterStyle: {backRoute?: RootStackRouteName} | undefined;
  FeedbackEntry: undefined;
  FeedbackCapture: undefined;
  FeedbackLoading: undefined;
  FeedbackResult: undefined;
  FeedbackGuide: undefined;
  FeedbackTip: {pointId: string};
  FilterUpload: undefined;
  FilterLoading: undefined;
  FilterResult: undefined;
  FilterTryOn: undefined;
  FilterSave: undefined;
  FilterSaved: undefined;
  FilterRecipeDetail: undefined;
  RecipeSaved: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  CustomTab: undefined;
  MyPageTab: undefined;
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
      rightAction?: 'close' | 'profile' | 'custom';
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
| `MyPageTab` | `MyPageScreen` | default brand header | footer visible, no active footer item |

### Capture Action

The footer `capture` item should behave as an action, not a persistent tab route. Do not add `CaptureTab` to `MainTabParamList`.

When the user presses the capture tab button:

```ts
navigation.getParent()?.navigate('ARMakeupFilter');
```

The footer can still render the camera button visually, but the current tab remains whichever content tab was active before capture.

### Detail Routes

| Route | Header Title | Source Screen |
| --- | --- | --- |
| `ImageAnalysisLoading` | `얼굴 분석` | `ImageAnalysisLoadingScreen` |
| `ProfileEdit` | `프로필 수정` | `ProfileEditScreen` |
| `ImageAnalysisReportsList` | `이미지 분석 결과` | `ImageAnalysisReportsListScreen` |
| `ImageAnalysisReportDetail` | screen-level action header with share/close actions | `ImageAnalysisReportDetailScreen` |
| `MakeupStyleList` | `메이크업 룩` | `MakeupStyleListScreen` |
| `LikedProductList` | `좋아요 목록` | `LikedProductListScreen` |
| `FeedbackEntry` | `메이크업 피드백` with close action | `FeedbackEntryScreen` |
| `FeedbackLoading` | `메이크업 피드백` | `FeedbackLoadingScreen` |
| `FeedbackResult` | `메이크업 피드백` | `MakeupFeedbackScreen` |
| `FeedbackTip` | `수정팁` | `FeedbackTipScreen` |
| `FeedbackGuide` | `가이드 오버레이` | `FeedbackGuideOverlayScreen` |
| `FilterUpload` | `메이크업 추출` with close action | `FilterImageUploadScreen` |
| `FilterResult` | `분석 결과` | `FilterExtractionResultScreen` |
| `FilterSave` | `필터 저장` with save action | `FilterSaveScreen` |
| `FilterRecipeDetail` | `상세 분석` | `FilterRecipeDetailScreen` |

### Fullscreen Routes

| Route | Reason |
| --- | --- |
| `Login` | entry/auth surface |
| `Tutorial` | onboarding surface |
| `FaceCapture` | camera-like capture experience |
| `ARMakeupFilter` | AR/camera surface |
| `ARFilterLocation` | AR adjustment surface |
| `ARFilterStyle` | AR adjustment surface |
| `FeedbackCapture` | camera/photo picker surface |
| `FilterLoading` | focused progress screen |
| `FilterTryOn` | try-on surface |
| `FilterSaved` | completion surface |
| `RecipeSaved` | completion surface |

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
- `MyPageTab`

### Detail Header

Used for routes that are one level below a main surface.

Required:

- left side: back button by default
- center: one-line route title
- right side: empty balancing slot unless route config defines `rightAction`
- close-only routes may use an empty left balancing slot and a right close button
- no feature-local duplicate header

Examples:

- `ProfileEdit`
- `LikedProductList`
- `FeedbackTip`
- `FilterSave`

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
- `capture` tab navigates to `ARMakeupFilter` as an action.
- Do not render `AppFooter` inside feature screens.

## Flow State Model

Create `apps/mobile/src/app/navigation/flowState.tsx`.

It should hold only values that cannot safely be route params:

```ts
type NavigationFlowState = {
  selectedFeedbackPhoto: FeedbackPhotoSelection;
  selectedFilterPhoto: FilterExtractionPhoto | null;
  savedMakeupStyle: MakeupStylePreview | null;
  feedbackResult: MakeupFeedbackResult | null;
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

- [ ] **Step 1: Install navigation packages**

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

- [ ] **Step 2: Verify dependency tree**

Run:

```bash
npm --prefix apps/mobile ls @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
```

Expected:

- Command exits `0`.
- Installed versions are printed.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "chore: React Navigation 의존성 추가"
```

### Task 2: Create Typed Route And Chrome Config

**Files:**

- Create: `apps/mobile/src/app/navigation/routeTypes.ts`
- Create: `apps/mobile/src/app/navigation/routeChrome.ts`
- Create: `apps/mobile/src/app/navigation/navigation.test.ts`
- Modify: `apps/mobile/src/app-root/navigation.ts`

- [ ] **Step 1: Move route names into `routeTypes.ts`**

Create route types matching the route model above. Keep old `AppScreenKey` exports in `app-root/navigation.ts` temporarily by re-exporting compatible values if existing tests still import them.

- [ ] **Step 2: Add route chrome config**

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
  ARMakeupFilter: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  FeedbackEntry: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    title: '메이크업 피드백',
    rightAction: 'close',
    statusBarStyle: 'dark',
  },
  FeedbackLoading: {
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
  MyPageTab: {
    category: 'main-profile',
    depth: 'main',
    kind: 'mainTab',
    headerVariant: 'default',
    statusBarStyle: 'dark',
  },
} satisfies Record<RouteName, RouteChrome>;
```

Complete every missing route explicitly. The TypeScript `satisfies Record<RouteName, RouteChrome>` check should fail until all route names are covered.

- [ ] **Step 3: Add pure tests**

`navigation.test.ts` should assert:

```ts
expectEqual(getRouteChrome('HomeTab').kind, 'mainTab', 'home tab chrome');
expectEqual(getRouteChrome('HomeTab').depth, 'main', 'home tab depth');
expectEqual(getRouteChrome('ProfileEdit').kind, 'detail', 'profile edit chrome');
expectEqual(getRouteChrome('ProfileEdit').category, 'form-edit', 'profile edit category');
expectEqual(getRouteChrome('FeedbackLoading').kind, 'detail', 'feedback loading chrome');
expectEqual(getRouteChrome('FeedbackLoading').category, 'progress', 'feedback loading category');
expectEqual(getRouteChrome('ARMakeupFilter').kind, 'fullscreen', 'AR chrome');
expectEqual(getRouteChrome('ARMakeupFilter').depth, 'immersive', 'AR depth');
expectEqual(getFooterTargetRoute('capture'), 'ARMakeupFilter', 'capture footer action');
```

- [ ] **Step 4: Run scoped typecheck**

Run:

```bash
apps/mobile/node_modules/.bin/tsc --ignoreConfig --noEmit --pretty false --skipLibCheck true --target es2020 --module esnext --moduleResolution bundler --jsx react-jsx --allowSyntheticDefaultImports true --esModuleInterop true apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app/navigation/routeChrome.ts apps/mobile/src/app/navigation/navigation.test.ts
```

Expected:

- Command exits `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app/navigation/routeChrome.ts apps/mobile/src/app/navigation/navigation.test.ts apps/mobile/src/app-root/navigation.ts
git commit -m "refactor: 모바일 라우트 chrome 설정 추가"
```

### Task 3: Add Navigation Flow State Provider

**Files:**

- Create: `apps/mobile/src/app/navigation/flowState.tsx`
- Create: `apps/mobile/src/app/navigation/flowState.test.tsx`
- Modify: `apps/mobile/src/app-root/AppRoot.tsx`

- [ ] **Step 1: Create provider**

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

- [ ] **Step 2: Wrap the app root**

In `AppRoot.tsx`, wrap the navigator area with `NavigationFlowStateProvider` after fonts are loaded.

- [ ] **Step 3: Add provider guard test**

`flowState.test.tsx` should validate the hook error message string through an exported pure helper:

```ts
expectEqual(
  getNavigationFlowStateProviderErrorMessage(),
  'useNavigationFlowState must be used inside NavigationFlowStateProvider',
  'flow state provider guard message',
);
```

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Create `RootNavigator`**

`RootNavigator` should use:

```ts
import {createNativeStackNavigator} from '@react-navigation/native-stack';
```

All root stack screens should set `headerShown: false` at the navigator level. Visual headers come from route chrome wrappers, not React Navigation default headers.

- [ ] **Step 2: Create `MainTabNavigator`**

`MainTabNavigator` should use:

```ts
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
```

Use the existing `AppFooter` as a custom tab bar. The adapter must map React Navigation tab state to `FooterTabKey`.

Rules:

- `HomeTab` maps to active footer tab `home`.
- `CustomTab` maps to active footer tab `custom`.
- `MyPageTab` is a hidden tab route reached from the header profile button; render the footer with no active tab.
- Footer item `capture` calls `navigation.getParent()?.navigate('ARMakeupFilter')` and does not correspond to a tab route.

- [ ] **Step 3: Add adapters for existing screens**

Create thin adapter components that keep feature screens mostly unchanged during migration.

Example:

```tsx
function HomeRouteScreen({navigation}: HomeRouteScreenProps) {
  return (
    <MainTabChrome routeName="HomeTab">
      <HomeScreen
        onPressARFilter={() => navigation.getParent()?.navigate('ARMakeupFilter')}
        onPressCreateFilter={() => navigation.getParent()?.navigate('FilterUpload')}
        onPressFaceDiagnosis={() => navigation.getParent()?.navigate('Tutorial')}
        onPressMakeupFeedback={() => navigation.getParent()?.navigate('FeedbackEntry')}
        onPressProductRecommendations={() => navigation.navigate('CustomTab')}
      />
    </MainTabChrome>
  );
}
```

- [ ] **Step 4: Replace `activeScreen` routing**

`AppRoot.tsx` should render:

```tsx
<NavigationContainer>
  <NavigationFlowStateProvider>
    <RootNavigator />
  </NavigationFlowStateProvider>
</NavigationContainer>
```

The old `activeScreen`, `renderScreen()`, and local `AppShell` should be removed after all route adapters are connected.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/navigation/RootNavigator.tsx apps/mobile/src/app/navigation/MainTabNavigator.tsx apps/mobile/src/app/navigation/navigationAdapters.tsx apps/mobile/src/app-root/AppRoot.tsx
git commit -m "refactor: 모바일 화면 전환을 React Navigation으로 변경"
```

### Task 5: Move Detail Headers Out Of Feature Screens

**Files:**

- Modify: `apps/mobile/src/features/profile/screens/ProfileEditScreen.tsx`
- Modify: `apps/mobile/src/features/analysis/screens/ImageAnalysisLoadingScreen.tsx`
- Modify: `apps/mobile/src/features/analysis/screens/ImageAnalysisReportsListScreen.tsx`
- Modify: `apps/mobile/src/features/analysis/screens/ImageAnalysisReportDetailScreen.tsx`
- Modify: `apps/mobile/src/features/recommendation/screens/MakeupStyleListScreen.tsx`
- Modify: `apps/mobile/src/features/recommendation/screens/LikedProductListScreen.tsx`
- Modify: `apps/mobile/src/features/filter-extraction/screens/FilterImageUploadScreen.tsx`
- Modify: `apps/mobile/src/features/filter-extraction/screens/FilterExtractionResultScreen.tsx`
- Modify: `apps/mobile/src/features/filter-extraction/screens/FilterSaveScreen.tsx`
- Modify: `apps/mobile/src/features/filter-extraction/screens/FilterRecipeDetailScreen.tsx`
- Modify: `apps/mobile/src/features/feedback/screens/FeedbackEntryScreen.tsx`
- Modify: `apps/mobile/src/features/feedback/screens/FeedbackLoadingScreen.tsx`
- Modify: `apps/mobile/src/features/feedback/screens/MakeupFeedbackScreen.tsx`
- Modify: `apps/mobile/src/features/feedback/screens/FeedbackTipScreen.tsx`
- Modify: `apps/mobile/src/features/feedback/screens/FeedbackGuideOverlayScreen.tsx`
- Delete: `apps/mobile/src/features/feedback/components/FeedbackDetailHeader.tsx`
- Delete: `apps/mobile/src/features/feedback/components/FeedbackDetailHeader.test.tsx`

- [ ] **Step 1: Remove screen-local `AppHeader` imports**

Each detail screen should become content-only. Route adapters should provide the visual header.

- [ ] **Step 2: Normalize `AppScreen` padding**

Detail route content should use:

```tsx
<AppScreen topPadding="belowShellHeader">
  {children}
</AppScreen>
```

If a detail screen already owns scroll behavior, use `scroll={false}` and keep the inner scroll view.

- [ ] **Step 3: Preserve special actions**

`ImageAnalysisReportDetailScreen` currently has share and close actions. Move those actions into route-level `rightSlot` config or a route-specific chrome adapter. Do not remove the actions.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features apps/mobile/src/app/navigation
git commit -m "refactor: 상세 화면 헤더를 라우트 chrome으로 이동"
```

### Task 6: Keep Fullscreen Screens Intentionally Fullscreen

**Files:**

- Modify: `apps/mobile/src/app/navigation/routeChrome.ts`
- Modify: `apps/mobile/src/features/face-capture/screens/FaceCaptureScreen.tsx`
- Modify: `apps/mobile/src/features/ar/screens/ARMakeupFilterScreen.tsx`
- Modify: `apps/mobile/src/features/ar/screens/ARFilterCustomLocationScreen.tsx`
- Modify: `apps/mobile/src/features/ar/screens/ARFilterCustomStyleScreen.tsx`
- Modify: `apps/mobile/src/features/feedback/screens/FeedbackCaptureScreen.tsx`
- Modify: `apps/mobile/src/features/filter-extraction/screens/FilterTryOnAdjustScreen.tsx`

- [ ] **Step 1: Verify fullscreen routes**

Every fullscreen route should have `kind: 'fullscreen'` in `routeChrome.ts`.

- [ ] **Step 2: Preserve overlay controls**

Keep local close/back controls only where they are part of camera, AR, loading, or completion UI.

- [ ] **Step 3: Normalize status bar style**

Use route chrome status bar values:

```ts
FaceCapture: {kind: 'fullscreen', statusBarStyle: 'light'}
FeedbackCapture: {kind: 'fullscreen', statusBarStyle: 'light'}
ARMakeupFilter: {kind: 'fullscreen', statusBarStyle: 'light'}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/navigation apps/mobile/src/features/face-capture apps/mobile/src/features/ar apps/mobile/src/features/filter-extraction
git commit -m "refactor: 풀스크린 화면 chrome 정책 정리"
```

### Task 7: Remove Legacy AppRoot Navigation Helpers

**Files:**

- Modify: `apps/mobile/src/app-root/AppRoot.tsx`
- Modify: `apps/mobile/src/app-root/navigation.ts`
- Modify: `apps/mobile/src/app-root/navigation.test.ts`

- [ ] **Step 1: Delete obsolete state router helpers**

Remove helpers that only existed for the old `activeScreen` router after every route uses React Navigation.

- [ ] **Step 2: Keep or move pure constants**

If a helper is still useful, move it to `apps/mobile/src/app/navigation/routeChrome.ts` or `apps/mobile/src/app/navigation/navigationAdapters.tsx`.

- [ ] **Step 3: Delete obsolete tests**

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
→ FaceCapture or ARMakeupFilter
→ ImageAnalysisLoading
→ ImageAnalysisReportDetail
→ FilterUpload
→ FilterResult
→ FilterTryOn
→ FilterSaved
→ MyPageTab
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
