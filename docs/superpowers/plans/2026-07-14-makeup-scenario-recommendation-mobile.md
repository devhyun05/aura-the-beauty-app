# Makeup Scenario Recommendation Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent mobile MVP where users browse 36 playful scenario prompts, answer up to three adaptive questions, optionally add final constraints, and receive three coordinated makeup looks with steps and curated product sets.

**Architecture:** Add a standalone `features/makeup-recommendation` vertical slice with pure domain contracts, deterministic mock services, focused phase views, and one screen controller. Register one new root route and feature-menu entry; keep every Auradin mobile and backend file untouched. The service and product-provider interfaces remain replaceable so a later backend plan can add real AI and a QA-only Auradin comparison provider without rewriting the UI.

**Tech Stack:** Expo React Native, TypeScript, React Navigation, Tamagui, existing shared theme/UI helpers, existing bundled makeup-filter images.

## Global Constraints

- Do not modify or import from `apps/mobile/src/features/recommendation/`.
- Do not modify `services/backend/app/api/search_sessions.py`, `services/backend/app/services/auradin_agent/`, `services/backend/app/services/auradin_catalog/`, or `data/auradin/`.
- Put all new feature code under `apps/mobile/src/features/makeup-recommendation/`.
- Use only existing Tamagui, React Native, React Navigation, Lucide, shared theme, and shared UI dependencies.
- Do not add a UI or icon library and do not modify a lockfile.
- Use existing theme tokens for color, spacing, typography, radius, shadows, and icon sizes.
- Preserve loading, empty, error, refresh, keyboard, and safe-area behavior.
- Use 36 scenario prompts per set; the first six must include narrative, playful, and premium tones.
- Ask one or two questions normally and never more than three.
- Every question supports a free-text answer; the final question alone supports inline `+ 조건 추가` and an explicit `추천받기` action.
- Return exactly three look roles: `anchor`, `bold`, and `discovery`.
- Profile/personal-color context is a soft preference and can be disabled.
- MVP product recommendations use feature-owned curated fixtures and a replaceable provider contract.
- Existing user iOS project, AppDelegate, and Podfile lock changes are unrelated and must remain untouched.

---

## File Structure

### New feature files

- `apps/mobile/src/features/makeup-recommendation/types.ts`: public domain types for scenarios, questions, sessions, looks, steps, and products.
- `apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts`: 36 curated scenarios, deterministic questions, three look fixtures, and product fixtures.
- `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts`: prompt-set selection, adaptive question queue, local session transitions, and fixture product-provider implementation.
- `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts`: domain and transition contract checks.
- `apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx`: accessible editorial prompt card.
- `apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx`: first-screen prompt wall, composer, profile toggle, and refresh.
- `apps/mobile/src/features/makeup-recommendation/screens/RecommendationQuestionView.tsx`: options, free-text alternative, final inline constraints, and keyboard-safe action.
- `apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsView.tsx`: three look roles, methods, products, local save toggle, and AR CTA.
- `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx`: phase controller and service orchestration only.
- `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`: view-state and copy contract checks.
- `apps/mobile/src/features/makeup-recommendation/index.ts`: feature public exports.
- `apps/mobile/src/app/navigation/routes/makeupRecommendationRoutes.tsx`: navigation wrapper and profile/AR integration.

### Existing files to modify

- `apps/mobile/src/app/navigation/routeTypes.ts`: add `MakeupRecommendation` root route.
- `apps/mobile/src/app/navigation/RootNavigator.tsx`: register the new screen.
- `apps/mobile/src/app/navigation/routeChrome.ts`: add detail chrome metadata.
- `apps/mobile/src/app/navigation/linkingConfig.ts`: add `makeup-recommendation` deep link.
- `apps/mobile/src/app/navigation/appFeatureMenu.ts`: add the feature-menu entry.
- `apps/mobile/src/app/navigation/routes/routeUtils.tsx`: route the feature-menu selection.
- `apps/mobile/src/app/navigation/navigation.test.ts`: lock detail chrome behavior.
- `apps/mobile/src/app/navigation/linkingConfig.test.ts`: lock deep-link coverage.
- `apps/mobile/src/app/navigation/appFeatureMenu.test.ts`: lock the new menu target.

---

### Task 1: Domain contracts, curated data, and deterministic session service

**Files:**
- Create: `apps/mobile/src/features/makeup-recommendation/types.ts`
- Create: `apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts`
- Create: `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts`
- Test: `apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts`

**Interfaces:**
- Consumes: `ImageSourcePropType` and `makeupFilterAssetSource` for bundled images.
- Produces: `getMakeupScenarioSet`, `startMakeupRecommendation`, `answerMakeupRecommendationQuestion`, `refineMakeupRecommendation`, `FixtureProductRecommendationProvider`, and all `MakeupRecommendation*` types.

- [ ] **Step 1: Write the failing domain contract test**

Create `makeupRecommendationService.test.ts` with executable top-level assertions matching the repository's existing contract-test style:

```ts
import {
  answerMakeupRecommendationQuestion,
  getMakeupScenarioSet,
  startMakeupRecommendation,
} from './makeupRecommendationService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const scenarios = getMakeupScenarioSet({seed: 0});
expectEqual(scenarios.length, 36, 'scenario set count');
expectEqual(new Set(scenarios.slice(0, 6).map(item => item.tone)).size, 3, 'first six tone coverage');

const started = startMakeupRecommendation({
  prompt: scenarios[0].seedPrompt,
  scenarioId: scenarios[0].id,
  useProfile: true,
  personalColor: '여름 쿨톤',
});
expectEqual(started.questions.length <= 3, true, 'question cap');

const completed = started.questions.reduce(
  (session, question, index) => answerMakeupRecommendationQuestion(session, {
    questionId: question.id,
    optionId: question.options[0].id,
    additionalConstraints: index === started.questions.length - 1 ? '글리터 제외' : undefined,
  }),
  started,
);
expectEqual(completed.phase, 'results', 'session completes');
expectEqual(completed.results.length, 3, 'three result roles');
expectEqual(completed.results.map(item => item.role).join(','), 'anchor,bold,discovery', 'result role order');
expectEqual(completed.additionalConstraints, '글리터 제외', 'final constraints preserved');
```

- [ ] **Step 2: Run typecheck and verify the missing-module failure**

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because `makeupRecommendationService` and its exports do not exist.

- [ ] **Step 3: Define focused domain types**

Create `types.ts` with these exact public shapes:

```ts
import type {ImageSourcePropType} from 'react-native';

export type MakeupScenarioTone = 'narrative' | 'playful' | 'premium';
export type MakeupScenarioSource = 'curated' | 'personalized' | 'trend' | 'wildcard';
export type MakeupQuestionDimension = 'occasion' | 'mood' | 'boldness' | 'timeSkill';
export type MakeupLookRole = 'anchor' | 'bold' | 'discovery';
export type MakeupArea = 'base' | 'eye' | 'brow' | 'cheek' | 'lip';
export type MakeupRecommendationRefinement = 'natural' | 'hip' | 'differentColor' | 'replaceProducts';

export type MakeupScenarioPrompt = {
  id: string;
  displayText: string;
  seedPrompt: string;
  intentTags: string[];
  knownDimensions: MakeupQuestionDimension[];
  tone: MakeupScenarioTone;
  source: MakeupScenarioSource;
};

export type MakeupRecommendationQuestionOption = {id: string; label: string};
export type MakeupRecommendationQuestion = {
  id: string;
  dimension: MakeupQuestionDimension;
  title: string;
  options: MakeupRecommendationQuestionOption[];
};
export type MakeupRecommendationAnswer = {
  questionId: string;
  optionId?: string;
  freeText?: string;
  additionalConstraints?: string;
};
export type MakeupRecommendationStep = {area: MakeupArea; instruction: string; order: number};
export type MakeupRecommendationProduct = {
  id: string;
  area: MakeupArea;
  brandName: string;
  productName: string;
  shadeName?: string;
  reason: string;
};
export type MakeupLookRecommendation = {
  id: string;
  role: MakeupLookRole;
  title: string;
  summary: string;
  imageSource: ImageSourcePropType;
  reasons: string[];
  appliedConditions: string[];
  durationMinutes: number;
  difficulty: 'easy' | 'medium' | 'advanced';
  steps: MakeupRecommendationStep[];
  products: MakeupRecommendationProduct[];
};
export type MakeupRecommendationSession = {
  id: string;
  phase: 'question' | 'results';
  prompt: string;
  questions: MakeupRecommendationQuestion[];
  currentQuestionIndex: number;
  answers: MakeupRecommendationAnswer[];
  additionalConstraints?: string;
  results: MakeupLookRecommendation[];
  useProfile: boolean;
  personalColor?: string;
};
export type ProductRecommendationProvider = {
  recommendProducts(lookId: string): MakeupRecommendationProduct[];
};
```

- [ ] **Step 4: Add exactly 36 prompts, deterministic questions, and coordinated look fixtures**

Create `makeupRecommendation.mock.ts`. Export `MAKEUP_SCENARIOS`, `MAKEUP_QUESTIONS`, and `MAKEUP_LOOK_FIXTURES`. Define all 36 scenarios with this exact data:

```ts
const scenario = (
  id: string,
  displayText: string,
  seedPrompt: string,
  intentTags: string[],
  knownDimensions: MakeupQuestionDimension[],
  tone: MakeupScenarioTone,
  source: MakeupScenarioSource = 'curated',
): MakeupScenarioPrompt => ({id, displayText, seedPrompt, intentTags, knownDimensions, tone, source});

export const MAKEUP_SCENARIOS: readonly MakeupScenarioPrompt[] = [
  scenario('must-look-beautiful', '오늘은 꼭 예뻐야 해', '중요한 날 가장 아름답고 자신 있어 보이는 메이크업', ['important', 'polished'], [], 'playful'),
  scenario('most-beautiful-self', '오늘의 나를 가장 아름답게', '나의 장점을 살린 균형 있고 아름다운 메이크업', ['balanced', 'premium'], [], 'premium'),
  scenario('commute-crush', '출근길 그 사람에게 오늘은 인사할 거야', '출근길에 자연스럽지만 평소보다 매력적으로 보이는 메이크업', ['commute', 'romance'], ['occasion'], 'narrative'),
  scenario('five-minute-polished', '5분 했는데 30분 공들인 척', '5분 안에 완성하지만 정교해 보이는 메이크업', ['quick', 'polished'], ['timeSkill'], 'playful'),
  scenario('trend-my-way', '요즘 무드, 나답게', '최근 메이크업 무드를 나에게 자연스럽게 적용한 룩', ['trend', 'personal'], ['mood'], 'premium', 'trend'),
  scenario('ex-wedding', '전남친 결혼식, 내가 제일 평온한 사람', '결혼식 하객 예절을 지키면서 우아하고 여유로워 보이는 메이크업', ['wedding', 'elegant'], ['occasion', 'mood'], 'narrative'),
  scenario('baseball-camera', '중계 카메라에 잡힐 야구장 여신룩', '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업', ['baseball', 'camera'], ['occasion'], 'narrative', 'trend'),
  scenario('art-student', '느좋, 느낌 좋은 미대생룩', '색감과 질감에 취향이 느껴지는 힘 뺀 메이크업', ['art', 'effortless'], ['mood'], 'playful'),
  scenario('music-heiress', '부잣집 고명딸 음대생룩', '단정한 클래식에 우아한 여유가 느껴지는 메이크업', ['classic', 'elegant'], ['mood'], 'narrative'),
  scenario('drama-comeback', '점 찍고 돌아온 드라마 16부 엔딩', '이전과 확실히 달라 보이는 세련되고 선명한 메이크업', ['transformation', 'dramatic'], ['boldness'], 'narrative'),
  scenario('camera-first', '사진첩 첫 장 예약', '사진과 조명에서 이목구비가 선명하게 살아나는 메이크업', ['photo', 'defined'], ['occasion'], 'playful'),
  scenario('well-rested', '어제 잘 잔 사람처럼 출근하기', '피곤함을 덜어 보이고 맑은 생기를 주는 출근 메이크업', ['commute', 'fresh'], ['occasion'], 'playful'),
  scenario('well-dressed', '꾸안꾸는 충분히 했고 오늘은 잘꾸', '정성 들여 꾸민 티가 나는 완성도 높은 메이크업', ['polished', 'visible'], ['boldness'], 'playful'),
  scenario('neon-two-am', '새벽 두 시 네온 아래에서 제일 예쁜 얼굴', '네온 조명에서 색과 광택이 매력적으로 보이는 메이크업', ['night', 'neon'], ['occasion', 'mood'], 'premium'),
  scenario('ai-story', 'AI야, 오늘 내 얼굴에 서사 좀 줘', '평소 취향에서 벗어난 이야기 있는 메이크업을 자유롭게 추천', ['wildcard', 'story'], [], 'playful', 'wildcard'),
  scenario('unfamiliar-me', '낯설지만 나다운 변화', '본래 인상은 살리면서 새롭게 느껴지는 메이크업', ['change', 'personal'], ['boldness'], 'premium'),
  scenario('wedding-balance', '특별한 날의 완벽한 밸런스', '격식 있는 자리에서 화사하고 균형 잡힌 메이크업', ['special', 'balanced'], ['occasion'], 'premium'),
  scenario('light-photo', '빛과 사진에 아름다운 룩', '자연광과 사진에서 피부 표현과 색조가 조화로운 메이크업', ['light', 'photo'], ['occasion'], 'premium'),
  scenario('glasses-eyes', '안경을 써도 눈매는 살아남게', '안경테에 가리지 않고 또렷해 보이는 아이 메이크업', ['glasses', 'eye'], ['occasion'], 'playful'),
  scenario('concert-encore', '앵콜까지 살아남는 콘서트 메이크업', '열기와 긴 시간에도 포인트가 유지되는 콘서트 메이크업', ['concert', 'lasting'], ['occasion'], 'narrative'),
  scenario('festival-sunset', '해 질 때 제일 예쁜 페스티벌룩', '낮부터 노을과 밤 조명까지 어울리는 페스티벌 메이크업', ['festival', 'sunset'], ['occasion'], 'narrative', 'trend'),
  scenario('second-date', '첫 데이트보다 중요한 두 번째 데이트', '편안함과 설렘이 함께 느껴지는 두 번째 데이트 메이크업', ['date', 'romance'], ['occasion'], 'narrative'),
  scenario('not-a-blind-date', '소개팅은 아닌데 소개팅처럼 준비하고 싶어', '과하지 않지만 첫인상이 좋은 약속 메이크업', ['meeting', 'first-impression'], ['occasion'], 'playful'),
  scenario('one-lip', '립 하나로 약속 있는 사람 되기', '립을 중심으로 최소 단계로 분위기를 완성하는 메이크업', ['lip', 'quick'], ['timeSkill'], 'playful'),
  scenario('no-plans', '약속 없어도 조금 특별하게', '일상에서 부담 없이 기분을 바꾸는 특별한 메이크업', ['daily', 'special'], ['occasion'], 'premium'),
  scenario('natural-balance', '자연스럽고 균형 잡힌 룩', '얼굴의 장점을 해치지 않는 자연스럽고 균형 잡힌 메이크업', ['natural', 'balanced'], ['mood'], 'premium'),
  scenario('quiet-luxury', '말하지 않아도 우아하게', '과한 색보다 정돈된 피부와 섬세한 음영이 돋보이는 메이크업', ['elegant', 'quiet'], ['mood'], 'premium'),
  scenario('hip-point', '힙한 포인트 하나만', '전체는 정돈하고 한 부위에 감각적인 포인트를 준 메이크업', ['hip', 'point'], ['mood'], 'playful'),
  scenario('one-spoon-bold', '평소보다 한 스푼 과감하게', '평소 스타일을 기반으로 색이나 라인을 조금 더 과감하게 쓴 메이크업', ['bold', 'personal'], ['boldness'], 'playful'),
  scenario('ai-pick', '오늘의 룩, AI가 골라줘', '상황과 분석 결과를 참고해 오늘의 메이크업을 자유롭게 추천', ['ai', 'wildcard'], [], 'premium', 'wildcard'),
  scenario('saved-look', '저장만 하던 룩, 오늘은 직접', '온라인에서 저장하던 트렌디한 룩을 현실적으로 적용한 메이크업', ['saved', 'trend'], ['mood'], 'narrative', 'trend'),
  scenario('commute-runway', '출근인데 런웨이 가능?', '업무 환경을 지키면서 실루엣이 또렷한 출근 메이크업', ['commute', 'fashion'], ['occasion'], 'playful'),
  scenario('reunion', '동창회에서 “너 뭐 했어?”라는 말 듣기', '과거보다 세련되고 여유로워 보이는 동창회 메이크업', ['reunion', 'transformation'], ['occasion'], 'narrative'),
  scenario('bookstore-owner', '새벽까지 책 읽는 독립서점 주인룩', '차분한 색과 지적인 분위기가 느껴지는 메이크업', ['bookstore', 'calm'], ['mood'], 'narrative'),
  scenario('film-senior', '말수 적은 영화과 선배룩', '절제된 색감과 깊은 눈매가 인상적인 메이크업', ['cinema', 'moody'], ['mood'], 'narrative'),
  scenario('gallery-weekend', '주말마다 전시 보러 다니는 사람처럼', '힘을 뺀 피부와 감각적인 색 포인트의 주말 메이크업', ['gallery', 'weekend'], ['occasion', 'mood'], 'premium'),
];
```

Build three fixtures using existing bundled images `community-lookbook-rose.png`, `community-question-smoky.png`, and `community-combo-muted.png`, with five ordered makeup steps and at least four coordinated products per look.

- [ ] **Step 5: Implement deterministic scenario selection and adaptive transitions**

Create `makeupRecommendationService.ts` with these behaviors:

```ts
export function getMakeupScenarioSet({seed}: {seed: number}): MakeupScenarioPrompt[] {
  const offset = Math.abs(Math.floor(seed)) % MAKEUP_SCENARIOS.length;
  const rotated = [...MAKEUP_SCENARIOS.slice(offset), ...MAKEUP_SCENARIOS.slice(0, offset)];
  const firstSix = ensureToneCoverage(rotated);
  return [...firstSix, ...rotated.filter(item => !firstSix.some(first => first.id === item.id))].slice(0, 36);
}

export function startMakeupRecommendation(input: StartMakeupRecommendationInput): MakeupRecommendationSession {
  const scenario = MAKEUP_SCENARIOS.find(item => item.id === input.scenarioId);
  const known = new Set(scenario?.knownDimensions ?? inferKnownDimensions(input.prompt));
  const questions = QUESTION_PRIORITY
    .filter(dimension => !known.has(dimension))
    .slice(0, 3)
    .map(dimension => MAKEUP_QUESTIONS[dimension]);
  return questions.length === 0
    ? buildCompletedSession(input, [])
    : buildQuestionSession(input, questions);
}

export function answerMakeupRecommendationQuestion(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
): MakeupRecommendationSession {
  const expected = session.questions[session.currentQuestionIndex];
  if (!expected || expected.id !== answer.questionId) throw new Error('현재 질문과 맞지 않는 답변이에요.');
  const answers = [...session.answers, answer];
  const nextIndex = session.currentQuestionIndex + 1;
  return nextIndex >= session.questions.length
    ? completeSession(session, answers, answer.additionalConstraints?.trim())
    : {...session, answers, currentQuestionIndex: nextIndex};
}

export function refineMakeupRecommendation(
  session: MakeupRecommendationSession,
  refinement: MakeupRecommendationRefinement,
): MakeupRecommendationSession {
  if (session.phase !== 'results') throw new Error('추천 결과가 나온 뒤에 조정할 수 있어요.');
  return {...session, results: applyFixtureRefinement(session.results, refinement)};
}
```

`completeSession` must call `FixtureProductRecommendationProvider`, merge personal color only into `appliedConditions`, and ensure the latest free text/additional constraints appear before inferred conditions. `applyFixtureRefinement` must update summaries and conditions deterministically for `natural`, `hip`, and `differentColor`, while `replaceProducts` rotates each look's product fixture without changing its makeup steps.

- [ ] **Step 6: Run typecheck and verify the domain contracts pass**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit the domain slice**

```bash
git add apps/mobile/src/features/makeup-recommendation/types.ts apps/mobile/src/features/makeup-recommendation/mocks/makeupRecommendation.mock.ts apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.test.ts
git commit -m "feat(makeup-recommendation): add scenario session domain"
```

---

### Task 2: Editorial scenario discovery screen

**Files:**
- Create: `apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx`
- Create: `apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx`
- Test: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`

**Interfaces:**
- Consumes: `MakeupScenarioPrompt`, shared `AppCard`, theme tokens, and callbacks from the controller.
- Produces: `ScenarioDiscoveryView`, `getScenarioCardEmphasis`, and stable first-screen copy constants.

- [ ] **Step 1: Write failing first-screen contract assertions**

Create `MakeupRecommendationScreen.test.ts`:

```ts
import {
  getScenarioCardEmphasis,
  makeupRecommendationDiscoveryCopy,
} from './ScenarioDiscoveryView';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

expectEqual(makeupRecommendationDiscoveryCopy.title, '오늘, 어떤 내가 되어볼까요?', 'discovery title');
expectEqual(makeupRecommendationDiscoveryCopy.refresh, '새로운 시나리오 보여줘', 'refresh copy');
expectEqual(getScenarioCardEmphasis(0), 'featured', 'first card emphasis');
expectEqual(getScenarioCardEmphasis(1), 'regular', 'second card emphasis');
expectEqual(getScenarioCardEmphasis(6), 'featured', 'seventh card emphasis');
```

- [ ] **Step 2: Run typecheck and verify missing view exports fail**

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because `ScenarioDiscoveryView` does not exist.

- [ ] **Step 3: Implement the prompt card**

`ScenarioPromptCard` must use `AppCard`, a minimum 48-point touch target, one- or two-line text, tone-specific but token-based surface treatment, and `accessibilityLabel={`${scenario.displayText} 시나리오 선택`}`. Featured cards use more vertical padding and span the available width; regular cards render in a two-column `XStack` layout.

- [ ] **Step 4: Implement the discovery view**

`ScenarioDiscoveryView` must render:

```tsx
<AppScreen topPadding="belowShellHeader" contentGap={spacing.lg}>
  <YStack gap={spacing.sm}>
    <Text>{makeupRecommendationDiscoveryCopy.eyebrow}</Text>
    <Text>{makeupRecommendationDiscoveryCopy.title}</Text>
    <Text>{makeupRecommendationDiscoveryCopy.description}</Text>
  </YStack>
  <PromptComposer value={prompt} onChangeText={onChangePrompt} onSubmit={onSubmitPrompt} />
  <ProfileContextRow enabled={useProfile} personalColor={personalColor} onChange={onChangeUseProfile} />
  <ScenarioPromptWall scenarios={scenarios} onSelect={onSelectScenario} />
  <Pressable onPress={onRefreshScenarios}><Text>새로운 시나리오 보여줘</Text></Pressable>
</AppScreen>
```

Use a standard multiline `TextInput` with the placeholder `원하는 느낌이나 상황을 직접 들려주세요`. Disable submit only when trimmed text is empty. If no personal color exists, show `분석 결과 없이 추천` and do not render an enabled switch. Maintain 36 cards, generous vertical spacing, and readable type rather than shrinking all prompts into one viewport.

- [ ] **Step 5: Run typecheck and verify the discovery contracts pass**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the discovery UI**

```bash
git add apps/mobile/src/features/makeup-recommendation/components/ScenarioPromptCard.tsx apps/mobile/src/features/makeup-recommendation/screens/ScenarioDiscoveryView.tsx apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts
git commit -m "feat(makeup-recommendation): build scenario discovery wall"
```

---

### Task 3: Adaptive questions, results, and screen controller

**Files:**
- Create: `apps/mobile/src/features/makeup-recommendation/screens/RecommendationQuestionView.tsx`
- Create: `apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsView.tsx`
- Create: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.tsx`
- Modify: `apps/mobile/src/features/makeup-recommendation/screens/MakeupRecommendationScreen.test.ts`
- Create: `apps/mobile/src/features/makeup-recommendation/index.ts`

**Interfaces:**
- Consumes: Task 1 session service and Task 2 discovery view.
- Produces: `MakeupRecommendationScreen`, `getQuestionActionMode`, `makeupRecommendationResultRoleLabels`, and public feature exports.

- [ ] **Step 1: Extend the failing screen contract test**

Append:

```ts
import {getQuestionActionMode} from './RecommendationQuestionView';
import {makeupRecommendationResultRoleLabels} from './RecommendationResultsView';

expectEqual(getQuestionActionMode({currentQuestionIndex: 0, questionCount: 2}), 'advance', 'early question advances');
expectEqual(getQuestionActionMode({currentQuestionIndex: 1, questionCount: 2}), 'complete', 'last question completes');
expectEqual(makeupRecommendationResultRoleLabels.anchor, '가장 잘 어울리는 룩', 'anchor label');
expectEqual(makeupRecommendationResultRoleLabels.bold, '조금 더 과감한 룩', 'bold label');
expectEqual(makeupRecommendationResultRoleLabels.discovery, '예상 밖의 발견', 'discovery label');
```

- [ ] **Step 2: Run typecheck and verify missing question/result views fail**

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL on the new imports.

- [ ] **Step 3: Implement the keyboard-safe question view**

Render question title, four to six pressable option cards, and a free-text composer inside `KeyboardAvoidingView`. For non-final questions, option selection calls `onAnswer({questionId, optionId})` immediately. For the final question, preserve the selected option locally and render:

```tsx
<XStack justifyContent="space-between" alignItems="center">
  <Pressable onPress={() => setConditionInputVisible(value => !value)}>
    <Text>+ 조건 추가</Text>
  </Pressable>
  <Button disabled={!selectedOptionId && !freeText.trim()} onPress={handleComplete}>
    추천받기
  </Button>
</XStack>
```

When expanded, the condition input placeholder is `예: 글리터 제외, 립 강조, 15분 이내`. Submitting it must include `additionalConstraints` in the same answer call; it must not create another question.

- [ ] **Step 4: Implement the three-role result view**

Use a vertical list of three image-first cards. Each card shows role label, title, summary, duration, difficulty, reasons, ordered area instructions, and coordinated products grouped by area. Provide local save toggles, `AR로 적용하기`, and refinement actions `더 자연스럽게`, `더 힙하게`, `다른 색으로`, `제품만 바꾸기`. Export the exact role labels from the test. If results are empty, show `추천 결과를 준비하지 못했어요` and a retry button.

- [ ] **Step 5: Implement the phase controller**

`MakeupRecommendationScreen` owns only:

```ts
type ScreenPhase = 'discovery' | 'loading' | 'question' | 'results' | 'error';
```

It initializes `getMakeupScenarioSet`, starts sessions from prompt/scenario selection, advances with `answerMakeupRecommendationQuestion`, refines through `refineMakeupRecommendation`, passes `session.results` to the result view, and restores discovery on reset. Wrap service calls in `Promise.resolve` so a later async backend replacement does not change view callbacks. Preserve the last start input for retry. Do not add timers merely to simulate AI latency.

- [ ] **Step 6: Export the feature boundary**

Create `index.ts` exporting only `MakeupRecommendationScreen` and public types needed by navigation. Do not re-export mocks or internal views.

- [ ] **Step 7: Run typecheck and verify the complete feature passes**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the complete feature flow**

```bash
git add apps/mobile/src/features/makeup-recommendation/screens apps/mobile/src/features/makeup-recommendation/index.ts
git commit -m "feat(makeup-recommendation): add adaptive recommendation flow"
```

---

### Task 4: Navigation route, deep link, and chrome integration

**Files:**
- Create: `apps/mobile/src/app/navigation/routes/makeupRecommendationRoutes.tsx`
- Modify: `apps/mobile/src/app/navigation/routeTypes.ts`
- Modify: `apps/mobile/src/app/navigation/RootNavigator.tsx`
- Modify: `apps/mobile/src/app/navigation/routeChrome.ts`
- Modify: `apps/mobile/src/app/navigation/linkingConfig.ts`
- Modify: `apps/mobile/src/app/navigation/navigation.test.ts`
- Modify: `apps/mobile/src/app/navigation/linkingConfig.test.ts`

**Interfaces:**
- Consumes: `MakeupRecommendationScreen`, `selectedFaceAnalysisReport.personalColor`, `DetailRouteChrome`, and `ARFilter` navigation.
- Produces: `MakeupRecommendation` root route and `makeup-recommendation` deep link.

- [ ] **Step 1: Add failing navigation contract assertions**

Add to `navigation.test.ts`:

```ts
expectEqual(getRouteChrome('MakeupRecommendation').kind, 'detail', 'makeup recommendation chrome');
expectEqual(getDetailRouteTitle('MakeupRecommendation'), 'AI 메이크업 추천', 'makeup recommendation title');
```

Add to `linkingConfig.test.ts`:

```ts
type MakeupRecommendationPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.MakeupRecommendation, 'makeup-recommendation'>
>;
expectEqual(rootStackLinkingScreens.MakeupRecommendation, 'makeup-recommendation', 'makeup recommendation path');
```

- [ ] **Step 2: Run typecheck and verify missing route errors**

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because `MakeupRecommendation` is not in `RootStackParamList`.

- [ ] **Step 3: Register the route contract**

Add `MakeupRecommendation: undefined` to `RootStackParamList`, add it immediately after `ProductRecommendation` in `rootStackRoutes`, add `MakeupRecommendation: 'makeup-recommendation'` to `rootStackLinkingScreens`, and add this chrome entry:

```ts
MakeupRecommendation: {
  category: 'feature-entry',
  contextLabel: 'MAKEUP RECOMMENDATION',
  depth: 'sub',
  kind: 'detail',
  statusBarStyle: 'dark',
  title: 'AI 메이크업 추천',
},
```

- [ ] **Step 4: Add the navigation wrapper without touching Auradin routes**

Create `makeupRecommendationRoutes.tsx`:

```tsx
export function MakeupRecommendationRouteScreen({navigation}: RootScreenProps<'MakeupRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();
  return (
    <DetailRouteChrome routeName="MakeupRecommendation" onBack={() => navigation.goBack()}>
      <MakeupRecommendationScreen
        personalColor={selectedFaceAnalysisReport?.personalColor}
        onApplyLook={() => navigation.navigate('ARFilter', {source: 'recommendedFilter'})}
      />
    </DetailRouteChrome>
  );
}
```

Import and register this wrapper in `RootNavigator.tsx`. Do not edit `recommendationRoutes.tsx` or the existing `AuradinSearch` registration.

- [ ] **Step 5: Run typecheck and verify all route/linking contracts pass**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS, and the missing/unknown linking helpers remain empty.

- [ ] **Step 6: Commit navigation integration**

```bash
git add apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app/navigation/RootNavigator.tsx apps/mobile/src/app/navigation/routeChrome.ts apps/mobile/src/app/navigation/linkingConfig.ts apps/mobile/src/app/navigation/navigation.test.ts apps/mobile/src/app/navigation/linkingConfig.test.ts apps/mobile/src/app/navigation/routes/makeupRecommendationRoutes.tsx
git commit -m "feat(makeup-recommendation): register mobile route"
```

---

### Task 5: Feature-menu entry and final regression verification

**Files:**
- Modify: `apps/mobile/src/app/navigation/appFeatureMenu.ts`
- Modify: `apps/mobile/src/app/navigation/appFeatureMenu.test.ts`
- Modify: `apps/mobile/src/app/navigation/routes/routeUtils.tsx`

**Interfaces:**
- Consumes: the `MakeupRecommendation` route from Task 4.
- Produces: a visible `AI 메이크업 추천` entry under `분석과 추천`.

- [ ] **Step 1: Add the failing feature-menu contract**

Append to `appFeatureMenu.test.ts`:

```ts
const makeupRecommendationTarget = getAppFeatureMenuTarget('makeupRecommendation');
expectEqual(makeupRecommendationTarget.kind, 'root', 'makeup recommendation target kind');
expectEqual(
  makeupRecommendationTarget.kind === 'root' ? makeupRecommendationTarget.routeName : null,
  'MakeupRecommendation',
  'makeup recommendation target route',
);
expectEqual(
  analysisSection?.items.some(item => item.label === 'AI 메이크업 추천'),
  true,
  'analysis menu includes makeup recommendation',
);
```

- [ ] **Step 2: Run typecheck and verify the unknown item failure**

Run: `npm --prefix apps/mobile run typecheck`

Expected: FAIL because `makeupRecommendation` is not an `AppFeatureMenuItemId`.

- [ ] **Step 3: Add the menu item and route dispatcher**

Add `makeupRecommendation` to `AppFeatureMenuItemId`, add `MakeupRecommendation` to `AppFeatureMenuRootRouteName`, and place this item before `productRecommendation`:

```ts
{
  id: 'makeupRecommendation',
  label: 'AI 메이크업 추천',
  description: '오늘의 시나리오를 고르고 나만의 룩을 추천받아요.',
  target: {kind: 'root', routeName: 'MakeupRecommendation'},
},
```

Add an explicit `MakeupRecommendation` branch to `navigateAppFeatureRootRoute` in `routeUtils.tsx`.

- [ ] **Step 4: Run the complete mobile verification**

Run: `npm --prefix apps/mobile run typecheck`

Expected: PASS with zero TypeScript errors.

Run: `git diff --name-only HEAD~4..HEAD`

Expected: no path under `apps/mobile/src/features/recommendation/`, `services/backend/app/services/auradin_agent/`, `services/backend/app/services/auradin_catalog/`, or `data/auradin/`.

Run: `git status --short`

Expected: only the user's pre-existing iOS changes and unrelated untracked plan remain outside this feature's committed files.

- [ ] **Step 5: Perform manual simulator checks**

Open the app feature menu and verify:

1. `AI 메이크업 추천` opens the independent route.
2. The first screen shows readable prompt cards and can scroll through 36 entries.
3. Refresh changes order while preserving 36 entries and first-six tone coverage.
4. Selecting a detailed scenario asks fewer questions than a broad prompt.
5. Free text can replace an option on every question.
6. Only the final question exposes `+ 조건 추가` and it does not create another turn.
7. Results show exactly anchor, bold, and discovery looks with steps and products.
8. Back returns safely; AR CTA opens the existing AR route.
9. Existing Auradin entry and behavior are unchanged.

- [ ] **Step 6: Commit the entry point**

```bash
git add apps/mobile/src/app/navigation/appFeatureMenu.ts apps/mobile/src/app/navigation/appFeatureMenu.test.ts apps/mobile/src/app/navigation/routes/routeUtils.tsx
git commit -m "feat(makeup-recommendation): add feature menu entry"
```

---

## Deferred Backend Plan

After the mobile MVP is accepted, create a separate plan for:

- `GET /api/makeup/scenarios`
- `POST /api/makeup/recommendation-sessions`
- adaptive session polling and answers
- structured three-look generation
- independent production product provider
- QA-only `AuradinComparisonProvider` behind a feature flag
- backend ownership, TTL, fallback, and API tests

This deferred work must preserve the mobile contracts defined in Task 1 and must not modify Auradin code.
