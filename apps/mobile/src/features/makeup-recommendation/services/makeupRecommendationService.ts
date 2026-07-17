import {
  MAKEUP_LOOK_FIXTURES,
  MAKEUP_QUESTIONS,
  MAKEUP_SCENARIOS,
} from '../data/makeupRecommendationCatalog';
import {getMakeupRecommendationFixtureDiscovery} from '../data/makeupRecommendationV2Catalog';
import {
  BackendApiError,
  getBackendApiBaseUrl,
  isBackendNetworkError,
  isRequestAbortedError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {
  adaptLegacyLookToV2,
  buildRecommendedAreaGuides,
  normalizeMakeupRecommendationDiscovery,
  type ApiAreaGuide,
} from './makeupRecommendationMappers';
import type {
  MakeupLookRecommendation,
  MakeupQuestionDimension,
  MakeupRecommendationDiscovery,
  MakeupRecommendationAnswer,
  MakeupRecommendationImageStatus,
  MakeupRecommendationProduct,
  MakeupRecommendationProfileGender,
  MakeupRecommendationQuestion,
  MakeupRecommendationReportHistoryItem,
  MakeupRecommendationRefinement,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
  MakeupScenarioTone,
  MakeupSituation,
  MakeupTrendKeyword,
  ProductRecommendationProvider,
} from '../types';

export type StartMakeupRecommendationInput = {
  prompt: string;
  scenarioId?: string;
  scenarioLabel?: string;
  useProfile: boolean;
  personalColor?: string;
};
export type StartMakeupRecommendationV2Input = {
  analysisReportId: string;
  idempotencyKey?: string;
  situation?: MakeupSituation;
  keyword?: MakeupTrendKeyword;
  editorialPresetId?: string;
  editorialPresetLabel?: string;
  editorialPresetPrompt?: string;
  customSituationText?: string;
  customSituationLabel?: string;
  imageMode?: 'personalized' | 'generic';
  personalColor?: string;
  forceFixture?: boolean;
};

export function createMakeupRecommendationIdempotencyKey(): string {
  const requestId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
  return 'makeup-v2-' + requestId;
}

const QUESTION_PRIORITY: readonly MakeupQuestionDimension[] = [
  'occasion',
  'mood',
  'boldness',
  'timeSkill',
];
const TONES: readonly MakeupScenarioTone[] = ['narrative', 'playful', 'premium'];
const POPULAR_SCENARIO_IDS = [
  'popular-daily',
  'popular-work-school',
  'popular-date',
  'popular-photo',
  'popular-important',
] as const;
type BackendQuestion = {
  id: string;
  title: string;
  options: Array<{id: string; label: string}>;
};
type BackendLook = {
  id?: string;
  role?: string;
  title?: string;
  summary?: string;
  reasons?: string[];
  appliedConditions?: string[];
  durationMinutes?: number;
  difficulty?: string;
  steps?: Array<{order?: number; area?: string; instruction?: string}>;
  products?: Array<{
    id?: string;
    area?: string;
    brandName?: string;
    productName?: string;
    shadeName?: string;
    reason?: string;
    price?: number;
    imageUrl?: string;
    purchaseUrl?: string;
    matchRate?: number;
  }>;
  areaGuides?: ApiAreaGuide[];
  imageStatus?: MakeupRecommendationImageStatus;
  imageError?: string;
  imageUrl?: string;
};
type BackendRecommendation = {
  looks?: BackendLook[];
} | string;
type BackendRecommendationContextSnapshot = {
  profile?: {
    gender?: unknown;
  };
};
type BackendRecommendationReport = {
  id: string;
  scenarioText?: string;
  recommendation: BackendRecommendation;
  imageStatus: MakeupRecommendationImageStatus;
  imageUrl?: string;
  profileGender?: unknown;
  imageError?: string;
  sourceAnalysisReportId?: string;
  createdAt?: string;
  contextSnapshot?: BackendRecommendationContextSnapshot | string;
};

function normalizeBackendProfileGender(
  value: unknown,
): MakeupRecommendationProfileGender | undefined {
  return value === 'female' || value === 'male' || value === 'unspecified'
    ? value
    : undefined;
}

function parseBackendReportContextSnapshot(
  value: BackendRecommendationReport['contextSnapshot'],
): BackendRecommendationContextSnapshot | undefined {
  if (typeof value !== 'string') return value;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as BackendRecommendationContextSnapshot)
      : undefined;
  } catch {
    return undefined;
  }
}

function getBackendReportProfileGender(
  report: BackendRecommendationReport,
): MakeupRecommendationProfileGender | undefined {
  const contextSnapshot = parseBackendReportContextSnapshot(report.contextSnapshot);
  return normalizeBackendProfileGender(report.profileGender)
    ?? normalizeBackendProfileGender(contextSnapshot?.profile?.gender);
}

function ensureToneCoverage(scenarios: MakeupScenarioPrompt[]): MakeupScenarioPrompt[] {
  const selected = scenarios.slice(0, 6);

  TONES.forEach(tone => {
    if (selected.some(item => item.tone === tone)) return;

    const replacement = scenarios.slice(6).find(item => item.tone === tone);
    const replaceIndex = selected.findLastIndex(item =>
      selected.filter(candidate => candidate.tone === item.tone).length > 1,
    );
    if (replacement && replaceIndex >= 0) selected[replaceIndex] = replacement;
  });

  return selected;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const shuffled = [...items];
  let state = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function getPopularMakeupScenarios(): MakeupScenarioPrompt[] {
  return POPULAR_SCENARIO_IDS.map(id => MAKEUP_SCENARIOS.find(item => item.id === id)).filter(
    (item): item is MakeupScenarioPrompt => Boolean(item),
  );
}

export function getMakeupScenarioSet({seed}: {seed: number}): MakeupScenarioPrompt[] {
  const popularIds = new Set<string>(POPULAR_SCENARIO_IDS);
  const shuffled = seededShuffle(MAKEUP_SCENARIOS.filter(item => !popularIds.has(item.id)), seed);
  const firstSix = ensureToneCoverage(shuffled);
  return [
    ...firstSix,
    ...shuffled.filter(item => !firstSix.some(first => first.id === item.id)),
  ];
}

function inferKnownDimensions(prompt: string): MakeupQuestionDimension[] {
  const normalized = prompt.toLowerCase();
  const known: MakeupQuestionDimension[] = [];

  if (/출근|결혼식|데이트|약속|사진|콘서트|페스티벌|야구장/.test(normalized)) known.push('occasion');
  if (/우아|힙|차분|생기|무드|분위기/.test(normalized)) known.push('mood');
  if (/과감|자연스럽|또렷|선명/.test(normalized)) known.push('boldness');
  if (/5분|빠르|최소 단계/.test(normalized)) known.push('timeSkill');

  return known;
}

function sessionId(input: StartMakeupRecommendationInput): string {
  const source = input.scenarioId ?? input.prompt.trim().toLowerCase();
  const stable = source.replace(/[^a-z0-9ㄱ-힝]+/g, '-').replace(/^-|-$/g, '');
  return `makeup-recommendation-${stable || 'custom'}`;
}

function buildQuestionSession(
  input: StartMakeupRecommendationInput,
  questions: MakeupRecommendationQuestion[],
): MakeupRecommendationSession {
  return {
    id: sessionId(input),
    phase: 'question',
    prompt: input.prompt.trim(),
    scenarioLabel: input.scenarioLabel?.trim() || undefined,
    questions,
    currentQuestionIndex: 0,
    answers: [],
    results: [],
    useProfile: input.useProfile,
    personalColor: input.useProfile ? input.personalColor?.trim() || undefined : undefined,
  };
}

function selectedAnswerLabels(
  questions: MakeupRecommendationQuestion[],
  answers: MakeupRecommendationAnswer[],
): string[] {
  return answers.flatMap(answer => {
    const question = questions.find(item => item.id === answer.questionId);
    const option = question?.options.find(item => item.id === answer.optionId);
    return option ? [option.label] : [];
  });
}

function buildAppliedConditions(
  session: MakeupRecommendationSession,
  answers: MakeupRecommendationAnswer[],
  additionalConstraints?: string,
): string[] {
  const freeText = answers
    .map(answer => answer.freeText?.trim())
    .filter((value): value is string => Boolean(value))
    .reverse();
  const directConditions = [additionalConstraints, ...freeText]
    .filter((value): value is string => Boolean(value));
  const inferredConditions = [
    ...selectedAnswerLabels(session.questions, answers),
    session.prompt,
    ...(session.useProfile && session.personalColor ? [`퍼스널 컬러: ${session.personalColor}`] : []),
  ];

  return [...new Set([...directConditions, ...inferredConditions])];
}

function cloneLook(look: MakeupLookRecommendation): MakeupLookRecommendation {
  return adaptLegacyLookToV2({
    ...look,
    reasons: [...look.reasons],
    appliedConditions: [...look.appliedConditions],
    steps: look.steps.map(step => ({...step})),
    products: look.products.map(product => ({...product})),
    areaGuides: look.areaGuides?.map(guide => ({
      ...guide,
      color: {...guide.color},
      avoid: [...guide.avoid],
      steps: guide.steps.map(step => ({...step})),
      products: guide.products.map(product => ({...product})),
    })),
  });
}

export class FixtureProductRecommendationProvider implements ProductRecommendationProvider {
  recommendProducts(lookId: string): MakeupRecommendationProduct[] {
    const fixture = MAKEUP_LOOK_FIXTURES.find(look => look.id === lookId) ?? MAKEUP_LOOK_FIXTURES[0];
    return fixture.products.map(product => ({...product}));
  }
}

const fixtureProductProvider = new FixtureProductRecommendationProvider();

function completeSession(
  session: MakeupRecommendationSession,
  answers: MakeupRecommendationAnswer[],
  additionalConstraints?: string,
): MakeupRecommendationSession {
  const conditions = buildAppliedConditions(session, answers, additionalConstraints);
  return {
    ...session,
    phase: 'results',
    currentQuestionIndex: session.questions.length,
    answers,
    additionalConstraints,
    results: MAKEUP_LOOK_FIXTURES.map(fixture => ({
      ...cloneLook(fixture),
      appliedConditions: [...conditions],
      products: fixtureProductProvider.recommendProducts(fixture.id),
    })),
  };
}

function buildCompletedSession(
  input: StartMakeupRecommendationInput,
  answers: MakeupRecommendationAnswer[],
): MakeupRecommendationSession {
  return completeSession(buildQuestionSession(input, []), answers);
}

export function startMakeupRecommendation(input: StartMakeupRecommendationInput): MakeupRecommendationSession {
  const scenario = MAKEUP_SCENARIOS.find(item => item.id === input.scenarioId);
  const inferredDimensions = inferKnownDimensions(input.prompt);
  const known = new Set(scenario?.knownDimensions ?? inferredDimensions);
  const questionCap = !input.scenarioId && inferredDimensions.length === 0 ? 3 : 2;
  const questions = QUESTION_PRIORITY
    .filter(dimension => !known.has(dimension))
    .slice(0, questionCap)
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
  if (!expected || expected.id !== answer.questionId) {
    throw new Error('현재 질문과 맞지 않는 답변이에요.');
  }
  const selectedOption = expected.options.find(option => option.id === answer.optionId);
  if (answer.optionId && !selectedOption) {
    throw new Error('현재 질문에 없는 선택지예요.');
  }
  if (!selectedOption && !answer.freeText?.trim()) {
    throw new Error('선택지를 고르거나 답변을 입력해 주세요.');
  }
  const existingAnswerIndex = session.answers.findIndex(item => item.questionId === answer.questionId);
  const answers = existingAnswerIndex >= 0
    ? session.answers.map((item, index) => index === existingAnswerIndex ? answer : item)
    : [...session.answers, answer];
  const nextIndex = session.currentQuestionIndex + 1;
  const additionalConstraints =
    answer.additionalConstraints?.trim() || session.additionalConstraints;
  if (nextIndex >= session.questions.length) {
    return completeSession(session, answers, additionalConstraints);
  }

  return {...session, answers, currentQuestionIndex: nextIndex, additionalConstraints};
}

function applyFixtureRefinement(
  results: MakeupLookRecommendation[],
  refinement: MakeupRecommendationRefinement,
): MakeupLookRecommendation[] {
  if (refinement === 'replaceProducts') {
    return results.map(look => {
      const currentProductId = look.products[0]?.id;
      const currentFixtureIndex = MAKEUP_LOOK_FIXTURES.findIndex(fixture =>
        fixture.products.some(product => product.id === currentProductId),
      );
      const nextFixtureIndex = (Math.max(currentFixtureIndex, 0) + 1) % MAKEUP_LOOK_FIXTURES.length;
      const nextFixture = MAKEUP_LOOK_FIXTURES[nextFixtureIndex];
      return {...cloneLook(look), products: fixtureProductProvider.recommendProducts(nextFixture.id)};
    });
  }

  const copy = {
    natural: {summary: '색감과 음영을 한 단계 덜어낸 자연스러운 조정', condition: '더 자연스럽게'},
    hip: {summary: '질감과 선에 포인트를 더한 힙한 조정', condition: '더 힙하게'},
    differentColor: {summary: '주조색을 반대 온도로 바꾼 새로운 색 조합', condition: '다른 색으로'},
  }[refinement];

  const refinementConditions = ['더 자연스럽게', '더 힙하게', '다른 색으로'];
  return results.map(look => {
    const baseSummary = MAKEUP_LOOK_FIXTURES.find(fixture => fixture.id === look.id)?.summary ?? look.summary;
    return {
      ...cloneLook(look),
      summary: `${baseSummary} · ${copy.summary}`,
      appliedConditions: [
        copy.condition,
        ...look.appliedConditions.filter(item => !refinementConditions.includes(item)),
      ],
    };
  });
}

export function refineMakeupRecommendation(
  session: MakeupRecommendationSession,
  refinement: MakeupRecommendationRefinement,
): MakeupRecommendationSession {
  if (session.phase !== 'results') throw new Error('추천 결과가 나온 뒤에 조정할 수 있어요.');
  return {...session, results: applyFixtureRefinement(session.results, refinement)};
}

function mapBackendQuestions(questions: readonly BackendQuestion[]): MakeupRecommendationQuestion[] {
  return questions
    .filter(question => {
      const delegateOption = question.options?.[3];
      return Boolean(
        question.id?.trim()
        && question.title?.trim()
        && question.options?.length === 4
        && question.options.every(option => option.id?.trim() && option.label?.trim())
        && new Set(question.options.map(option => option.id)).size === question.options.length
        && new Set(question.options.map(option => option.label.trim().toLowerCase())).size === question.options.length
        && delegateOption?.id === 'ai_pick'
        && delegateOption.label === 'AI가 골라줘',
      );
    })
    .slice(0, 3)
    .map((question, index) => ({
      id: question.id,
      dimension: QUESTION_PRIORITY[index] ?? 'mood',
      title: question.title.trim(),
      options: question.options.map(option => ({id: option.id, label: option.label.trim()})),
    }));
}

function normalizedArea(value: string | undefined): MakeupLookRecommendation['steps'][number]['area'] {
  return value === 'base' || value === 'brow' || value === 'eye' || value === 'cheek' || value === 'lip'
    ? value
    : 'base';
}

export function mapBackendRecommendationLooks({
  reportId,
  recommendation,
  prompt,
  questions,
  answers,
}: {
  reportId: string;
  recommendation: BackendRecommendation;
  prompt: string;
  questions: MakeupRecommendationQuestion[];
  answers: MakeupRecommendationAnswer[];
}): MakeupLookRecommendation[] {
  const parsedRecommendation = parseBackendRecommendation(recommendation);
  const conditions = [prompt, ...selectedAnswerLabels(questions, answers)];
  const validRoles: MakeupLookRecommendation['role'][] = ['anchor', 'bold', 'discovery'];
  return (parsedRecommendation.looks ?? []).flatMap((look, index) => {
    const role = validRoles.includes(look.role as MakeupLookRecommendation['role'])
      ? look.role as MakeupLookRecommendation['role']
      : undefined;
    if (!role) return [];
    const fixture = MAKEUP_LOOK_FIXTURES.find(item => item.role === role) ?? MAKEUP_LOOK_FIXTURES[index % MAKEUP_LOOK_FIXTURES.length];
    const difficulty = look.difficulty === 'easy' || look.difficulty === 'medium' || look.difficulty === 'advanced'
      ? look.difficulty
      : 'medium';
    const mappedLook: MakeupLookRecommendation = {
      id: look.id?.trim() || `${reportId}-${role}`,
      arFilterId: fixture.arFilterId,
      role,
      title: look.title?.trim() || fixture.title,
      summary: look.summary?.trim() || fixture.summary,
      imageSource: look.imageUrl ? {uri: look.imageUrl} : fixture.imageSource,
      reasons: look.reasons?.filter(Boolean) ?? [look.summary?.trim() || '선택한 상황과 답변을 함께 반영했어요.'],
      appliedConditions: [...new Set((look.appliedConditions?.length ? look.appliedConditions : conditions).filter(Boolean))],
      durationMinutes: look.durationMinutes ?? fixture.durationMinutes,
      difficulty,
      steps: (look.steps ?? []).filter(step => step.instruction?.trim()).map((step, stepIndex) => ({
        area: normalizedArea(step.area),
        instruction: step.instruction?.trim() ?? '',
        order: step.order ?? stepIndex + 1,
      })),
      products: (look.products ?? []).filter(product => product.productName?.trim()).map((product, productIndex) => ({
        id: product.id?.trim() || `${reportId}-${role}-product-${productIndex + 1}`,
        area: normalizedArea(product.area),
        brandName: product.brandName?.trim() || '추천 제품',
        productName: product.productName?.trim() ?? '',
        shadeName: product.shadeName?.trim() || undefined,
        reason: product.reason?.trim() || '추천 방향과 조화를 이루는 제품이에요.',
        price: product.price,
        imageUrl: product.imageUrl?.trim() || undefined,
        purchaseUrl: product.purchaseUrl?.trim() || undefined,
        matchRate: product.matchRate,
      })),
      imageStatus: look.imageStatus,
      imageError: look.imageError,
    };
    return [{
      ...mappedLook,
      areaGuides: buildRecommendedAreaGuides({directGuides: look.areaGuides, look: mappedLook}),
    }];
  });
}

function parseBackendRecommendation(recommendation: BackendRecommendation | null | undefined): {looks?: BackendLook[]} {
  if (!recommendation) return {};
  if (typeof recommendation !== 'string') return recommendation;
  try {
    const parsed = JSON.parse(recommendation) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as {looks?: BackendLook[]} : {};
  } catch {
    return {};
  }
}

export function mapBackendRecommendationReports(
  reports: readonly BackendRecommendationReport[],
): MakeupRecommendationReportHistoryItem[] {
  return reports.flatMap(report => {
    const scenarioText = report.scenarioText?.trim() || '저장된 메이크업 추천';
    const results = mapBackendRecommendationLooks({
      reportId: report.id,
      recommendation: report.recommendation ?? {},
      prompt: scenarioText,
      questions: [],
      answers: [],
    });
    if (!report.id?.trim() || results.length === 0) return [];
    return [{
      reportId: report.id,
      scenarioText,
      createdAt: report.createdAt ?? '',
      imageStatus: report.imageStatus,
      imageError: report.imageError,
      profileGender: getBackendReportProfileGender(report),
      results,
    }];
  });
}

export function restoreMakeupRecommendationReport(
  report: MakeupRecommendationReportHistoryItem,
): MakeupRecommendationSession {
  return {
    id: report.reportId,
    reportId: report.reportId,
    phase: 'results',
    prompt: report.scenarioText,
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    results: report.results.map(cloneLook),
    useProfile: false,
    imageStatus: report.imageStatus,
    imageError: report.imageError,
    profileGender: report.profileGender,
    generationMode: 'backend',
  };
}

export async function fetchGeneratedMakeupRecommendationReports({
  limit = 20,
  offset = 0,
  timeoutMs,
}: {
  limit?: number;
  offset?: number;
  timeoutMs?: number;
} = {}): Promise<MakeupRecommendationReportHistoryItem[]> {
  const response = await requestBackendJson<{reports: BackendRecommendationReport[]}>(
    `/makeup-recommendations?limit=${limit}&offset=${offset}`,
    {timeoutMs},
  );
  return mapBackendRecommendationReports(response.reports ?? []);
}

type BackendRecommendationSessionV2 = {
  id: string;
  status: 'questioning' | 'ready' | 'generating' | 'completed' | 'failed';
  profileGender?: unknown;
  questions?: BackendQuestion[];
  currentQuestionIndex?: number;
  answers?: MakeupRecommendationAnswer[];
  sourceAnalysisReportId?: string;
  situation?: Pick<MakeupSituation, 'id' | 'key' | 'label' | 'description'>;
  keyword?: MakeupTrendKeyword;
  editorialPresetId?: string;
  customSituationText?: string;
  customSituationLabel?: string;
  imageMode?: 'personalized' | 'generic';
  reportId?: string;
  expiresAt?: string;
};

function shouldUseLocalFixture(error: unknown, allowServerFailure = false): boolean {
  if (isRequestAbortedError(error)) return false;
  if (isBackendNetworkError(error)) return true;
  if (error instanceof BackendApiError) {
    if (error.status === 401 || error.status === 403) return false;
    return [404, 405, 501].includes(error.status) || (allowServerFailure && error.status >= 500);
  }
  return error instanceof Error && /EXPO_PUBLIC_API_BASE_URL is required/.test(error.message);
}

function v2Prompt(input: StartMakeupRecommendationV2Input): string {
  return input.keyword?.seedPrompt?.trim()
    || input.editorialPresetPrompt?.trim()
    || input.customSituationText?.trim()
    || '';
}

function createFixtureV2Session(input: StartMakeupRecommendationV2Input): MakeupRecommendationSession {
  const prompt = v2Prompt(input);
  const fixtureSession = startMakeupRecommendation({
    prompt,
    scenarioId: input.keyword?.id ?? input.editorialPresetId,
    scenarioLabel: input.keyword?.label
      || input.editorialPresetLabel?.trim()
      || input.customSituationLabel?.trim()
      || input.situation?.label
      || '직접 입력',
    useProfile: true,
    personalColor: input.personalColor,
  });
  return {
    ...fixtureSession,
    results: fixtureSession.results.map(cloneLook),
    sourceAnalysisReportId: input.analysisReportId,
    situation: input.situation ? {
      id: input.situation.id,
      key: input.situation.key,
      label: input.situation.label,
      description: input.situation.description,
    } : undefined,
    keyword: input.keyword,
    editorialPresetId: input.editorialPresetId,
    customSituationText: input.customSituationText?.trim()
      || input.editorialPresetPrompt?.trim()
      || undefined,
    status: fixtureSession.phase === 'results' ? 'completed' : 'questioning',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    generationMode: 'fixture',
  };
}

function mapBackendV2Session({
  input,
  previous,
  response,
}: {
  input?: StartMakeupRecommendationV2Input;
  previous?: MakeupRecommendationSession;
  response: BackendRecommendationSessionV2;
}): MakeupRecommendationSession {
  const questions = mapBackendQuestions(response.questions ?? previous?.questions ?? []);
  const answers = response.answers ?? previous?.answers ?? [];
  const situation = response.situation ?? (input?.situation ? {
    id: input.situation.id,
    key: input.situation.key,
    label: input.situation.label,
    description: input.situation.description,
  } : previous?.situation);
  const keyword = response.keyword ?? input?.keyword ?? previous?.keyword;
  const editorialPresetId = response.editorialPresetId
    ?? input?.editorialPresetId
    ?? previous?.editorialPresetId;
  const customSituationText = response.customSituationText?.trim()
    || input?.customSituationText?.trim()
    || input?.editorialPresetPrompt?.trim()
    || previous?.customSituationText;
  const profileGender = normalizeBackendProfileGender(response.profileGender)
    ?? previous?.profileGender;
  if (response.status === 'questioning' && questions.length === 0) {
    throw new Error('추천 질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  const phase = response.status === 'questioning'
    ? 'question'
    : response.status === 'ready' || response.status === 'generating' || response.status === 'failed'
      ? 'ready'
      : 'results';
  return {
    id: response.id,
    phase,
    prompt: previous?.prompt ?? keyword?.seedPrompt?.trim() ?? customSituationText ?? '',
    scenarioLabel: previous?.scenarioLabel
      ?? keyword?.label
      ?? response.customSituationLabel?.trim()
      ?? input?.editorialPresetLabel?.trim()
      ?? input?.customSituationLabel?.trim()
      ?? situation?.label
      ?? '직접 입력',
    questions,
    currentQuestionIndex: response.currentQuestionIndex ?? previous?.currentQuestionIndex ?? 0,
    answers,
    additionalConstraints: previous?.additionalConstraints
      ?? [...answers].reverse().find(answer => answer.additionalConstraints?.trim())?.additionalConstraints?.trim(),
    results: previous?.results ?? [],
    profileGender,
    useProfile: true,
    personalColor: input?.personalColor ?? previous?.personalColor,
    sourceAnalysisReportId: response.sourceAnalysisReportId ?? input?.analysisReportId ?? previous?.sourceAnalysisReportId,
    situation,
    keyword,
    editorialPresetId,
    customSituationText,
    status: response.status,
    expiresAt: response.expiresAt ?? previous?.expiresAt,
    reportId: response.reportId ?? previous?.reportId,
    generationMode: 'v2',
  };
}

function v2InputFromSession(session: MakeupRecommendationSession): StartMakeupRecommendationV2Input {
  const situation = session.situation ? {
    ...session.situation,
    imageAssetKey: session.situation.key,
    keywords: [],
    sortOrder: 0,
  } : undefined;
  return {
    analysisReportId: session.sourceAnalysisReportId ?? '',
    situation,
    keyword: session.keyword,
    editorialPresetId: session.editorialPresetId,
    editorialPresetLabel: session.editorialPresetId ? session.scenarioLabel : undefined,
    editorialPresetPrompt: session.editorialPresetId ? session.prompt : undefined,
    customSituationText: session.editorialPresetId ? undefined : session.customSituationText,
    customSituationLabel: session.editorialPresetId ? undefined : session.scenarioLabel,
    personalColor: session.personalColor,
  };
}

export async function fetchMakeupRecommendationDiscovery(
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationDiscovery> {
  try {
    const response = await backendRequest<unknown>('/makeup-recommendations/discovery', {signal});
    const normalized = normalizeMakeupRecommendationDiscovery(response);
    return normalized ?? getMakeupRecommendationFixtureDiscovery();
  } catch (error) {
    if (!shouldUseLocalFixture(error, true)) throw error;
    return getMakeupRecommendationFixtureDiscovery();
  }
}

export async function fetchGeneratedMakeupRecommendationSessionV2(
  sessionId: string,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) throw new Error('복원할 메이크업 추천 세션을 찾지 못했어요.');
  const response = await backendRequest<BackendRecommendationSessionV2>(
    `/makeup-recommendations/sessions/${encodeURIComponent(normalizedSessionId)}`,
    {signal},
  );
  return mapBackendV2Session({response});
}

export async function startGeneratedMakeupRecommendationV2(
  input: StartMakeupRecommendationV2Input,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const hasKeyword = Boolean(input.keyword);
  const hasEditorialPreset = Boolean(input.editorialPresetId?.trim());
  const hasCustom = Boolean(input.customSituationText?.trim());
  const selectionCount = Number(hasKeyword) + Number(hasEditorialPreset) + Number(hasCustom);
  if (!input.analysisReportId.trim()) throw new Error('추천에 사용할 얼굴 분석 보고서를 골라주세요.');
  if (selectionCount !== 1 || (hasKeyword && !input.situation)) {
    throw new Error('상황 키워드, 트렌드 메이크업, 직접 입력 중 하나를 골라주세요.');
  }
  if (hasEditorialPreset && (!input.editorialPresetLabel?.trim() || !input.editorialPresetPrompt?.trim())) {
    throw new Error('선택한 트렌드 메이크업 정보를 확인하지 못했어요.');
  }
  if (input.forceFixture) return createFixtureV2Session(input);
  try {
    const response = await backendRequest<BackendRecommendationSessionV2>(
      '/makeup-recommendations/sessions',
      {
        method: 'POST',
        body: {
          analysisReportId: input.analysisReportId,
          situationId: input.situation?.id,
          keywordId: input.keyword?.id,
          editorialPresetId: input.editorialPresetId?.trim() || null,
          customSituationText: input.customSituationText?.trim() || null,
          customSituationLabel: input.customSituationLabel?.trim() || null,
          imageMode: input.imageMode ?? 'generic',
        },
        headers: {
          'Idempotency-Key': input.idempotencyKey ?? createMakeupRecommendationIdempotencyKey(),
        },
        signal,
      },
    );
    return mapBackendV2Session({input, response});
  } catch (error) {
    if (getBackendApiBaseUrl() || !shouldUseLocalFixture(error)) throw error;
    return createFixtureV2Session(input);
  }
}

export async function answerGeneratedMakeupRecommendationQuestionV2(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (session.generationMode === 'fixture') {
    const answered = answerMakeupRecommendationQuestion(session, answer);
    return {
      ...answered,
      results: answered.results.map(cloneLook),
      status: answered.phase === 'results' ? 'completed' : 'questioning',
      generationMode: 'fixture',
    };
  }
  const response = await backendRequest<BackendRecommendationSessionV2>(
    `/makeup-recommendations/sessions/${session.id}/answers`,
    {method: 'POST', body: answer, signal},
  );
  return mapBackendV2Session({input: v2InputFromSession(session), previous: session, response});
}

export async function generateMakeupRecommendationV2(
  session: MakeupRecommendationSession,
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (session.generationMode === 'fixture') {
    if (session.phase !== 'results') throw new Error('질문에 모두 답한 뒤 추천을 만들 수 있어요.');
    return {...session, results: session.results.map(cloneLook), status: 'completed'};
  }
  const response = await backendRequest<{
    reportId: string;
    recommendation: BackendRecommendation;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>(`/makeup-recommendations/sessions/${session.id}/generate`, {
    method: 'POST',
    timeoutMs: 180000,
    signal,
  });
  const results = mapBackendRecommendationLooks({
    reportId: response.reportId,
    recommendation: response.recommendation,
    prompt: session.prompt,
    questions: session.questions,
    answers: session.answers,
  });
  if (results.length === 0) throw new Error('추천 결과 형식을 확인하지 못했어요. 다시 시도해 주세요.');
  return {
    ...session,
    phase: 'results',
    status: 'completed',
    currentQuestionIndex: session.questions.length,
    results,
    reportId: response.reportId,
    imageStatus: response.imageStatus,
    generationMode: 'v2',
  };
}

export async function fetchGeneratedMakeupRecommendationReport(
  reportId: string,
  signal?: AbortSignal,
): Promise<MakeupRecommendationReportHistoryItem> {
  const report = await requestBackendJson<BackendRecommendationReport>(
    `/makeup-recommendations/${encodeURIComponent(reportId)}`,
    {signal},
  );
  const mappedReport = mapBackendRecommendationReports([report])[0];

  if (!mappedReport) {
    throw new Error('추천 메이크업 보고서 결과가 비어 있어요.');
  }

  return mappedReport;
}

export async function startGeneratedMakeupRecommendation(
  input: StartMakeupRecommendationInput,
  scenarioTags: readonly string[] = [],
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const response = await backendRequest<{questions: BackendQuestion[]}>(
    '/makeup-recommendations/questions',
    {
      method: 'POST',
      body: {
        scenarioText: input.prompt.trim(),
        scenarioLabel: input.scenarioLabel?.trim() || undefined,
        scenarioTags,
      },
      signal,
    },
  );
  const questions = mapBackendQuestions(response.questions ?? []);
  if (questions.length === 0) throw new Error('추천 질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.');
  return {
    ...buildQuestionSession({...input, useProfile: false, personalColor: undefined}, questions),
    generationMode: 'backend',
  };
}

export async function answerGeneratedMakeupRecommendationQuestion(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
  scenarioTags: readonly string[] = [],
  backendRequest: typeof requestBackendJson = requestBackendJson,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  const expected = session.questions[session.currentQuestionIndex];
  if (!expected || expected.id !== answer.questionId) throw new Error('현재 질문과 맞지 않는 답변이에요.');
  const selectedOption = expected.options.find(option => option.id === answer.optionId);
  if (answer.optionId && !selectedOption) throw new Error('현재 질문에 없는 선택지예요.');
  if (!selectedOption && !answer.freeText?.trim()) throw new Error('선택지를 고르거나 답변을 입력해 주세요.');

  const answers = [...session.answers, answer];
  const nextIndex = session.currentQuestionIndex + 1;
  if (nextIndex < session.questions.length) {
    return {...session, answers, currentQuestionIndex: nextIndex};
  }

  const response = await backendRequest<{
    reportId: string;
    recommendation: BackendRecommendation;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>('/makeup-recommendations', {
    method: 'POST',
    body: {
      scenarioText: session.prompt,
      scenarioLabel: session.scenarioLabel,
      scenarioTags,
      questions: session.questions,
      answers,
    },
    timeoutMs: 180000,
    signal,
  });
  return {
    ...session,
    phase: 'results',
    currentQuestionIndex: session.questions.length,
    answers,
    results: mapBackendRecommendationLooks({
      reportId: response.reportId,
      recommendation: response.recommendation,
      prompt: session.prompt,
      questions: session.questions,
      answers,
    }),
    reportId: response.reportId,
    imageStatus: response.imageStatus,
    useProfile: false,
    personalColor: undefined,
    generationMode: 'backend',
  };
}

export async function refreshGeneratedMakeupRecommendation(
  session: MakeupRecommendationSession,
  signal?: AbortSignal,
  backendRequest: typeof requestBackendJson = requestBackendJson,
): Promise<MakeupRecommendationSession> {
  if (!session.reportId) return session;
  const report = await backendRequest<BackendRecommendationReport>(
    `/makeup-recommendations/${session.reportId}`,
    {signal},
  );
  const refreshedResults = mapBackendRecommendationLooks({
    reportId: session.reportId,
    recommendation: report.recommendation,
    prompt: session.prompt,
    questions: session.questions,
    answers: session.answers,
  });
  return {
    ...session,
    profileGender: getBackendReportProfileGender(report) ?? session.profileGender,
    sourceAnalysisReportId: report.sourceAnalysisReportId ?? session.sourceAnalysisReportId,
    imageStatus: report.imageStatus,
    imageError: report.imageError,
    results: refreshedResults.length > 0 ? refreshedResults : session.results,
  };
}

export async function retryGeneratedMakeupRecommendationImages(
  session: MakeupRecommendationSession,
  signal?: AbortSignal,
  lookId?: string,
  backendRequest: typeof requestBackendJson = requestBackendJson,
): Promise<MakeupRecommendationSession> {
  if (!session.reportId) throw new Error('다시 만들 추천 보고서를 찾지 못했어요.');
  const response = await backendRequest<{
    reportId: string;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>(`/makeup-recommendations/${session.reportId}/image/retry`, {
    method: 'POST',
    body: lookId ? {lookId} : undefined,
    signal,
  });
  return {...session, imageStatus: response.imageStatus, imageError: undefined};
}

export async function refineGeneratedMakeupRecommendation(
  session: MakeupRecommendationSession,
  refinement: MakeupRecommendationRefinement,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (session.phase !== 'results') {
    throw new Error('추천 결과가 나온 뒤에 조정할 수 있어요.');
  }
  if (!session.reportId) throw new Error('조정할 추천 보고서를 찾지 못했어요.');
  const response = await requestBackendJson<{
    reportId: string;
    recommendation: BackendRecommendation;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>(`/makeup-recommendations/${session.reportId}/refine`, {
    method: 'POST',
    body: {refinement},
    timeoutMs: 180000,
    signal,
  });
  return {
    ...session,
    id: response.reportId,
    reportId: response.reportId,
    imageStatus: response.imageStatus,
    imageError: undefined,
    results: mapBackendRecommendationLooks({
      reportId: response.reportId,
      recommendation: response.recommendation,
      prompt: session.prompt,
      questions: session.questions,
      answers: session.answers,
    }),
  };
}
