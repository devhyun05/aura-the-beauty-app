import {
  answerGeneratedMakeupRecommendationQuestion,
  answerGeneratedMakeupRecommendationQuestionV2,
  createMakeupRecommendationIdempotencyKey,
  fetchMakeupRecommendationDiscovery,
  fetchGeneratedMakeupRecommendationSessionV2,
  generateMakeupRecommendationV2,
  answerMakeupRecommendationQuestion,
  getMakeupScenarioSet,
  getPopularMakeupScenarios,
  mapBackendRecommendationReports,
  mapBackendRecommendationLooks,
  refineGeneratedMakeupRecommendation,
  refineMakeupRecommendation,
  refreshGeneratedMakeupRecommendation,
  restoreMakeupRecommendationReport,
  retryGeneratedMakeupRecommendationImages,
  startGeneratedMakeupRecommendation,
  startGeneratedMakeupRecommendationV2,
  startMakeupRecommendation,
} from './makeupRecommendationService';
import {buildRecommendedAreaGuides} from './makeupRecommendationMappers';
import {
  MAKEUP_RECOMMENDATION_EVENT_NAMES,
  markKnownMakeupRecommendationImageEvents,
  sanitizeMakeupRecommendationEventMetadata,
  takeNewMakeupRecommendationImageEvents,
  trackMakeupRecommendationEvent,
} from './makeupRecommendationTelemetry';
import {
  clearCurrentMakeupRecommendationSessionId,
  getMakeupRecommendationSessionRestoreDestination,
  MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY,
  readCurrentMakeupRecommendationSessionId,
  saveCurrentMakeupRecommendationSessionId,
  shouldDiscardStoredMakeupRecommendationSessionForError,
  type MakeupRecommendationSessionIdStorage,
} from './makeupRecommendationSessionPersistence';
import {BackendApiError, requestBackendJson} from '../../../shared/services/backendApi';
import {MAKEUP_SITUATION_FIXTURES} from '../data/makeupRecommendationV2Catalog';
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

const intentKeyA = createMakeupRecommendationIdempotencyKey();
const intentKeyB = createMakeupRecommendationIdempotencyKey();
expectEqual(/^makeup-v2-[0-9a-f-]{36}$/.test(intentKeyA), true, 'v2 intent key format');
expectEqual(intentKeyA === intentKeyB, false, 'each new intent gets a distinct idempotency key');

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
expectEqual(
  generatedLooks[0].areaGuides?.find(guide => guide.area === 'base')?.products[0]?.brandName,
  '브랜드',
  'backend product data is preserved for its matching area',
);
expectEqual(
  generatedLooks[0].areaGuides?.find(guide => guide.area === 'eye')?.products.length,
  0,
  'missing backend area products stay empty instead of using fixture brands',
);

const legacyGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{
    area: 'base',
    colors: [{name: '레거시 로즈', hex: '#AABBCC'}],
    steps: ['레거시 단계를 얇게 바르기'],
    avoid: '두껍게 쌓지 않기',
  }],
})[0];
expectEqual(legacyGuide.color.name, '레거시 로즈', 'legacy backend colors are preserved');
expectEqual(legacyGuide.steps[0].instruction, '레거시 단계를 얇게 바르기', 'legacy string steps are preserved');
expectEqual(legacyGuide.avoid[0], '두껍게 쌓지 않기', 'legacy string avoid is normalized');

const canonicalGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{
    area: 'base',
    color: {name: '캐노니컬 베이지', hex: '#D9B49A'},
    steps: [{order: 2, instruction: '중앙부터 펴 바르기'}],
    avoid: ['경계 남기기'],
  }],
})[0];
expectEqual(canonicalGuide.color.name, '캐노니컬 베이지', 'canonical backend color is preserved');
expectEqual(canonicalGuide.steps[0].order, 2, 'canonical ordered step is preserved');
expectEqual(canonicalGuide.avoid[0], '경계 남기기', 'canonical avoid list is preserved');

const explicitEmptyProductGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{area: 'base', products: []}],
})[0];
expectEqual(
  explicitEmptyProductGuide.products.length,
  0,
  'explicitly empty backend area products remain empty',
);
const missingBrandGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{area: 'base', products: [{productName: '이름만 검증된 제품'}]}],
})[0];
expectEqual(missingBrandGuide.products[0].brandName, '', 'missing backend brand stays empty instead of using a label as a brand');

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
    profileGender: 'unspecified',
    contextSnapshot: JSON.stringify({profile: {gender: 'male'}}),
  },
]);
expectEqual(reportHistory.length, 1, 'saved report history count');
expectEqual(reportHistory[0].reportId, 'report-1', 'saved report id');
expectEqual(reportHistory[0].scenarioText, '퇴근 후 약속', 'saved report scenario');
expectEqual(reportHistory[0].profileGender, 'unspecified', 'history prefers scalar profile gender');
expectEqual(reportHistory[0].results.length, 3, 'saved report restores three looks');
expectEqual(reportHistory[0].results[0].title, 'anchor title', 'saved report restores look copy');
const restoredReport = restoreMakeupRecommendationReport(reportHistory[0]);
expectEqual(restoredReport.phase, 'results', 'saved report opens in results phase');
expectEqual(restoredReport.reportId, 'report-1', 'restored session keeps report id');
expectEqual(restoredReport.profileGender, 'unspecified', 'restored report keeps snapshot gender');
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
const editedFirstAnswer = answerMakeupRecommendationQuestion(
  {...freeTextAnswered, currentQuestionIndex: 0},
  {questionId: started.questions[0].id, optionId: started.questions[0].options[0].id},
);
expectEqual(editedFirstAnswer.answers.length, 1, 'editing previous fixture answer does not duplicate it');
expectEqual(editedFirstAnswer.answers[0].optionId, started.questions[0].options[0].id, 'previous fixture answer is replaced');

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
          id: index === 3 ? 'ai_pick' : `option-${index + 1}`,
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
            {id: 'ai_pick', label: 'AI가 골라줘'},
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
    profileGender: 'unspecified',
    imageStatus: 'pending',
    generationMode: 'backend',
  };

  async function backendRequest<T>(): Promise<T> {
    return {
      id: 'report-poll',
      scenarioText: '공항 출국 레전드',
      recommendation: JSON.stringify(backendRecommendation),
      imageStatus: 'processing',
      contextSnapshot: {profile: {gender: 'male'}},
    } as T;
  }

  const refreshed = await refreshGeneratedMakeupRecommendation(session, undefined, backendRequest);

  expectEqual(refreshed.imageStatus, 'processing', 'polling image status updates');
  expectEqual(refreshed.profileGender, 'male', 'refresh restores report snapshot gender');
  expectEqual(refreshed.results.length, 3, 'polling keeps all three looks from json string recommendation');
  expectEqual(refreshed.results[0].title, '폴링 추천 1', 'polling parses saved recommendation copy');
}

async function expectV2DiscoverySessionAnswerGenerateContract() {
  const specialSituation = MAKEUP_SITUATION_FIXTURES.find(item => item.key === 'formal_event');
  const keyword = specialSituation?.keywords[0];
  if (!specialSituation || !keyword) throw new Error('special-day fixture is required');
  const requestLog: Array<{path: string; body?: unknown; headers?: HeadersInit}> = [];
  const question = {
    id: 'finish',
    title: '어떤 마무리가 좋아요?',
    options: [
      {id: 'soft', label: '은은하게'},
      {id: 'clear', label: '또렷하게'},
      {id: 'glossy', label: '촉촉하게'},
      {id: 'ai_pick', label: 'AI가 골라줘'},
    ],
  };
  async function backendRequest<T>(path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    requestLog.push({path, body: init?.body, headers: init?.headers});
    if (path.endsWith('/discovery')) {
      return {
        generatedAt: '2026-07-16T00:00:00Z',
        sourceReports: [{id: 'analysis-report-1'}],
        situations: [{
          id: 'formal-event-api-id',
          key: 'formal_event',
          label: '특별한 날',
          description: '데이트, 중요한 일정과 기념일',
          imageAssetKey: 'formal_event',
          sortOrder: 20,
          keywords: [{
            id: 'keyword-api-id',
            label: '소개팅·데이트',
            kind: 'curated',
            badge: 'CURATED',
            seedPrompt: '소개팅이나 데이트를 앞둔 특별한 약속 상황',
            tags: ['formal_event', 'date'],
          }],
        }],
      } as T;
    }
    if (path.endsWith('/sessions')) {
      return {
        id: 'session-v2',
        status: 'questioning',
        profileGender: 'female',
        currentQuestionIndex: 0,
        questions: [question],
        answers: [],
        sourceAnalysisReportId: 'analysis-report-1',
        expiresAt: '2026-07-17T00:00:00Z',
      } as T;
    }
    if (path.endsWith('/answers')) {
      return {
        id: 'session-v2',
        status: 'ready',
        currentQuestionIndex: 1,
        questions: [question],
        answers: [{questionId: 'finish', optionId: 'soft'}],
        sourceAnalysisReportId: 'analysis-report-1',
      } as T;
    }
    return {
      reportId: 'report-v2',
      imageStatus: 'pending',
      recommendation: {
        looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
          id: `v2-look-${index + 1}`,
          role,
          title: `V2 룩 ${index + 1}`,
          summary: '보고서와 상황을 반영한 추천',
          reasons: ['선택한 얼굴 분석 보고서와 키워드를 반영했어요.'],
          durationMinutes: 15,
          difficulty: 'medium',
          areaGuides: [{
            area: 'base',
            label: '베이스',
            goal: '결을 정돈해요',
            color: {name: '뉴트럴 베이지', hex: '#D9B49A'},
            texture: '새틴',
            placement: '얼굴 중앙',
            technique: '얇게 펴 발라요',
            reason: '피부 분석을 반영했어요',
            avoid: [],
            steps: [{order: 1, instruction: '소량씩 바르기'}],
            products: [],
            arSupported: true,
          }],
        })),
      },
    } as T;
  }

  const discovery = await fetchMakeupRecommendationDiscovery(backendRequest);
  expectEqual(discovery.source, 'api', 'v2 discovery uses validated api payload');
  expectEqual(discovery.sourceReportIds?.[0], 'analysis-report-1', 'discovery keeps owned completed report ids');
  expectEqual(discovery.situations[0].keywords[0].badge, 'CURATED', 'situation keyword stays curated');

  const started = await startGeneratedMakeupRecommendationV2({
    analysisReportId: 'analysis-report-1',
    idempotencyKey: 'makeup-v2-test-intent',
    situation: specialSituation,
    keyword,
    imageMode: 'generic',
  }, backendRequest);
  expectEqual(started.phase, 'question', 'v2 session starts with reverse question');
  expectEqual(started.sourceAnalysisReportId, 'analysis-report-1', 'selected report id is retained');
  expectEqual(started.profileGender, 'female', 'start keeps account gender');
  expectEqual(started.useProfile, true, 'v2 always uses selected analysis profile');
  expectEqual(
    (requestLog.find(item => item.path.endsWith('/sessions'))?.headers as Record<string, string>)?.['Idempotency-Key'],
    'makeup-v2-test-intent',
    'v2 session reuses the caller intent idempotency key',
  );

  const editorialStarted = await startGeneratedMakeupRecommendationV2({
    analysisReportId: 'analysis-report-1',
    idempotencyKey: 'makeup-v2-editorial-intent',
    editorialPresetId: 'baseball-camera',
    editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
    editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    imageMode: 'personalized',
  }, backendRequest);
  const editorialRequest = requestLog.filter(item => item.path.endsWith('/sessions')).at(-1);
  const editorialBody = editorialRequest?.body as Record<string, unknown>;
  expectEqual(editorialStarted.phase, 'question', 'editorial preset starts the reviewed reverse-question flow');
  expectEqual(editorialStarted.scenarioLabel, '야구장 전광판에 잡히고 싶은 날', 'editorial display label is preserved');
  expectEqual(editorialStarted.editorialPresetId, 'baseball-camera', 'editorial preset id is preserved');
  expectEqual(editorialBody.editorialPresetId, 'baseball-camera', 'editorial selection sends its reviewed preset id');
  expectEqual(editorialBody.customSituationText, null, 'editorial preset does not masquerade as custom user input');
  expectEqual(editorialBody.customSituationLabel, null, 'editorial copy is resolved from the trusted server preset');
  expectEqual(editorialBody.imageMode, 'personalized', 'editorial prompt requests the selected face image');
  expectEqual(editorialBody.situationId, undefined, 'independent editorial prompt has no parent situation id');
  expectEqual(editorialBody.keywordId, undefined, 'independent editorial prompt has no mapped keyword id');

  const ready = await answerGeneratedMakeupRecommendationQuestionV2(
    started,
    {questionId: 'finish', optionId: 'soft'},
    backendRequest,
  );
  expectEqual(ready.phase, 'ready', 'last reverse answer makes v2 session ready');
  expectEqual(ready.answers.length, 1, 'v2 answer is preserved');
  expectEqual(ready.profileGender, 'female', 'answer keeps previous account gender');

  const completed = await generateMakeupRecommendationV2(ready, backendRequest);
  expectEqual(completed.phase, 'results', 'v2 generate reaches results');
  expectEqual(completed.reportId, 'report-v2', 'v2 saved report id is kept');
  expectEqual(completed.profileGender, 'female', 'generate keeps session account gender');
  expectEqual(completed.results.length, 3, 'v2 keeps three look roles');
  expectEqual(completed.results.every(look => (look.areaGuides?.length ?? 0) >= 5), true, 'v1/v2 adapter guarantees five area guides');
  expectEqual(
    completed.results.every(look => look.areaGuides?.every(guide => guide.products.length === 0)),
    true,
    'v2 empty area products never receive fixture brands',
  );
}

async function expectV2OnlyFallsBackForUnavailableEndpoint() {
  const situation = MAKEUP_SITUATION_FIXTURES[0];
  async function unavailableRequest<T>(): Promise<T> {
    throw new BackendApiError('not found', 404, 'NOT_FOUND');
  }
  const fallback = await startGeneratedMakeupRecommendationV2({
    analysisReportId: 'analysis-report-fixture',
    forceFixture: true,
    situation,
    keyword: situation.keywords[0],
  }, unavailableRequest);
  expectEqual(fallback.generationMode, 'fixture', 'missing v2 endpoint uses local fixture flow');
  expectEqual(fallback.sourceAnalysisReportId, 'analysis-report-fixture', 'fixture keeps selected report id');

  const previousApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com';
  let configuredEndpointError: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId: 'analysis-report-production',
      situation,
      keyword: situation.keywords[0],
    }, unavailableRequest);
  } catch (error) {
    configuredEndpointError = error;
  } finally {
    if (previousApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previousApiBaseUrl;
  }
  expectEqual(configuredEndpointError instanceof BackendApiError, true, 'configured api failure is surfaced instead of fixture recommendation');

  async function forbiddenRequest<T>(): Promise<T> {
    throw new BackendApiError('forbidden', 403, 'FORBIDDEN');
  }
  let forbidden: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId: 'another-user-report',
      situation,
      keyword: situation.keywords[0],
    }, forbiddenRequest);
  } catch (error) {
    forbidden = error;
  }
  expectEqual(forbidden instanceof BackendApiError, true, 'ownership/auth errors never masquerade as fixture success');
}

async function expectLookRetryTargetsOnlyFailedLook() {
  let requestBody: unknown;
  async function backendRequest<T>(_path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    requestBody = init?.body;
    return {reportId: 'report-retry', lookId: 'look-bold', imageStatus: 'pending'} as T;
  }
  const session = restoreMakeupRecommendationReport({...reportHistory[0], imageStatus: 'partial'});
  const retried = await retryGeneratedMakeupRecommendationImages(session, undefined, 'look-bold', backendRequest);
  expectEqual((requestBody as {lookId?: string}).lookId, 'look-bold', 'image retry sends selected look id');
  expectEqual(retried.imageStatus, 'pending', 'look retry returns pending aggregate state');
}

function expectMakeupRecommendationTelemetryContract() {
  expectEqual(MAKEUP_RECOMMENDATION_EVENT_NAMES.join(','), [
    'makeup_recommendation_opened',
    'analysis_report_selected',
    'makeup_situation_selected',
    'makeup_keyword_selected',
    'custom_situation_submitted',
    'recommendation_question_answered',
    'recommendation_generation_started',
    'recommendation_text_completed',
    'recommendation_image_completed',
    'recommendation_image_failed',
    'recommendation_area_opened',
    'recommendation_ar_applied',
  ].join(','), 'telemetry keeps the 12-event product contract');

  const safeMetadata = sanitizeMakeupRecommendationEventMetadata({
    id: ' report-1 ',
    category: 'trend',
    modelVersion: 'claude-test',
    durationMs: 12.6,
    status: 'completed',
    customPrompt: 'private custom prompt',
    faceShape: 'sensitive face value',
  });
  expectEqual(safeMetadata.id, 'report-1', 'telemetry trims safe identifiers');
  expectEqual(safeMetadata.durationMs, 13, 'telemetry rounds duration');
  expectEqual('customPrompt' in safeMetadata, false, 'telemetry rejects raw custom prompts');
  expectEqual('faceShape' in safeMetadata, false, 'telemetry rejects sensitive face values');

  const emittedKeys = new Set<string>();
  const failedInput = {
    contextId: 'report-1',
    reportStatus: 'partial' as const,
    looks: [{id: 'look-1', role: 'anchor' as const, imageStatus: 'failed' as const}],
  };
  expectEqual(takeNewMakeupRecommendationImageEvents(failedInput, emittedKeys).length, 1, 'first image terminal event emits');
  expectEqual(takeNewMakeupRecommendationImageEvents(failedInput, emittedKeys).length, 0, 'same image terminal event is deduplicated');
  const completedInput = {
    contextId: 'report-1',
    reportStatus: 'completed' as const,
    looks: [{id: 'look-1', role: 'anchor' as const, imageStatus: 'completed' as const}],
  };
  expectEqual(takeNewMakeupRecommendationImageEvents(completedInput, emittedKeys)[0]?.eventName, 'recommendation_image_completed', 'failed image retry may later complete once');

  const knownKeys = new Set<string>();
  markKnownMakeupRecommendationImageEvents(failedInput, knownKeys);
  expectEqual(takeNewMakeupRecommendationImageEvents(failedInput, knownKeys).length, 0, 'retry primes known terminal image state');
}

async function expectMakeupRecommendationTelemetryIsFireAndForget() {
  let capturedPath = '';
  let capturedBody: unknown;
  function backendRequest<T>(path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    capturedPath = path;
    capturedBody = init?.body;
    return Promise.resolve({} as T);
  }
  trackMakeupRecommendationEvent('makeup_keyword_selected', {
    id: 'keyword-1',
    category: 'trend',
    status: 'selected',
  }, backendRequest);
  expectEqual(capturedPath, '/makeup-recommendations/events', 'telemetry uses the event endpoint');
  const captured = capturedBody as {eventName: string; metadata: Record<string, unknown>};
  expectEqual(captured.eventName, 'makeup_keyword_selected', 'telemetry sends the selected event name');
  expectEqual(captured.metadata.id, 'keyword-1', 'telemetry sends only safe metadata');

  trackMakeupRecommendationEvent('makeup_recommendation_opened', {}, async () => {
    throw new Error('telemetry unavailable');
  });
  let syncFailureEscaped = false;
  try {
    trackMakeupRecommendationEvent('makeup_recommendation_opened', {}, () => {
      throw new Error('telemetry unavailable synchronously');
    });
  } catch {
    syncFailureEscaped = true;
  }
  expectEqual(syncFailureEscaped, false, 'synchronous telemetry failure never interrupts the flow');
  await Promise.resolve();
}

async function expectMakeupRecommendationSessionIdPersistenceContract() {
  let storedValue: string | null = null;
  let removeCount = 0;
  const storage: MakeupRecommendationSessionIdStorage = {
    async getItem(key) {
      expectEqual(key, MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, 'session storage read key');
      return storedValue;
    },
    async setItem(key, value) {
      expectEqual(key, MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, 'session storage write key');
      storedValue = value;
    },
    async removeItem(key) {
      expectEqual(key, MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, 'session storage remove key');
      storedValue = null;
      removeCount += 1;
    },
  };

  await saveCurrentMakeupRecommendationSessionId(' session-v2 ', storage);
  expectEqual(storedValue, 'session-v2', 'AsyncStorage contains the opaque current session id only');
  expectEqual(String(storedValue).includes('customSituationText'), false, 'storage never contains custom prompt context');
  expectEqual(await readCurrentMakeupRecommendationSessionId(storage), 'session-v2', 'stored session id is readable');
  await clearCurrentMakeupRecommendationSessionId(storage, 'another-session');
  expectEqual(storedValue, 'session-v2', 'stale completion cannot clear a newer session id');
  await clearCurrentMakeupRecommendationSessionId(storage, 'session-v2');
  expectEqual(storedValue, null, 'matching completed or cancelled session is cleared');
  expectEqual(removeCount, 1, 'matching session cleanup removes once');

  storedValue = '   ';
  expectEqual(await readCurrentMakeupRecommendationSessionId(storage), null, 'invalid persisted id is discarded');
  expectEqual(removeCount, 2, 'invalid persisted id is removed');

  const unavailableStorage: MakeupRecommendationSessionIdStorage = {
    async getItem() { throw new Error('storage unavailable'); },
    async setItem() { throw new Error('storage unavailable'); },
    async removeItem() { throw new Error('storage unavailable'); },
  };
  await saveCurrentMakeupRecommendationSessionId('session-v2', unavailableStorage);
  await clearCurrentMakeupRecommendationSessionId(unavailableStorage);
  expectEqual(await readCurrentMakeupRecommendationSessionId(unavailableStorage), null, 'storage errors fail open');
}

async function expectGeneratedV2SessionRestoreContract() {
  let requestPath = '';
  let requestMethod: string | undefined;
  let responseStatus: 'questioning' | 'ready' | 'generating' | 'completed' | 'failed' = 'generating';
  async function backendRequest<T>(path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    requestPath = path;
    requestMethod = init?.method;
    return {
      id: 'session-v2',
      status: responseStatus,
      profileGender: 'male',
      currentQuestionIndex: responseStatus === 'questioning' ? 0 : 1,
      questions: [{
        id: 'finish',
        title: '어떤 마무리가 좋아요?',
        options: [
          {id: 'soft', label: '은은하게'},
          {id: 'clear', label: '또렷하게'},
          {id: 'glossy', label: '촉촉하게'},
          {id: 'ai_pick', label: 'AI가 골라줘'},
        ],
      }],
      answers: responseStatus === 'questioning' ? [] : [{questionId: 'finish', optionId: 'soft'}],
      sourceAnalysisReportId: 'analysis-report-1',
      situation: {id: 'situation-date', key: 'date', label: '데이트', description: '낮부터 저녁까지'},
      keyword: {
        id: 'keyword-date',
        label: '스트로베리 밀크',
        kind: 'trend',
        badge: 'TREND_K_BEAUTY_2026',
        seedPrompt: '투명한 핑크 톤 메이크업',
        tags: ['date'],
      },
      reportId: responseStatus === 'completed' ? 'report-v2' : undefined,
      expiresAt: '2099-07-17T00:00:00Z',
    } as T;
  }

  const generating = await fetchGeneratedMakeupRecommendationSessionV2('session-v2', backendRequest);
  expectEqual(requestPath, '/makeup-recommendations/sessions/session-v2', 'resume fetches the owned server session');
  expectEqual(requestMethod, undefined, 'resume uses GET');
  expectEqual(generating.phase, 'ready', 'generating server session maps to loading-capable client phase');
  expectEqual(generating.status, 'generating', 'generating status is preserved for polling');
  expectEqual(generating.profileGender, 'male', 'server session restore keeps account gender');
  expectEqual(generating.prompt, '투명한 핑크 톤 메이크업', 'prompt is reconstructed from server context, not local storage');
  expectEqual(generating.answers.length, 1, 'server-owned answers are restored');
  expectEqual(generating.sourceAnalysisReportId, 'analysis-report-1', 'owned analysis report id is restored');
  responseStatus = 'questioning';
  const questioning = await fetchGeneratedMakeupRecommendationSessionV2('session-v2', backendRequest);
  expectEqual(questioning.phase, 'question', 'questioning session restores its current reverse question');
  expectEqual(questioning.currentQuestionIndex, 0, 'questioning session restores the server index');

  responseStatus = 'ready';
  const ready = await fetchGeneratedMakeupRecommendationSessionV2('session-v2', backendRequest);
  expectEqual(ready.phase, 'ready', 'ready session can resume generation');

  responseStatus = 'failed';
  const failed = await fetchGeneratedMakeupRecommendationSessionV2('session-v2', backendRequest);
  expectEqual(failed.phase, 'ready', 'failed server session remains generation-capable on the client');
  expectEqual(failed.status, 'failed', 'failed server status is preserved for explicit retry UX');
  expectEqual(failed.answers.length, 1, 'failed session restores server-owned answers for retry');

  responseStatus = 'completed';
  const completed = await fetchGeneratedMakeupRecommendationSessionV2('session-v2', backendRequest);
  expectEqual(completed.phase, 'results', 'completed session maps to results hydration');
  expectEqual(completed.reportId, 'report-v2', 'completed session keeps its report id');

  const activeExpiry = '2099-07-17T00:00:00Z';
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'questioning', expiresAt: activeExpiry}), 'question', 'questioning resumes at question');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'ready', expiresAt: activeExpiry}), 'loading', 'ready resumes at loading');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'generating', expiresAt: activeExpiry}), 'loading', 'generating resumes at loading');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'failed', expiresAt: activeExpiry}), 'retry', 'failed session waits for explicit user retry');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'completed', reportId: 'report-v2', expiresAt: activeExpiry}), 'results', 'completed resumes through result hydration');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'completed', expiresAt: activeExpiry}), 'discard', 'completed session without report is discarded');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'ready', expiresAt: '2020-01-01T00:00:00Z'}), 'discard', 'expired session is discarded');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('missing', 404, 'NOT_FOUND')), true, '404 clears persisted id');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('conflict', 409, 'CONFLICT')), true, '409 clears persisted id');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('generating', 409, 'MAKEUP_SESSION_GENERATING')), false, 'in-flight generation conflict keeps persisted id for polling');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('race', 409, 'MAKEUP_SESSION_STATE_CHANGED')), false, 'generation claim race also keeps persisted id for polling');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('expired', 410, 'EXPIRED')), true, 'expired response clears persisted id');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('temporary', 500, 'TEMPORARY')), false, 'transient restore error keeps id for a later retry');
}
async function runAsyncContracts() {
  expectMakeupRecommendationTelemetryContract();
  await expectGeneratedQuestionFailureIsSurfaced();
  await expectGeneratedQuestionsRejectSixOptions();
  await expectAuthFailureDoesNotMasqueradeAsFallback();
  await expectAbortSignalIsForwarded();
  await expectGeneratedBackendFlowCompletesAndKeepsSavedReport();
  await expectGeneratedRecommendationFailureIsSurfaced();
  await expectPollingParsesJsonStringRecommendationAndKeepsResults();
  await expectV2DiscoverySessionAnswerGenerateContract();
  await expectV2OnlyFallsBackForUnavailableEndpoint();
  await expectLookRetryTargetsOnlyFailedLook();
  await expectMakeupRecommendationTelemetryIsFireAndForget();
  await expectMakeupRecommendationSessionIdPersistenceContract();
  await expectGeneratedV2SessionRestoreContract();
}

void runAsyncContracts().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
