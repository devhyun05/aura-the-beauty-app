import {
  answerMakeupRecommendationQuestion,
  getMakeupScenarioSet,
  refineMakeupRecommendation,
  startMakeupRecommendation,
} from './makeupRecommendationService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function expectRejects(action: () => Promise<unknown>, label: string) {
  let threw = false;
  try {
    await action();
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

async function runAsyncContracts() {
  const started = await startMakeupRecommendation({
    prompt: scenarios[0].seedPrompt,
    scenarioId: scenarios[0].id,
    useProfile: true,
    personalColor: '여름 쿨톤',
  });
  expectEqual(started.questions.length, 2, 'curated question cap');

  const broadCustom = await startMakeupRecommendation({
    prompt: '오늘 메이크업을 추천해줘',
    useProfile: false,
  });
  expectEqual(broadCustom.questions.length, 3, 'broad custom question cap');

  await expectRejects(
    () => answerMakeupRecommendationQuestion(started, {
      questionId: started.questions[0].id,
      optionId: 'not-an-option',
    }),
    'arbitrary option rejected',
  );
  await expectRejects(
    () => answerMakeupRecommendationQuestion(started, {
      questionId: started.questions[0].id,
      freeText: '   ',
    }),
    'empty free text rejected',
  );

  const freeTextAnswered = await answerMakeupRecommendationQuestion(started, {
    questionId: started.questions[0].id,
    freeText: '조명에서 맑게',
  });
  expectEqual(freeTextAnswered.answers[0].freeText, '조명에서 맑게', 'free text accepted');

  const constrainedAfterFirst = await answerMakeupRecommendationQuestion(started, {
    questionId: started.questions[0].id,
    optionId: started.questions[0].options[0].id,
    additionalConstraints: '향료 성분 제외',
  });
  expectEqual(
    constrainedAfterFirst.additionalConstraints,
    '향료 성분 제외',
    'intermediate constraints preserved before live generation',
  );

  await expectRejects(
    () => refineMakeupRecommendation(constrainedAfterFirst, 'natural'),
    'refinement requires generated results',
  );
}

void runAsyncContracts().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
