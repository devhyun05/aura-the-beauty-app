import {
  MAKEUP_LOOK_FIXTURES,
  MAKEUP_QUESTIONS,
  MAKEUP_SCENARIOS,
} from '../mocks/makeupRecommendation.mock';
import {requestBackendJson} from '../../../shared/services/backendApi';
import type {
  MakeupLookRecommendation,
  MakeupQuestionDimension,
  MakeupRecommendationAnswer,
  MakeupRecommendationProduct,
  MakeupRecommendationQuestion,
  MakeupRecommendationReportHistoryItem,
  MakeupRecommendationRefinement,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
  MakeupScenarioTone,
  ProductRecommendationProvider,
} from '../types';

export type StartMakeupRecommendationInput = {
  prompt: string;
  scenarioId?: string;
  scenarioLabel?: string;
  useProfile: boolean;
  personalColor?: string;
};

const QUESTION_PRIORITY: readonly MakeupQuestionDimension[] = [
  'occasion',
  'mood',
  'boldness',
  'timeSkill',
];
const TONES: readonly MakeupScenarioTone[] = ['narrative', 'playful', 'premium'];
const COPY_STYLES: readonly MakeupScenarioPrompt['copyStyle'][] = ['editorial', 'scene', 'monologue', 'narrative', 'character'];
const EMPHASES: readonly MakeupScenarioPrompt['visualEmphasis'][] = ['compact', 'featured', 'standard', 'whisper', 'hero'];
const PALETTES: readonly MakeupScenarioPrompt['palette'][] = ['paper', 'muted', 'mid', 'soft', 'ink', 'accent'];
const COLUMN_SPANS: readonly MakeupScenarioPrompt['preferredColumnSpan'][] = [7, 5, 5, 7, 8, 4, 6, 6];

type BackendScenarioItem = {id: string; text: string; seedPrompt?: string; tags?: string[]};
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
    area?: string;
    brandName?: string;
    productName?: string;
    shadeName?: string;
    reason?: string;
  }>;
  imageUrl?: string;
};
type BackendRecommendation = {
  looks?: BackendLook[];
};
type BackendRecommendationReport = {
  id: string;
  scenarioText?: string;
  recommendation: BackendRecommendation;
  imageStatus: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  imageError?: string;
  createdAt?: string;
};

export function mapBackendScenarioItems(items: readonly BackendScenarioItem[]): MakeupScenarioPrompt[] {
  return items
    .filter(item => item.id?.trim() && item.text?.trim())
    .map((item, index) => ({
      id: item.id,
      displayText: item.text.trim(),
      seedPrompt: item.seedPrompt?.trim() || item.text.trim(),
      intentTags: (item.tags ?? []).filter(Boolean),
      knownDimensions: [],
      tone: TONES[index % TONES.length],
      source: 'personalized',
      copyStyle: COPY_STYLES[index % COPY_STYLES.length],
      visualEmphasis: EMPHASES[index % EMPHASES.length],
      palette: PALETTES[index % PALETTES.length],
      preferredColumnSpan: COLUMN_SPANS[index % COLUMN_SPANS.length],
    }));
}

const GENERIC_SCENARIO_WORDS = ['메이크업', '스타일', '분위기', '느낌', '감성', '무드', '사진', '오늘', '하루', '룩'] as const;

function scenarioCopyKey(text: string): string {
  let normalized = text.toLocaleLowerCase();
  GENERIC_SCENARIO_WORDS.forEach(word => {
    normalized = normalized.replaceAll(word, '');
  });
  return normalized.replace(/[^0-9a-z가-힣]/g, '');
}

function bigrams(value: string): string[] {
  return Array.from({length: Math.max(0, value.length - 1)}, (_, index) => value.slice(index, index + 2));
}

function scenarioCopyIsSimilar(left: string, right: string): boolean {
  const rawLeft = left.toLocaleLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  const rawRight = right.toLocaleLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  if (rawLeft && rawLeft === rawRight) return true;
  const leftKey = scenarioCopyKey(left);
  const rightKey = scenarioCopyKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  const [shorter, longer] = [leftKey, rightKey].sort((a, b) => a.length - b.length);
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  const leftBigrams = bigrams(leftKey);
  const rightBigrams = bigrams(rightKey);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return false;
  const remaining = [...rightBigrams];
  const overlap = leftBigrams.reduce((count, pair) => {
    const index = remaining.indexOf(pair);
    if (index < 0) return count;
    remaining.splice(index, 1);
    return count + 1;
  }, 0);
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length) >= 0.78;
}

export function composeMakeupScenarioRefresh(
  curated: readonly MakeupScenarioPrompt[],
  generated: readonly MakeupScenarioPrompt[],
): MakeupScenarioPrompt[] {
  return [...curated.slice(0, 6), ...generated];
}

export function filterFreshMakeupScenarios(
  candidates: readonly MakeupScenarioPrompt[],
  excludeTexts: readonly string[],
): MakeupScenarioPrompt[] {
  const accepted: MakeupScenarioPrompt[] = [];
  const seen = [...excludeTexts];
  candidates.forEach(candidate => {
    if (seen.some(text => scenarioCopyIsSimilar(candidate.displayText, text))) return;
    accepted.push(candidate);
    seen.push(candidate.displayText);
  });
  return accepted;
}

export async function fetchGeneratedMakeupScenarios({
  count = 12,
  excludeTexts = [],
}: {
  count?: number;
  excludeTexts?: readonly string[];
} = {}): Promise<MakeupScenarioPrompt[]> {
  const response = await requestBackendJson<{items: BackendScenarioItem[]}>(
    '/makeup-recommendations/scenarios',
    {method: 'POST', body: {count, excludeTexts}},
  );
  return mapBackendScenarioItems(response.items ?? []);
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

export function getMakeupScenarioSet({seed}: {seed: number}): MakeupScenarioPrompt[] {
  const offset = Math.abs(Math.floor(seed)) % MAKEUP_SCENARIOS.length;
  const rotated = [...MAKEUP_SCENARIOS.slice(offset), ...MAKEUP_SCENARIOS.slice(0, offset)];
  const firstSix = ensureToneCoverage(rotated);
  return [
    ...firstSix,
    ...rotated.filter(item => !firstSix.some(first => first.id === item.id)),
  ].slice(0, 49);
}

export function getFallbackMakeupScenarios({
  count,
  excludeTexts,
  seed,
}: {
  count: number;
  excludeTexts: readonly string[];
  seed: number;
}): MakeupScenarioPrompt[] {
  const excluded = new Set(excludeTexts.map(text => text.trim().toLocaleLowerCase()).filter(Boolean));
  return getMakeupScenarioSet({seed})
    .filter(item => !excluded.has(item.displayText.trim().toLocaleLowerCase()))
    .slice(0, Math.max(0, count));
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

function cloneLook(look: MakeupLookRecommendation): MakeupLookRecommendation {
  return {
    ...look,
    reasons: [...look.reasons],
    appliedConditions: [...look.appliedConditions],
    steps: look.steps.map(step => ({...step})),
    products: look.products.map(product => ({...product})),
  };
}

export class FixtureProductRecommendationProvider implements ProductRecommendationProvider {
  recommendProducts(lookId: string): MakeupRecommendationProduct[] {
    const fixture = MAKEUP_LOOK_FIXTURES.find(look => look.id === lookId) ?? MAKEUP_LOOK_FIXTURES[0];
    return fixture.products.map(product => ({...product}));
  }
}

const fixtureProductProvider = new FixtureProductRecommendationProvider();

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
  const answers = [...session.answers, answer];
  const nextIndex = session.currentQuestionIndex + 1;
  const additionalConstraints =
    answer.additionalConstraints?.trim() || session.additionalConstraints;
  return nextIndex >= session.questions.length
    ? completeSession(session, answers, additionalConstraints)
    : {...session, answers, currentQuestionIndex: nextIndex, additionalConstraints};
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
    .filter(question => question.id?.trim() && question.title?.trim() && question.options?.length)
    .slice(0, 3)
    .map((question, index) => ({
      id: question.id,
      dimension: QUESTION_PRIORITY[index] ?? 'mood',
      title: question.title.trim(),
      options: question.options
        .filter(option => option.id?.trim() && option.label?.trim())
        .slice(0, 6)
        .map(option => ({id: option.id, label: option.label.trim()})),
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
  const conditions = [prompt, ...selectedAnswerLabels(questions, answers)];
  const validRoles: MakeupLookRecommendation['role'][] = ['anchor', 'bold', 'discovery'];
  return (recommendation.looks ?? []).flatMap((look, index) => {
    const role = validRoles.includes(look.role as MakeupLookRecommendation['role'])
      ? look.role as MakeupLookRecommendation['role']
      : undefined;
    if (!role) return [];
    const fixture = MAKEUP_LOOK_FIXTURES.find(item => item.role === role) ?? MAKEUP_LOOK_FIXTURES[index % MAKEUP_LOOK_FIXTURES.length];
    const difficulty = look.difficulty === 'easy' || look.difficulty === 'medium' || look.difficulty === 'advanced'
      ? look.difficulty
      : 'medium';
    return [{
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
        id: `${reportId}-${role}-product-${productIndex + 1}`,
        area: normalizedArea(product.area),
        brandName: product.brandName?.trim() || '추천 제품',
        productName: product.productName?.trim() ?? '',
        shadeName: product.shadeName?.trim() || undefined,
        reason: product.reason?.trim() || '추천 방향과 조화를 이루는 제품이에요.',
      })),
    }];
  });
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
    generationMode: 'backend',
  };
}

export async function fetchGeneratedMakeupRecommendationReports({
  limit = 20,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<MakeupRecommendationReportHistoryItem[]> {
  const response = await requestBackendJson<{reports: BackendRecommendationReport[]}>(
    `/makeup-recommendations?limit=${limit}&offset=${offset}`,
  );
  return mapBackendRecommendationReports(response.reports ?? []);
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
    timeoutMs: 90000,
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
): Promise<MakeupRecommendationSession> {
  if (!session.reportId) return session;
  const report = await requestBackendJson<BackendRecommendationReport>(
    `/makeup-recommendations/${session.reportId}`,
    {signal},
  );
  return {
    ...session,
    imageStatus: report.imageStatus,
    imageError: report.imageError,
    results: mapBackendRecommendationLooks({
      reportId: session.reportId,
      recommendation: report.recommendation,
      prompt: session.prompt,
      questions: session.questions,
      answers: session.answers,
    }),
  };
}

export async function retryGeneratedMakeupRecommendationImages(
  session: MakeupRecommendationSession,
  signal?: AbortSignal,
): Promise<MakeupRecommendationSession> {
  if (!session.reportId) throw new Error('다시 만들 추천 보고서를 찾지 못했어요.');
  const response = await requestBackendJson<{
    reportId: string;
    imageStatus: BackendRecommendationReport['imageStatus'];
  }>(`/makeup-recommendations/${session.reportId}/image/retry`, {method: 'POST', signal});
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
    timeoutMs: 90000,
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
