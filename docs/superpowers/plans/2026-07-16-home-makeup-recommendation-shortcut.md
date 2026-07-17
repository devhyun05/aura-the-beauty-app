# Home Makeup Recommendation Shortcut Implementation Plan

**Status:** ✅ COMPLETED — commit `f3f47d1d` (`feat: open makeup recommendations from home`) is an ancestor of `origin/dev`. The integrated follow-up work must not reimplement this shortcut; it only runs home/navigation/typecheck regression gates and fixes this surface if a regression is proven.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home screen's `헤어 분석` service shortcut with a `메이크업 추천` shortcut that opens the existing makeup recommendation flow.

**Architecture:** Keep the existing home service shortcut grid and visual component unchanged. Rename the shortcut callback and action identifier so their semantics match the destination, then wire the home route directly to the existing `MakeupRecommendation` root route.

**Tech Stack:** Expo React Native, TypeScript, React Navigation, Tamagui, Lucide React Native

## Global Constraints

- Preserve the shortcut's existing position, size, surface style, spacing, and press motion.
- Use the existing Lucide icon dependency; add no UI library.
- Do not change shared theme or design-system files.
- Keep the existing hair-analysis feature and routes intact; remove only its home shortcut entry.
- Run the mobile TypeScript typecheck after the focused contract update.

---

### Task 1: Replace the home shortcut and route contract

**Files:**
- Modify: `apps/mobile/src/features/home/screens/HomeScreen.test.ts`
- Modify: `apps/mobile/src/features/home/screens/HomeScreen.tsx`
- Modify: `apps/mobile/src/app/navigation/routes/homeRoutes.tsx`
- Test: `apps/mobile/src/features/home/screens/HomeScreen.test.ts`

**Interfaces:**
- Consumes: existing root route `MakeupRecommendation: undefined`
- Produces: optional callback `onPressMakeupRecommendation?: () => void` and shortcut action ID `makeupRecommendation`

- [x] **Step 1: Update the contract test first**

Change the expected eighth label and second row, then replace the hair-analysis handler assertion with the makeup-recommendation handler assertion:

```ts
const expectedHomeServiceShortcutLabels: readonly [
  '얼굴 분석',
  '메이크업 필터',
  '메이크업 추출',
  '메이크업 피드백',
  '필터 스토어',
  '추천 제품',
  '컨설팅',
  '메이크업 추천',
] = HOME_SERVICE_SHORTCUT_LABELS;

const expectedHomeServiceShortcutSecondRowLabels =
  '필터 스토어,추천 제품,컨설팅,메이크업 추천';

const makeupRecommendationPressHandler = getHomeServiceShortcutPressHandler(
  'makeupRecommendation',
  {
    onPressMakeupRecommendation: () => {
      selectedHomeServiceShortcut = 'makeupRecommendation';
    },
  },
);
```

- [x] **Step 2: Run typecheck to verify the contract fails**

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because `HOME_SERVICE_SHORTCUT_LABELS` still contains `헤어 분석` and `makeupRecommendation`/`onPressMakeupRecommendation` do not yet exist.

- [x] **Step 3: Implement the minimal home shortcut replacement**

In `HomeScreen.tsx`:

```tsx
import {
  // existing icons
  Sparkles,
} from 'lucide-react-native';

type HomeScreenProps = {
  onPressMakeupRecommendation?: () => void;
  // existing props
};

{
  id: 'makeupRecommendation',
  label: '메이크업 추천',
  accessibilityLabel: '메이크업 추천 시작',
  icon: (color: string) => (
    <Sparkles color={color} size={iconSize.lg} strokeWidth={1.9} />
  ),
}
```

Remove `Scissors` and every home-only `onPressHairAnalysis` reference, pass `onPressMakeupRecommendation` through `HomeServiceShortcutHandlers`, and return it when the action ID is `makeupRecommendation`.

In `homeRoutes.tsx`, replace the old prop with:

```tsx
onPressMakeupRecommendation={() =>
  rootNavigation?.navigate('MakeupRecommendation')
}
```

- [x] **Step 4: Run focused validation**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS with no TypeScript errors.

Run: `git diff --check -- apps/mobile/src/features/home/screens/HomeScreen.tsx apps/mobile/src/features/home/screens/HomeScreen.test.ts apps/mobile/src/app/navigation/routes/homeRoutes.tsx`

Expected: PASS with no whitespace errors.

- [x] **Step 5: Commit the implementation files and plan**

```bash
git add docs/superpowers/plans/2026-07-16-home-makeup-recommendation-shortcut.md \
  apps/mobile/src/features/home/screens/HomeScreen.tsx \
  apps/mobile/src/features/home/screens/HomeScreen.test.ts \
  apps/mobile/src/app/navigation/routes/homeRoutes.tsx
git commit -m "feat: open makeup recommendations from home"
```

- [x] **Step 6: Publish and integrate**

Historical branch: `feature/makeup-recommendation`.

Completion evidence: commit `f3f47d1d` is present in `origin/dev`. Future umbrella PRs reference this commit and run regression tests; they do not create a second shortcut implementation PR.
