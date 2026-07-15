import {
  answerGeneratedMakeupRecommendationQuestion,
  answerMakeupRecommendationQuestion,
  getMakeupScenarioSet,
  getPopularMakeupScenarios,
  mapBackendRecommendationReports,
  mapBackendRecommendationLooks,
  refineGeneratedMakeupRecommendation,
  refineMakeupRecommendation,
  refreshGeneratedMakeupRecommendation,
  restoreMakeupRecommendationReport,
  startGeneratedMakeupRecommendation,
  startMakeupRecommendation,
} from './makeupRecommendationService';
import {BackendApiError, requestBackendJson} from '../../../shared/services/backendApi';
import type {MakeupRecommendationSession} from '../types';

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
const popularScenarios = getPopularMakeupScenarios();
expectEqual(popularScenarios.length, 5, 'popular scenario count');
expectEqual(
  popularScenarios.map(item => item.displayText).join('|'),
  '데일리로 자연스럽게|출근·등교 단정하게|데이트·약속에서 매력적으로|사진에서 또렷하게|중요한 날 오래 유지되게',
  'popular scenario order and copy stay fixed',
);
expectEqual(
  scenarios.some(item => popularScenarios.some(popular => popular.id === item.id)),
  false,
  'general scenario pool excludes popular scenarios',
);
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

expectEqual(
  getMakeupScenarioSet({seed: 0}).map(item => item.id).join(','),
  scenarios.map(item => item.id).join(','),
  'same seed keeps general scenario order stable',
);
expectEqual(
  getMakeupScenarioSet({seed: 17}).map(item => item.id).join(',') === scenarios.map(item => item.id).join(','),
  false,
  'new seed reshuffles general scenarios',
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

const reportHistory = mapBackendRecommendationReports([
  {
    id: 'report-1',
    scenarioText: '퇴근 후 약속',
    recommendation: {
      looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
        id: `saved-look-${index + 1}`,
        role,
        title: `${role} title`,
        summary: `${role} summary`,
        reasons: ['저장된 추천 이유'],
        appliedConditions: ['퇴근 후 약속'],
        durationMinutes: 20,
        difficulty: 'medium',
        steps: [{order: 1, area: 'base', instruction: '얇게 바르기'}],
        products: [{area: 'base', brandName: '브랜드', productName: '쿠션', reason: '얇은 표현'}],
      })),
    },
    imageStatus: 'completed',
    createdAt: '2026-07-14T12:34:56Z',
  },
]);
expectEqual(reportHistory.length, 1, 'saved report history count');
expectEqual(reportHistory[0].reportId, 'report-1', 'saved report id');
expectEqual(reportHistory[0].scenarioText, '퇴근 후 약속', 'saved report scenario');
expectEqual(reportHistory[0].results.length, 3, 'saved report restores three looks');
expectEqual(reportHistory[0].results[0].title, 'anchor title', 'saved report restores look copy');
const restoredReport = restoreMakeupRecommendationReport(reportHistory[0]);
expectEqual(restoredReport.phase, 'results', 'saved report opens in results phase');
expectEqual(restoredReport.reportId, 'report-1', 'restored session keeps report id');
expectEqual(restoredReport.generationMode, 'backend', 'restored report is server-backed');
expectEqual(restoredReport.results.length, 3, 'restored session keeps all looks');

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

async function expectGeneratedQuestionFailureIsSurfaced() {
  async function failingBackendRequest<T>(): Promise<T> {
    throw new Error('backend unavailable');
  }

  let error: unknown;
  try {
    await startGeneratedMakeupRecommendation(
      {
        prompt: scenarios[0].seedPrompt,
        scenarioId: scenarios[0].id,
        useProfile: false,
      },
      scenarios[0].intentTags,
      failingBackendRequest,
    );
  } catch (caught) {
    error = caught;
  }
  expectEqual(error instanceof Error, true, 'question generation failure is surfaced');
  expectEqual((error as Error).message, 'backend unavailable', 'question failure is not replaced by local fallback');
}

async function expectGeneratedQuestionsRejectSixOptions() {
  async function sixOptionBackendRequest<T>(): Promise<T> {
    return {
      questions: [{
        id: 'mood',
        title: '어떤 방향이 좋아요?',
        options: Array.from({length: 6}, (_, index) => ({
          id: `option-${index + 1}`,
          label: index === 5 ? 'AI가 골라줘' : `선택 ${index + 1}`,
        })),
      }],
    } as T;
  }

  let error: unknown;
  try {
    await startGeneratedMakeupRecommendation(
      {prompt: '긴 하루 뒤 약속', useProfile: false},
      [],
      sixOptionBackendRequest,
    );
  } catch (caught) {
    error = caught;
  }

  expectEqual(error instanceof Error, true, 'six-option backend question is rejected');
  expectEqual(
    (error as Error).message,
    '추천 질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.',
    'malformed option count is surfaced instead of displayed',
  );
}

async function expectAuthFailureDoesNotMasqueradeAsFallback() {
  async function unauthorizedBackendRequest<T>(): Promise<T> {
    throw new BackendApiError('로그인이 만료됐어요.', 401, 'AUTH_REQUIRED');
  }

  let error: unknown;
  try {
    await startGeneratedMakeupRecommendation(
      {prompt: '긴 하루 뒤 약속', useProfile: false},
      [],
      unauthorizedBackendRequest,
    );
  } catch (caught) {
    error = caught;
  }

  expectEqual(error instanceof BackendApiError, true, 'auth error is surfaced instead of local fallback');
}

async function expectAbortSignalIsForwarded() {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  async function backendRequest<T>(
    _path: string,
    init?: Parameters<typeof requestBackendJson>[1],
  ): Promise<T> {
    receivedSignal = init?.signal;
    return {
      questions: [{
        id: 'mood',
        title: '어떤 방향이 좋아요?',
        options: Array.from({length: 4}, (_, index) => ({
          id: `option-${index + 1}`,
          label: index === 3 ? 'AI가 골라줘' : `선택 ${index + 1}`,
        })),
      }],
    } as T;
  }

  await startGeneratedMakeupRecommendation(
    {prompt: '긴 하루 뒤 약속', useProfile: false},
    [],
    backendRequest,
    controller.signal,
  );

  expectEqual(receivedSignal, controller.signal, 'screen cancellation signal reaches backend request');
}

async function expectGeneratedBackendFlowCompletesAndKeepsSavedReport() {
  let callCount = 0;
  const requestBodies: unknown[] = [];
  async function successfulBackendRequest<T>(
    path: string,
    init?: Parameters<typeof requestBackendJson>[1],
  ): Promise<T> {
    callCount += 1;
    requestBodies.push(init?.body);
    if (path.endsWith('/questions')) {
      return {
        questions: [{
          id: 'mood',
          title: '어떤 방향이 좋아요?',
          options: [
            {id: 'soft', label: '은은하게'},
            {id: 'clear', label: '또렷하게'},
            {id: 'bold', label: '과감하게'},
            {id: 'ai', label: 'AI가 골라줘'},
          ],
        }],
      } as T;
    }
    return {
      reportId: 'report-success',
      imageStatus: 'pending',
      recommendation: {
        looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
          id: `look-${index + 1}`,
          role,
          title: `추천 ${index + 1}`,
          summary: `서로 다른 추천 ${index + 1}`,
          reasons: ['선택한 조건을 반영했어요.'],
          appliedConditions: ['퇴근 후 약속'],
          durationMinutes: 20,
          difficulty: 'medium',
          steps: [{order: 1, area: 'base', instruction: '얇게 표현해요.'}],
          products: [{area: 'base', brandName: '브랜드', productName: '제품', reason: '조화로워요.'}],
        })),
      },
    } as T;
  }

  const startInput = {
    prompt: '사진에서 또렷하되 과하게 꾸민 느낌은 피하는 메이크업',
    scenarioId: 'airport-legend',
    scenarioLabel: '공항 출국 레전드',
    useProfile: false,
  };
  const started = await startGeneratedMakeupRecommendation(
    startInput,
    [],
    successfulBackendRequest,
  );
  const completed = await answerGeneratedMakeupRecommendationQuestion(
    started,
    {questionId: 'mood', optionId: 'soft'},
    [],
    successfulBackendRequest,
  );

  expectEqual(callCount, 2, 'successful backend flow makes question and recommendation requests');
  expectEqual(
    (requestBodies[0] as {scenarioLabel?: string}).scenarioLabel,
    '공항 출국 레전드',
    'question request includes selected card copy',
  );
  expectEqual(
    (requestBodies[1] as {scenarioLabel?: string}).scenarioLabel,
    '공항 출국 레전드',
    'recommendation request includes selected card copy',
  );
  expectEqual(
    (started as MakeupRecommendationSession & {scenarioLabel?: string}).scenarioLabel,
    '공항 출국 레전드',
    'question session preserves selected card copy',
  );
  expectEqual(completed.phase, 'results', 'successful backend flow reaches results');
  expectEqual(completed.generationMode, 'backend', 'successful flow remains in backend mode');
  expectEqual(completed.reportId, 'report-success', 'saved report id is retained');
  expectEqual(completed.imageStatus, 'pending', 'pending image state is retained for polling');
  expectEqual(completed.results.length, 3, 'all three backend roles are mapped');
}

async function expectGeneratedRecommendationFailureIsSurfaced() {
  let callCount = 0;
  async function failingRecommendationRequest<T>(): Promise<T> {
    callCount += 1;
    if (callCount === 1) {
      return {
        questions: [{
          id: 'presence',
          title: '평소보다 얼마나 과감해질까요?',
          options: [
            {id: 'familiar', label: '평소의 나답게'},
            {id: 'different', label: '조금 낯설게'},
            {id: 'bold', label: '확실히 달라지게'},
            {id: 'ai_pick', label: 'AI가 골라줘'},
          ],
        }],
      } as T;
    }
    throw new Error('recommendation unavailable');
  }

  const started = await startGeneratedMakeupRecommendation(
    {prompt: '공항 사진에서 또렷하게 보이는 메이크업', useProfile: false},
    [],
    failingRecommendationRequest,
  );
  let error: unknown;
  try {
    await answerGeneratedMakeupRecommendationQuestion(
      started,
      {questionId: 'presence', optionId: 'familiar'},
      [],
      failingRecommendationRequest,
    );
  } catch (caught) {
    error = caught;
  }

  expectEqual((error as Error).message, 'recommendation unavailable', 'recommendation failure is not replaced by fixtures');
}

async function expectPollingParsesJsonStringRecommendationAndKeepsResults() {
  const backendRecommendation = {
    looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
      id: `poll-look-${index + 1}`,
      role,
      title: `폴링 추천 ${index + 1}`,
      summary: `폴링 뒤에도 남는 추천 ${index + 1}`,
      reasons: ['저장된 추천을 유지해요.'],
      appliedConditions: ['공항 출국 레전드'],
      durationMinutes: 25,
      difficulty: 'medium',
      steps: [{order: 1, area: 'base', instruction: '얇게 정리해요.'}],
      products: [{area: 'base', brandName: '브랜드', productName: '제품', reason: '잘 맞아요.'}],
    })),
  };
  const initialResults = mapBackendRecommendationLooks({
    reportId: 'report-poll',
    recommendation: backendRecommendation,
    prompt: '공항 출국 레전드',
    questions: [],
    answers: [],
  });
  const session: MakeupRecommendationSession = {
    id: 'report-poll',
    reportId: 'report-poll',
    phase: 'results',
    prompt: '공항 출국 레전드',
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    results: initialResults,
    useProfile: false,
    imageStatus: 'pending',
    generationMode: 'backend',
  };

  async function backendRequest<T>(): Promise<T> {
    return {
      id: 'report-poll',
      scenarioText: '공항 출국 레전드',
      recommendation: JSON.stringify(backendRecommendation),
      imageStatus: 'processing',
    } as T;
  }

  const refreshed = await refreshGeneratedMakeupRecommendation(session, undefined, backendRequest);

  expectEqual(refreshed.imageStatus, 'processing', 'polling image status updates');
  expectEqual(refreshed.results.length, 3, 'polling keeps all three looks from json string recommendation');
  expectEqual(refreshed.results[0].title, '폴링 추천 1', 'polling parses saved recommendation copy');
}

async function runAsyncContracts() {
  await expectGeneratedQuestionFailureIsSurfaced();
  await expectGeneratedQuestionsRejectSixOptions();
  await expectAuthFailureDoesNotMasqueradeAsFallback();
  await expectAbortSignalIsForwarded();
  await expectGeneratedBackendFlowCompletesAndKeepsSavedReport();
  await expectGeneratedRecommendationFailureIsSurfaced();
  await expectPollingParsesJsonStringRecommendationAndKeepsResults();
}

void runAsyncContracts().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
