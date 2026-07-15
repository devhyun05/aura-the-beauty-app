# Makeup Scenario Chips and Curated Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated puzzle-card discovery surface with five fixed popular chips plus a locally curated, refreshable chip cloud while keeping AI question and final recommendation generation unchanged.

**Architecture:** Keep every scenario as a full `MakeupScenarioPrompt` in the existing feature mock so display copy, recommendation seed, tags, and known dimensions stay together. The service exposes the fixed popular set and a seeded general ordering; the screen only tracks the current order and visible count. Two small feature-local components render popular filled chips and neutral glass chips without touching shared theme files.

**Tech Stack:** Expo React Native, TypeScript, React Navigation, Tamagui-compatible existing theme tokens, Node contract tests.

## Global Constraints

- Situation copy is local and curated; the mobile discovery screen must not call `/makeup-recommendations/scenarios`.
- Question generation and final recommendation generation remain AI-backed.
- The five popular labels and order are fixed: `데일리로 자연스럽게`, `출근·등교 단정하게`, `데이트·약속에서 매력적으로`, `사진에서 또렷하게`, `중요한 날 오래 유지되게`.
- Initial discovery shows five popular chips plus seven general chips; load-more adds twelve general chips.
- Popular chips use a near-black filled treatment; general chips use a neutral translucent treatment.
- Every chip uses one typography style, a minimum 44pt touch height, wrapping layout, and untruncated text.
- Do not modify shared theme/design-system files or add dependencies.
- Preserve the floating prompt composer, history, question, result, image polling, and report persistence flows.

---

### Task 1: Curated scenario library contract

**Files:**
- Modify: `apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts`
- Modify: `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts`
- Modify: `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts`

**Interfaces:**
- Produces: `getPopularMakeupScenarios(): MakeupScenarioPrompt[]`
- Produces: `getMakeupScenarioSet({seed}: {seed: number}): MakeupScenarioPrompt[]`, containing general scenarios only.
- Removes from mobile use: `mapBackendScenarioItems`, `composeMakeupScenarioRefresh`, `filterFreshMakeupScenarios`, `fetchGeneratedMakeupScenarios`, and `getFallbackMakeupScenarios`.

- [ ] **Step 1: Write the failing curated-library assertions**

Add assertions that require the exact popular order, require five unique IDs, require a 49-item general set that excludes those IDs, and require two seeds to produce different general orders:

```ts
const popular = getPopularMakeupScenarios();
expectEqual(
  popular.map(item => item.displayText).join('|'),
  '데일리로 자연스럽게|출근·등교 단정하게|데이트·약속에서 매력적으로|사진에서 또렷하게|중요한 날 오래 유지되게',
  'popular scenarios stay fixed',
);
expectEqual(new Set(popular.map(item => item.id)).size, 5, 'popular scenario ids are unique');

const scenarios = getMakeupScenarioSet({seed: 0});
expectEqual(scenarios.length, 49, 'general scenario set count');
expectEqual(
  scenarios.some(item => popular.some(featured => featured.id === item.id)),
  false,
  'popular scenarios are excluded from the general pool',
);
expectEqual(
  getMakeupScenarioSet({seed: 17}).map(item => item.id).join(',') === scenarios.map(item => item.id).join(','),
  false,
  'refresh seed changes general order',
);
```

- [ ] **Step 2: Run the focused contract and verify it fails**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: FAIL because `getPopularMakeupScenarios` and the five popular scenarios do not exist yet.

- [ ] **Step 3: Add the five complete curated scenario records**

Add five records to `MAKEUP_SCENARIOS`, each with an explicit ID, recommendation seed, intent tags, and known dimensions:

```ts
scenario('popular-daily', '데일리로 자연스럽게', '매일 부담 없이 자연스럽고 생기 있어 보이는 데일리 메이크업', ['daily', 'natural'], ['occasion'], 'premium'),
scenario('popular-work-school', '출근·등교 단정하게', '출근이나 등교에 어울리게 단정하고 또렷한 메이크업', ['work', 'school', 'polished'], ['occasion'], 'premium'),
scenario('popular-date', '데이트·약속에서 매력적으로', '데이트나 약속에서 과하지 않지만 매력적으로 보이는 메이크업', ['date', 'meeting', 'attractive'], ['occasion'], 'playful'),
scenario('popular-photo', '사진에서 또렷하게', '사진과 영상에서 이목구비가 또렷하게 살아나는 메이크업', ['photo', 'camera', 'defined'], ['occasion'], 'playful'),
scenario('popular-important', '중요한 날 오래 유지되게', '중요한 날 오랜 시간 흐트러지지 않고 완성도를 유지하는 메이크업', ['important', 'lasting'], ['occasion'], 'premium'),
```

- [ ] **Step 4: Replace generated-scenario helpers with curated selectors**

Define the popular ID order once and return defensive arrays. Filter those IDs from the general pool, apply a deterministic seeded Fisher-Yates shuffle, then preserve the existing first-six tone coverage:

```ts
const POPULAR_SCENARIO_IDS = [
  'popular-daily',
  'popular-work-school',
  'popular-date',
  'popular-photo',
  'popular-important',
] as const;

export function getPopularMakeupScenarios(): MakeupScenarioPrompt[] {
  return POPULAR_SCENARIO_IDS.map(id => {
    const scenario = MAKEUP_SCENARIOS.find(item => item.id === id);
    if (!scenario) throw new Error(`Missing popular makeup scenario: ${id}`);
    return scenario;
  });
}

function shuffleScenarios(items: readonly MakeupScenarioPrompt[], seed: number): MakeupScenarioPrompt[] {
  const shuffled = [...items];
  let state = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
```

Delete the backend scenario mapping/generation and local fallback helpers once their imports and tests are gone. Keep backend question, recommendation, image, history, and refinement functions untouched.

- [ ] **Step 5: Run the focused contract**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS for the curated-library assertions while the existing puzzle contract still remains until Task 3.

### Task 2: Local discovery state

**Files:**
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`

**Interfaces:**
- Consumes: `getPopularMakeupScenarios()` and `getMakeupScenarioSet({seed})` from Task 1.
- Produces for `ScenarioDiscoveryView`: `popularScenarios`, visible `scenarios`, and `canLoadMoreScenarios`.

- [ ] **Step 1: Add discovery-count contract constants**

Define and exercise the exact counts in the screen contract:

```ts
export const INITIAL_GENERAL_SCENARIO_COUNT = 7;
export const SCENARIO_LOAD_MORE_COUNT = 12;
```

Assert both values in `MakeupRecommendationScreen.test.ts` so the total first view remains five fixed plus seven general.

- [ ] **Step 2: Run the focused contract and verify the new exports fail**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: FAIL because the discovery-count exports do not exist yet.

- [ ] **Step 3: Replace async scenario generation state**

Use local state only:

```ts
const initialScenarioSeed = useRef(Math.floor(Math.random() * 10_000));
const scenarioSeed = useRef(initialScenarioSeed.current);
const popularScenarios = useRef(getPopularMakeupScenarios());
const [scenarioOrder, setScenarioOrder] = useState(() => getMakeupScenarioSet({seed: scenarioSeed.current}));
const [visibleScenarioCount, setVisibleScenarioCount] = useState(INITIAL_GENERAL_SCENARIO_COUNT);
const scenarios = scenarioOrder.slice(0, visibleScenarioCount);
const canLoadMoreScenarios = visibleScenarioCount < scenarioOrder.length;

const refreshScenarios = () => {
  scenarioSeed.current += 17;
  setScenarioOrder(getMakeupScenarioSet({seed: scenarioSeed.current}));
  setVisibleScenarioCount(INITIAL_GENERAL_SCENARIO_COUNT);
};

const loadMoreScenarios = () => {
  setVisibleScenarioCount(previous => Math.min(previous + SCENARIO_LOAD_MORE_COUNT, scenarioOrder.length));
};
```

Remove `isLoadingScenarios`, `scenarioError`, the request-in-flight refs, generated-scenario imports, `loadScenarios`, and its mount effect. Do not alter the effects used for result-image polling.

- [ ] **Step 4: Pass the new local props to the discovery view**

```tsx
<ScenarioDiscoveryView
  canLoadMoreScenarios={canLoadMoreScenarios}
  onChangePrompt={setPrompt}
  onLoadMoreScenarios={loadMoreScenarios}
  onOpenHistory={openHistory}
  onRefreshScenarios={refreshScenarios}
  onSelectScenario={startFromScenario}
  onSubmitPrompt={startFromPrompt}
  popularScenarios={popularScenarios.current}
  prompt={prompt}
  scenarios={scenarios}
/>
```

- [ ] **Step 5: Run the focused contract**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS with no scenario-generation request contract remaining in the screen.

### Task 3: Chip cloud UI and obsolete puzzle removal

**Files:**
- Create: `apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptChip.tsx`
- Create: `apps/mobile/src/features/makeup-recommendation/components/ScenarioChipCloud.tsx`
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx`
- Modify: `scripts/mobile/run-makeup-recommendation-contract.mjs`
- Delete: `apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx`
- Delete: `apps/mobile/src/features/makeup-recommendation/components/ScenarioPuzzleWall.tsx`
- Delete: `apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.ts`
- Delete: `apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.test.ts`

**Interfaces:**
- `ScenarioPromptChip({scenario, variant, onPress})`, where `variant` is `'popular' | 'default'`.
- `ScenarioChipCloud({scenarios, variant, onSelect})` wraps content-width chips with consistent gaps.

- [ ] **Step 1: Update the contract runner to require the new components**

Replace the puzzle-layout test entry and old component paths with `ScenarioPromptChip.tsx` and `ScenarioChipCloud.tsx`. Add source assertions for `flexWrap: 'wrap'`, `minHeight: 44`, the `popular` variant, and `canLoadMoreScenarios`.

- [ ] **Step 2: Run the contract and verify it fails**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: FAIL because the new chip components do not exist.

- [ ] **Step 3: Implement the feature-local chip components**

`ScenarioPromptChip` uses one `typography.fontSize.sm`/`semibold` label style, `radius.pill`, horizontal padding, `minHeight: 44`, and `maxWidth: '100%'`. The popular variant uses `colors.textPrimary` with white text and no border. The default variant uses a translucent white feature-local surface, a white edge, and a restrained shadow. Press feedback only changes opacity.

`ScenarioChipCloud` is a plain wrapping row:

```tsx
<View style={styles.cloud}>
  {scenarios.map(scenario => (
    <ScenarioPromptChip
      key={scenario.id}
      onPress={() => onSelect(scenario)}
      scenario={scenario}
      variant={variant}
    />
  ))}
</View>
```

```ts
cloud: {
  alignItems: 'flex-start',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: spacing.sm,
  width: '100%',
}
```

- [ ] **Step 4: Restructure the discovery view**

Remove activity indicators and scenario error props. Render a `자주 찾는 메이크업` label with the popular cloud, then an action row containing `다른 분위기` and `새로 보기 ↻`, followed by the default cloud. Render `문구 더보기` only when `canLoadMoreScenarios` is true. Preserve the existing floating composer verbatim.

- [ ] **Step 5: Delete obsolete puzzle files**

Delete the two puzzle components, layout helper, and layout test only after imports and the runner no longer reference them.

- [ ] **Step 6: Run the focused contract and mobile typecheck once**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS.

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 7: Review the final diff and commit**

Run: `git diff --check -- apps/mobile/src/features/makeup-recommendation scripts/mobile/run-makeup-recommendation-contract.mjs`

Expected: no output.

Commit only the feature files, contract runner, plan, and design documentation; keep local iOS signing/Metro files unstaged.
