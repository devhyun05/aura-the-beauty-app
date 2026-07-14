# Makeup Recommendation Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the existing makeup-recommendation flow with gender-neutral mixed-style copy, a dense no-truncation puzzle wall, a compact analysis checkbox, a floating prompt CTA, full-width question options, and collapsible result details.

**Architecture:** Keep the existing `features/makeup-recommendation` vertical slice and deterministic mock session service. Add pure visual metadata and a pure dense-packing core, then isolate runtime text measurement and absolute positioning in one `ScenarioPuzzleWall` component. Discovery, question, and result screens consume those interfaces without importing or modifying Auradin.

**Tech Stack:** Expo React Native, TypeScript 6, React 19, React Native 0.85, Tamagui, Lucide React Native, existing shared theme/UI helpers, executable TypeScript contract tests.

## Global Constraints

- Do not modify or import from `apps/mobile/src/features/recommendation/`.
- Do not modify `services/backend/app/api/search_sessions.py`, `services/backend/app/services/auradin_agent/`, `services/backend/app/services/auradin_catalog/`, or `data/auradin/`.
- Keep feature changes under `apps/mobile/src/features/makeup-recommendation/`; only package scripts and the focused test runner may live outside it.
- Do not add a UI, icon, layout, or testing dependency and do not modify a lockfile.
- Keep the existing 36-scenario contract and deterministic recommendation behavior.
- Base the visual system on the existing monochrome tokens; keep burgundy and pale rose in feature-local tokens only.
- Scenario copy must mix editorial, scene, monologue, narrative, and character styles and must not assume a gender.
- Avoid unnecessary `오늘`, `~할 거야`, and `~해볼래` repetition.
- Never truncate scenario copy and never set `numberOfLines` on scenario text.
- Puzzle chips must keep a minimum 44-point touch target and fall back to full-width cards at large font scales.
- Question options use the full content width and a consistent readable font size.
- Result details are collapsed by default while save, AR, refine, loading, empty, retry, keyboard, and safe-area behavior remain available.
- Preserve the user's unrelated iOS project, AppDelegate, Podfile lock, and untracked signup plan changes.

---

## File Structure

- Modify `apps/mobile/src/features/makeup-recommendation/types.ts`: add copy and visual metadata types.
- Modify `apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts`: replace 36 display strings and assign visual metadata.
- Create `apps/mobile/src/features/makeup-recommendation/theme/makeupRecommendationTokens.ts`: feature-local burgundy/rose surfaces and text colors.
- Create `apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.ts`: pure row-span and dense-placement functions.
- Create `apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.test.ts`: overlap, gap fill, order, and fallback contracts.
- Create `apps/mobile/src/features/makeup-recommendation/components/ScenarioPuzzleWall.tsx`: hidden text measurement, placement, rendering, and accessibility fallback.
- Modify `apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx`: metadata-driven chip surface/type and measurement mode.
- Modify `apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx`: compact checkbox, puzzle wall, and floating CTA.
- Modify `apps/mobile/src/features/makeup-recommendation/screens/RecommendationQuestionView.tsx`: segmented progress and full-width options.
- Modify `apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsView.tsx`: compact summary cards with toggled details.
- Create `apps/mobile/src/features/makeup-recommendation/screens/makeupRecommendationViewContracts.ts`: React-Native-free copy and view-state helpers.
- Modify `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`: copy and pure view-state contracts.
- Modify `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts`: scenario metadata and copy contracts.
- Create `scripts/mobile/run-makeup-recommendation-contract.mjs`: compile and execute focused pure tests.
- Modify `apps/mobile/package.json`: add `test:makeup-recommendation`.

---

### Task 1: Scenario copy, metadata, and executable contract runner

**Files:**
- Modify: `apps/mobile/src/features/makeup-recommendation/types.ts`
- Modify: `apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts`
- Modify: `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts`
- Create: `scripts/mobile/run-makeup-recommendation-contract.mjs`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Produces: `MakeupScenarioCopyStyle`, `MakeupScenarioVisualEmphasis`, `MakeupScenarioPalette`, and metadata fields on `MakeupScenarioPrompt`.
- Preserves: `id`, `seedPrompt`, `intentTags`, `knownDimensions`, `tone`, and `source` behavior used by `makeupRecommendationService.ts`.

- [ ] **Step 1: Extend the scenario contract test and make it fail**

Append these assertions to `makeupRecommendationService.test.ts`:

```ts
const allScenarios = getMakeupScenarioSet({seed: 0});
expectEqual(
  new Set(allScenarios.map(item => item.copyStyle)).size,
  5,
  'five copy styles represented',
);
expectEqual(
  allScenarios.every(item => item.preferredColumnSpan >= 3 && item.preferredColumnSpan <= 8),
  true,
  'puzzle spans stay in range',
);
expectEqual(
  allScenarios.some(item => item.palette === 'accent'),
  true,
  'accent chips represented',
);
expectEqual(
  allScenarios.some(item => /여신|남신|고명딸/.test(item.displayText)),
  false,
  'default copy is gender neutral',
);
expectEqual(
  allScenarios.filter(item => item.displayText.includes('오늘')).length <= 2,
  true,
  'today copy is not overused',
);
```

- [ ] **Step 2: Add and run a focused test command to verify RED**

Create `scripts/mobile/run-makeup-recommendation-contract.mjs` by following the existing compile-then-run contract style:

```js
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-makeup-recommendation-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const tests = [
  'features/makeup-recommendation/services/makeupRecommendationService.test.ts',
  'features/makeup-recommendation/components/scenarioPuzzleLayout.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  tscPath,
  '--module', 'commonjs',
  '--target', 'ES2022',
  '--esModuleInterop',
  '--jsx', 'react-jsx',
  '--skipLibCheck',
  '--rootDir', srcRoot,
  '--outDir', outDir,
  ...tests.map(test => join(srcRoot, test)),
]);

for (const test of tests) {
  run(process.execPath, [join(outDir, test.replace(/\.ts$/, '.js'))]);
}
```

Add to `apps/mobile/package.json`:

```json
"test:makeup-recommendation": "node ../../scripts/mobile/run-makeup-recommendation-contract.mjs"
```

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: FAIL because scenario visual fields and `scenarioPuzzleLayout.test.ts` do not exist.

- [ ] **Step 3: Add the visual metadata types**

Add to `types.ts`:

```ts
export type MakeupScenarioCopyStyle =
  | 'editorial'
  | 'scene'
  | 'monologue'
  | 'narrative'
  | 'character';
export type MakeupScenarioVisualEmphasis = 'compact' | 'standard' | 'featured';
export type MakeupScenarioPalette = 'paper' | 'ink' | 'muted' | 'accent';

export type MakeupScenarioPrompt = {
  id: string;
  displayText: string;
  seedPrompt: string;
  intentTags: string[];
  knownDimensions: MakeupQuestionDimension[];
  tone: MakeupScenarioTone;
  source: MakeupScenarioSource;
  copyStyle: MakeupScenarioCopyStyle;
  visualEmphasis: MakeupScenarioVisualEmphasis;
  palette: MakeupScenarioPalette;
  preferredColumnSpan: 3 | 4 | 5 | 6 | 7 | 8;
};
```

- [ ] **Step 4: Replace all 36 display strings and assign metadata**

Keep every scenario's existing semantic `seedPrompt` and question dimensions. Use this exact ID-to-display mapping:

```text
must-look-beautiful → 중요한 날, 어떻게든 잘 나오는 룩
most-beautiful-self → 조용히 정돈된 프리미엄 밸런스
commute-crush → 출근길 자주 마주치던 사람에게 먼저 인사하는 날
five-minute-polished → 5분 만에 완성한 정교한 인상
trend-my-way → SNS에 저장만 해둔 그 룩, 이번엔 직접
ex-wedding → 전 애인 결혼식, 말없이 완승
baseball-camera → 야구장 전광판에 잡히고 싶은 날
art-student → 느낌 좋은 미대생 전시 오프닝 룩
music-heiress → 부잣집 고명자식 음대생 룩
drama-comeback → 점 하나 찍고 완전히 달라진 서사
camera-first → 공항 출국 사진 레전드 룩
well-rested → 밤샘의 흔적만 지우고 출근
well-dressed → 꾸안꾸 졸업, 잘꾸 입학
neon-two-am → 을지로 새벽 네온을 닮은 룩
ai-story → AI가 골라주는 예상 밖의 서사
unfamiliar-me → 낯설지만 분명히 나다운 변화
wedding-balance → 예식장 조명까지 계산한 하객 룩
light-photo → 자연광과 플래시에 모두 강한 룩
glasses-eyes → 안경 너머로도 살아나는 눈매
concert-encore → 앵콜까지 살아남는 콘서트 룩
festival-sunset → 새벽까지 살아남는 페스티벌 헤드라이너 룩
second-date → 두 번째 만남, 조금 더 선명한 인상
not-a-blind-date → 소개팅은 아니지만 첫인상은 중요하니까
one-lip → 립 하나로 약속 있는 사람 되기
no-plans → 약속 없이도 특별한 기분
natural-balance → 힘을 뺄수록 또렷해지는 밸런스
quiet-luxury → 말하지 않아도 느껴지는 조용한 럭셔리
hip-point → 성수동 감성 느좋 룩
one-spoon-bold → 평소보다 한 단계 대담하게
ai-pick → 취향의 빈칸은 AI에게 맡기기
saved-look → 음악프로그램 무대 접수 아이돌 룩
commute-runway → 첫 출근인데 이미 에이스
reunion → 오랜만이라는 말 뒤에 한 번 더 돌아보게
bookstore-owner → 연남동 독립서점 단골 룩
film-senior → 홍대 4번 출구 서브컬처 룩
gallery-weekend → 이태원 해방촌 힙스터 룩
```

Assign all five copy styles across the set. Use `featured` only for short high-impact editorial/character copy, `compact` for long narrative/monologue copy, and `standard` otherwise. Distribute `paper`, `ink`, and `muted` as the base; assign `accent` to no more than 6 of 36 scenarios. Distribute preferred spans across 3 through 8 so no single span owns more than one third of the set.

Also replace the mood question title `오늘 원하는 분위기는 뭐예요?` with `어떤 분위기가 끌리나요?`. Keep `오늘` only inside semantic `seedPrompt` values where the recommendation request genuinely refers to the current occasion; do not surface it repeatedly in UI labels.

- [ ] **Step 5: Run the focused test and typecheck**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: still FAIL only because the puzzle test file is not implemented yet.

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL only where existing scenario constructors/cards do not yet pass or consume the new metadata.

- [ ] **Step 6: Commit the scenario contract**

```bash
git add apps/mobile/src/features/makeup-recommendation/types.ts apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts apps/mobile/package.json scripts/mobile/run-makeup-recommendation-contract.mjs
git commit -m "feat(makeup-recommendation): refresh scenario copy contracts"
```

---

### Task 2: Dense no-truncation puzzle layout

**Files:**
- Create: `apps/mobile/src/features/makeup-recommendation/theme/makeupRecommendationTokens.ts`
- Create: `apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.ts`
- Create: `apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.test.ts`
- Create: `apps/mobile/src/features/makeup-recommendation/components/ScenarioPuzzleWall.tsx`
- Modify: `apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx`

**Interfaces:**
- Produces: `getPuzzleRowSpan`, `packScenarioPuzzle`, `ScenarioPuzzlePlacement`, and `ScenarioPuzzleWall`.
- Consumes: scenario visual metadata from Task 1 and `onSelect(scenario)` from the discovery screen.

- [ ] **Step 1: Write failing pure layout tests**

Create `scenarioPuzzleLayout.test.ts`:

```ts
import {getPuzzleRowSpan, packScenarioPuzzle} from './scenarioPuzzleLayout';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(getPuzzleRowSpan({contentHeight: 40, rowHeight: 48, rowGap: 8}), 1, 'one row');
expectEqual(getPuzzleRowSpan({contentHeight: 72, rowHeight: 48, rowGap: 8}), 2, 'two rows');

const placements = packScenarioPuzzle({
  columnCount: 12,
  items: [
    {id: 'tall', columnSpan: 7, rowSpan: 2},
    {id: 'short', columnSpan: 5, rowSpan: 1},
    {id: 'gap-filler', columnSpan: 5, rowSpan: 1},
    {id: 'next', columnSpan: 4, rowSpan: 1},
  ],
});

const byId = Object.fromEntries(placements.map(item => [item.id, item]));
expectEqual(byId['gap-filler'].row, 1, 'short-card gap is filled');
expectEqual(byId['gap-filler'].column, 7, 'gap filler uses right-side hole');

for (let index = 0; index < placements.length; index += 1) {
  for (let otherIndex = index + 1; otherIndex < placements.length; otherIndex += 1) {
    const a = placements[index];
    const b = placements[otherIndex];
    const separated =
      a.column + a.columnSpan <= b.column ||
      b.column + b.columnSpan <= a.column ||
      a.row + a.rowSpan <= b.row ||
      b.row + b.rowSpan <= a.row;
    expectEqual(separated, true, `${a.id} and ${b.id} do not overlap`);
  }
}
```

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: FAIL because `scenarioPuzzleLayout.ts` does not exist.

- [ ] **Step 2: Implement the pure dense packer**

Create `scenarioPuzzleLayout.ts` with these public contracts:

```ts
export type ScenarioPuzzleItem = {
  id: string;
  columnSpan: number;
  rowSpan: number;
};

export type ScenarioPuzzlePlacement = ScenarioPuzzleItem & {
  column: number;
  row: number;
};

export function getPuzzleRowSpan({
  contentHeight,
  rowGap,
  rowHeight,
}: {
  contentHeight: number;
  rowGap: number;
  rowHeight: number;
}): number {
  return Math.max(1, Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap)));
}

export function packScenarioPuzzle({
  columnCount,
  items,
}: {
  columnCount: number;
  items: readonly ScenarioPuzzleItem[];
}): ScenarioPuzzlePlacement[] {
  const occupied: boolean[][] = [];
  const placements: ScenarioPuzzlePlacement[] = [];
  const fits = (row: number, column: number, item: ScenarioPuzzleItem) => {
    if (column + item.columnSpan > columnCount) return false;
    for (let y = row; y < row + item.rowSpan; y += 1) {
      for (let x = column; x < column + item.columnSpan; x += 1) {
        if (occupied[y]?.[x]) return false;
      }
    }
    return true;
  };

  for (const item of items) {
    let row = 0;
    let placed = false;
    while (!placed) {
      for (let column = 0; column < columnCount; column += 1) {
        if (!fits(row, column, item)) continue;
        for (let y = row; y < row + item.rowSpan; y += 1) {
          occupied[y] ??= Array(columnCount).fill(false);
          for (let x = column; x < column + item.columnSpan; x += 1) occupied[y][x] = true;
        }
        placements.push({...item, column, row});
        placed = true;
        break;
      }
      if (!placed) row += 1;
    }
  }
  return placements;
}
```

- [ ] **Step 3: Add feature-local palette tokens and metadata-driven cards**

Create `makeupRecommendationTokens.ts`:

```ts
export const makeupRecommendationColors = {
  accent: '#8F2941',
  accentText: '#FFFFFF',
  accentMuted: '#F3E5E8',
  accentMutedText: '#6F1F31',
} as const;
```

Update `ScenarioPromptCard` to accept `measurement?: boolean` and `style?: StyleProp<ViewStyle>`. Map `paper`, `ink`, `muted`, and `accent` to shared surfaces plus the feature-local accent. Map `compact`, `standard`, and `featured` to existing `xs`, `sm`, and `md` typography tokens. Do not pass `numberOfLines`; set `minHeight: 44`, `maxWidth: '100%'`, and `overflow: 'visible'`.

- [ ] **Step 4: Implement measurement-first `ScenarioPuzzleWall`**

The component signature is:

```ts
export function ScenarioPuzzleWall({
  onSelect,
  scenarios,
}: {
  onSelect: (scenario: MakeupScenarioPrompt) => void;
  scenarios: readonly MakeupScenarioPrompt[];
})
```

Use `onLayout` to obtain container width and `useWindowDimensions().fontScale` for fallback. Render an absolute, opacity-zero measurement layer at each scenario's preferred span width. Record measured card heights by ID. Once every card is measured, call `getPuzzleRowSpan`, then `packScenarioPuzzle`, calculate each absolute `left`, `top`, `width`, and `height`, and render the visible cards together. Set container height from the maximum occupied row. Clear measurements whenever width, font scale, or scenario IDs change. At `fontScale >= 1.35`, skip absolute packing and render full-width cards in source order.

Sort the visible render array by `row`, then `column` so accessibility traversal follows visual order. While measurement is incomplete, render a muted skeleton with the previous calculated height or a minimum height of 240.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS with no overlap and the right-side gap filled.

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS after all card props and scenario constructors use the new types.

- [ ] **Step 6: Commit the puzzle layout**

```bash
git add apps/mobile/src/features/makeup-recommendation/theme/makeupRecommendationTokens.ts apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.ts apps/mobile/src/features/makeup-recommendation/components/scenarioPuzzleLayout.test.ts apps/mobile/src/features/makeup-recommendation/components/ScenarioPuzzleWall.tsx apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx
git commit -m "feat(makeup-recommendation): add dense scenario puzzle"
```

---

### Task 3: Discovery composition, compact checkbox, and floating CTA

**Files:**
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx`
- Create: `apps/mobile/src/features/makeup-recommendation/screens/makeupRecommendationViewContracts.ts`
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`

**Interfaces:**
- Consumes: `ScenarioPuzzleWall`, existing discovery callbacks, `useSafeAreaInsets`, and Lucide `Check`.
- Produces: React-Native-free `makeupRecommendationDiscoveryCopy` and unchanged `ScenarioDiscoveryViewProps` callback contract.

- [ ] **Step 1: Write failing discovery contracts**

Change `MakeupRecommendationScreen.test.ts` so it imports pure values only from `makeupRecommendationViewContracts.ts`, then replace the existing title/refresh assertions with:

```ts
expectEqual(makeupRecommendationDiscoveryCopy.title, '어떤 모습이 끌리나요?', 'discovery title');
expectEqual(makeupRecommendationDiscoveryCopy.profile, '내 분석 결과 반영', 'compact profile copy');
expectEqual(makeupRecommendationDiscoveryCopy.submit, '내 이야기로 추천받기', 'floating CTA copy');
expectEqual(makeupRecommendationDiscoveryCopy.refresh, '새로 보기', 'compact refresh copy');
```

Add `'features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts'` to the `tests` array in `run-makeup-recommendation-contract.mjs` so the same focused command executes these pure view contracts after compilation.

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because the current copy and exports differ.

- [ ] **Step 2: Replace the switch with an accessible compact checkbox**

Use a `Pressable` with:

```tsx
<Pressable
  accessibilityLabel={makeupRecommendationDiscoveryCopy.profile}
  accessibilityRole="checkbox"
  accessibilityState={{checked: enabled, disabled: !personalColor}}
  disabled={!personalColor}
  onPress={() => onChange(!enabled)}
  style={({pressed}) => [styles.profileOption, pressed && styles.pressed]}
>
  <View style={[styles.checkbox, enabled && styles.checkboxChecked]}>
    {enabled ? <Check color={colors.white} size={12} strokeWidth={2.4} /> : null}
  </View>
  <Text style={styles.profileTitle}>{makeupRecommendationDiscoveryCopy.profile}</Text>
</Pressable>
```

Do not render the personal-color subtitle. Keep the full row tappable and at least 44 points tall even though the visual control is compact.

- [ ] **Step 3: Separate the input card from the CTA and add the puzzle wall**

Create `makeupRecommendationViewContracts.ts` and move the copy constant there so the focused Node contract runner never imports React Native screens. Remove the button from `PromptComposer`. Replace `ScenarioPromptWall` with `ScenarioPuzzleWall`. Use this copy:

```ts
export const makeupRecommendationDiscoveryCopy = {
  eyebrow: 'AI MAKEUP DISCOVERY',
  title: '어떤 모습이 끌리나요?',
  description: '설명하기 어렵다면 천천히 둘러보세요. 마음에 걸리는 한 문장에서 시작해도 좋아요.',
  placeholder: '원하는 느낌이나 상황을 들려주세요',
  profile: '내 분석 결과 반영',
  submit: '내 이야기로 추천받기',
  refresh: '새로 보기',
} as const;
```

Also move the existing pure `shouldHandleMakeupRecommendationBack`, `getQuestionActionMode`, and `makeupRecommendationResultRoleLabels` exports into this contract file and make their screens/controllers import them. Keep re-exports from the original modules only if another import requires compatibility.

- [ ] **Step 4: Add the safe-area floating CTA**

Wrap the screen in a flex `View`, use `useSafeAreaInsets`, give `AppScreen` enough numeric bottom padding for the floating host, and render the CTA as an absolute sibling:

```tsx
<View style={styles.container}>
  <AppScreen bottomPadding={120 + insets.bottom} keyboardShouldPersistTaps="handled" topPadding="belowShellHeader">
    {/* intro, composer, checkbox, heading, puzzle, refresh */}
  </AppScreen>
  <View pointerEvents="box-none" style={[styles.floatingHost, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
    <Pressable disabled={prompt.trim().length === 0} onPress={onSubmitPrompt} style={styles.submitButton}>
      <Text style={styles.submitLabel}>{makeupRecommendationDiscoveryCopy.submit}</Text>
    </Pressable>
  </View>
</View>
```

Keep the CTA above the keyboard by wrapping the root with the existing iOS `KeyboardAvoidingView` pattern.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS.

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit discovery refresh**

```bash
git add apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx apps/mobile/src/features/makeup-recommendation/screens/makeupRecommendationViewContracts.ts apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx
git commit -m "feat(makeup-recommendation): refresh discovery composition"
```

---

### Task 4: Full-width questions and collapsible result cards

**Files:**
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/RecommendationQuestionView.tsx`
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsView.tsx`
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`

**Interfaces:**
- Preserves: `onAnswer`, `onApplyAR`, `onRefine`, `onReset`, retry, save, and result-role contracts.
- Produces in `makeupRecommendationViewContracts.ts`: `getQuestionProgressSegments` and `toggleExpandedLookId` pure helpers.

- [ ] **Step 1: Add failing view-state contracts**

Append to `MakeupRecommendationScreen.test.ts`:

```ts
import {
  getQuestionProgressSegments,
  toggleExpandedLookId,
} from './makeupRecommendationViewContracts';

expectEqual(
  getQuestionProgressSegments({currentQuestionIndex: 1, questionCount: 3}).join(','),
  'complete,complete,pending',
  'segmented question progress',
);
const opened = toggleExpandedLookId(new Set<string>(), 'look-a');
expectEqual(opened.has('look-a'), true, 'result detail opens');
expectEqual(toggleExpandedLookId(opened, 'look-a').has('look-a'), false, 'result detail closes');
```

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 2: Implement segmented progress and full-width options**

Add this React-Native-free helper to `makeupRecommendationViewContracts.ts`, then import it into `RecommendationQuestionView.tsx`:

```ts
export function getQuestionProgressSegments({
  currentQuestionIndex,
  questionCount,
}: {
  currentQuestionIndex: number;
  questionCount: number;
}): Array<'complete' | 'pending'> {
  return Array.from({length: questionCount}, (_, index) =>
    index <= currentQuestionIndex ? 'complete' : 'pending',
  );
}
```

Render one 3-point-high segment per item. Keep the options in a vertical `View` with `width: '100%'`, `minHeight: 62`, `borderRadius: radius.md`, and consistent `typography.fontSize.md`. Preserve immediate advance for non-final choices, final local selection, free text, and inline additional constraints.

- [ ] **Step 3: Collapse result details by default**

Add this React-Native-free helper to `makeupRecommendationViewContracts.ts`, then import it into `RecommendationResultsView.tsx`:

```ts
export function toggleExpandedLookId(previous: Set<string>, lookId: string): Set<string> {
  const next = new Set(previous);
  if (next.has(lookId)) next.delete(lookId);
  else next.add(lookId);
  return next;
}
```

Own `expandedLookIds` in `RecommendationResultsView`. Always show image, role, title, summary, duration/difficulty, up to three applied-condition chips, save, `자세히 보기`, and `AR로 적용하기`. Render reasons, all steps, and products only when the card ID is expanded. Change the detail button label to `접기` while expanded and expose `accessibilityState={{expanded}}`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS.

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit question and result refresh**

```bash
git add apps/mobile/src/features/makeup-recommendation/screens/RecommendationQuestionView.tsx apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsView.tsx apps/mobile/src/features/makeup-recommendation/screens/makeupRecommendationViewContracts.ts apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts
git commit -m "feat(makeup-recommendation): align question and result visuals"
```

---

### Task 5: Regression and device-facing verification

**Files:**
- Verify only; do not modify protected or unrelated files.

**Interfaces:**
- Consumes the finished feature.
- Produces fresh verification evidence and a clean handoff; no push.

- [ ] **Step 1: Run the focused contract suite**

Run: `npm --prefix apps/mobile run test:makeup-recommendation`

Expected: PASS with no thrown contract error.

- [ ] **Step 2: Run the full mobile typecheck**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS with zero TypeScript diagnostics.

- [ ] **Step 3: Check formatting and protected paths**

Run: `git diff --check`

Expected: no output and exit code 0.

Run: `git diff --name-only HEAD~4..HEAD -- apps/mobile/src/features/recommendation services/backend/app/api/search_sessions.py services/backend/app/services/auradin_agent services/backend/app/services/auradin_catalog data/auradin`

Expected: no output.

- [ ] **Step 4: Verify the live mobile screen on the existing Metro session**

Keep Metro on port 8082. Reload the installed development build and verify:

```text
discovery: no truncated scenario copy; visible puzzle gap filling; monochrome + sparse accent; mixed font sizes
profile: compact checkbox labeled "내 분석 결과 반영"
composer: CTA floats above the safe area and keyboard
question: options occupy the full width and progress segments advance
results: details start collapsed, toggle without losing save/AR actions
back: question/results return to discovery before leaving the route
```

- [ ] **Step 5: Review final status without pushing**

Run: `git status --short --branch`

Expected: feature commits are local; the pre-existing iOS and signup-plan changes remain unstaged; no remote push is performed.
