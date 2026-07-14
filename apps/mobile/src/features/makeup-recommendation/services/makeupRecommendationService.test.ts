import {
  answerGeneratedMakeupRecommendationQuestion,
  answerMakeupRecommendationQuestion,
  getFallbackMakeupScenarios,
  getMakeupScenarioSet,
  mapBackendScenarioItems,
  mapBackendRecommendationLooks,
  refineMakeupRecommendation,
  startGeneratedMakeupRecommendation,
  startMakeupRecommendation,
} from './makeupRecommendationService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectThrows(action: () => unknown, label: string) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  expectEqual(threw, true, label);
}

const scenarios = getMakeupScenarioSet({seed: 0});
expectEqual(scenarios.length, 49, 'scenario set count');
expectEqual(new Set(scenarios.slice(0, 6).map(item => item.tone)).size, 3, 'first six tone coverage');
expectEqual(new Set(scenarios.map(item => item.copyStyle)).size, 5, 'five copy styles represented');
expectEqual(
  scenarios.every(item => item.preferredColumnSpan >= 3 && item.preferredColumnSpan <= 8),
  true,
  'puzzle spans stay in range',
);
expectEqual(scenarios.some(item => item.palette === 'accent'), true, 'accent chips represented');
expectEqual(
  scenarios.some(item => /여신|남신|고명딸/.test(item.displayText)),
  false,
  'default copy is gender neutral',
);
expectEqual(
  scenarios.filter(item => item.displayText.includes('오늘')).length <= 2,
  true,
  'today copy is not overused',
);

const generatedScenarios = mapBackendScenarioItems([
  {id: 'generated-1', text: '비 오는 날', seedPrompt: '비 오는 날 차분한 메이크업', tags: ['차분']},
  {id: 'generated-2', text: '기분 전환', seedPrompt: '산뜻한 색으로 기분을 바꾸는 메이크업', tags: ['산뜻']},
]);
expectEqual(generatedScenarios.length, 2, 'backend scenarios are mapped');
expectEqual(generatedScenarios[0].displayText, '비 오는 날', 'backend display text is preserved');
expectEqual(generatedScenarios[0].intentTags[0], '차분', 'backend tags are preserved');
expectEqual(generatedScenarios[0].seedPrompt, '비 오는 날 차분한 메이크업', 'backend seed prompt is preserved');

const fallbackScenarios = getFallbackMakeupScenarios({
  count: 12,
  excludeTexts: scenarios.slice(0, 12).map(item => item.displayText),
  seed: 12,
});
expectEqual(fallbackScenarios.length, 12, 'local fallback scenario count');
expectEqual(
  fallbackScenarios.some(item => scenarios.slice(0, 12).some(seen => seen.displayText === item.displayText)),
  false,
  'local fallback excludes cards already shown',
);

const generatedLooks = mapBackendRecommendationLooks({
  reportId: 'report-1',
  prompt: '퇴근 후 약속',
  questions: [],
  answers: [],
  recommendation: {
    looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
      id: `look-${index + 1}`,
      role,
      title: role,
      summary: `${role} summary`,
      reasons: ['선택 이유'],
      appliedConditions: ['퇴근 후 약속'],
      durationMinutes: 15,
      difficulty: 'medium',
      steps: [{order: 1, area: 'base', instruction: '얇게 바르기'}],
      products: [{area: 'base', brandName: '브랜드', productName: '쿠션', reason: '얇은 표현'}],
    })),
  },
});
expectEqual(generatedLooks.length, 3, 'three backend looks are mapped');
expectEqual(generatedLooks.map(look => look.role).join(','), 'anchor,bold,discovery', 'backend look roles are preserved');

const started = startMakeupRecommendation({
  prompt: scenarios[0].seedPrompt,
  scenarioId: scenarios[0].id,
  useProfile: true,
  personalColor: '여름 쿨톤',
});
expectEqual(started.questions.length, 2, 'curated question cap');

const broadCustom = startMakeupRecommendation({
  prompt: '오늘 메이크업을 추천해줘',
  useProfile: false,
});
expectEqual(broadCustom.questions.length, 3, 'broad custom question cap');

expectThrows(
  () => answerMakeupRecommendationQuestion(started, {
    questionId: started.questions[0].id,
    optionId: 'not-an-option',
  }),
  'arbitrary option rejected',
);
expectThrows(
  () => answerMakeupRecommendationQuestion(started, {
    questionId: started.questions[0].id,
    freeText: '   ',
  }),
  'empty free text rejected',
);

const freeTextAnswered = answerMakeupRecommendationQuestion(started, {
  questionId: started.questions[0].id,
  freeText: '조명에서 맑게',
});
expectEqual(freeTextAnswered.answers[0].freeText, '조명에서 맑게', 'free text accepted');

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

const constrainedAfterFirst = answerMakeupRecommendationQuestion(started, {
  questionId: started.questions[0].id,
  optionId: started.questions[0].options[0].id,
  additionalConstraints: '향료 성분 제외',
});
expectEqual(
  constrainedAfterFirst.additionalConstraints,
  '향료 성분 제외',
  'intermediate constraints preserved',
);
const constrainedCompleted = answerMakeupRecommendationQuestion(constrainedAfterFirst, {
  questionId: started.questions[1].id,
  optionId: started.questions[1].options[0].id,
});
expectEqual(
  constrainedCompleted.additionalConstraints,
  '향료 성분 제외',
  'earlier constraints survive completion',
);
expectEqual(
  constrainedCompleted.results[0].appliedConditions[0],
  '향료 성분 제외',
  'latest constraints are first result condition',
);

expectEqual(
  constrainedCompleted.results.map(result => result.arFilterId).join(','),
  'filter-milky-strawberry-pink,filter-clean-smoky-city,filter-plum-syrup-gloss',
  'results map to distinct AR filters',
);

const productsOnce = refineMakeupRecommendation(constrainedCompleted, 'replaceProducts');
const productsTwice = refineMakeupRecommendation(productsOnce, 'replaceProducts');
expectEqual(
  productsOnce.results[0].products[0].id === productsTwice.results[0].products[0].id,
  false,
  'repeated product replacement rotates products',
);

const natural = refineMakeupRecommendation(constrainedCompleted, 'natural');
const hipAfterNatural = refineMakeupRecommendation(natural, 'hip');
const hipRepeated = refineMakeupRecommendation(hipAfterNatural, 'hip');
expectEqual(
  hipAfterNatural.results[0].appliedConditions.includes('더 자연스럽게'),
  false,
  'new refinement replaces old condition',
);
expectEqual(
  hipRepeated.results[0].summary,
  hipAfterNatural.results[0].summary,
  'repeated refinement does not duplicate summary',
);

async function expectGeneratedFlowFallsBackLocally() {
  async function failingBackendRequest<T>(): Promise<T> {
    throw new Error('backend unavailable');
  }

  const fallbackStarted = await startGeneratedMakeupRecommendation(
    {
      prompt: scenarios[0].seedPrompt,
      scenarioId: scenarios[0].id,
      useProfile: false,
    },
    scenarios[0].intentTags,
    failingBackendRequest,
  );
  expectEqual(fallbackStarted.generationMode, 'localFallback', 'question failure uses local fallback');

  let fallbackCompleted = fallbackStarted;
  for (const question of fallbackStarted.questions) {
    fallbackCompleted = await answerGeneratedMakeupRecommendationQuestion(
      fallbackCompleted,
      {questionId: question.id, optionId: question.options[0].id},
      scenarios[0].intentTags,
      failingBackendRequest,
    );
  }
  expectEqual(fallbackCompleted.phase, 'results', 'fallback flow completes');
  expectEqual(fallbackCompleted.results.length, 3, 'fallback flow returns three looks');
  expectEqual(fallbackCompleted.generationMode, 'localFallback', 'fallback mode remains visible');
}

void expectGeneratedFlowFallsBackLocally().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
