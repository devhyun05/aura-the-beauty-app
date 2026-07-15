import {
  MAKEUP_QUESTIONS,
  MAKEUP_SCENARIOS,
} from '../data/makeupRecommendationCatalog';
import {getLatestFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import {requestBackendJson} from '../../../shared/services/backendApi';
import type {
  MakeupLookRecommendation,
  MakeupQuestionDimension,
  MakeupRecommendationAnswer,
  MakeupRecommendationQuestion,
  MakeupRecommendationRefinement,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
  MakeupScenarioTone,
} from '../types';

export type StartMakeupRecommendationInput = {
  prompt: string;
  scenarioId?: string;
  useProfile: boolean;
  personalColor?: string;
};

type BackendMakeupLookRecommendation = Omit<MakeupLookRecommendation, 'imageSource'> & {
  imageUrl: string;
};

type GenerateMakeupRecommendationResponse = {
  imageModel: string;
  provider: 'openai';
  results: BackendMakeupLookRecommendation[];
  textModel: string;
};

const QUESTION_PRIORITY: readonly MakeupQuestionDimension[] = [
  'occasion',
  'mood',
  'boldness',
  'timeSkill',
];
const TONES: readonly MakeupScenarioTone[] = ['narrative', 'playful', 'premium'];

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

function imageSourceUri(source: unknown): string | undefined {
  if (Array.isArray(source)) {
    return source.map(imageSourceUri).find(Boolean);
  }

  if (
    source &&
    typeof source === 'object' &&
    'uri' in source &&
    typeof source.uri === 'string'
  ) {
    return source.uri;
  }

  return undefined;
}

async function completeSession(
  session: MakeupRecommendationSession,
  answers: MakeupRecommendationAnswer[],
  additionalConstraints?: string,
  refinement?: MakeupRecommendationRefinement,
): Promise<MakeupRecommendationSession> {
  const conditions = buildAppliedConditions(session, answers, additionalConstraints);
  const latestReport = await getLatestFaceAnalysisReport();
  const sourceImageUrl = imageSourceUri(latestReport?.imageSource);

  if (!latestReport || !sourceImageUrl?.startsWith('https://')) {
    throw new Error('먼저 얼굴 분석을 완료한 뒤 메이크업 추천을 다시 시도해 주세요.');
  }

  const response = await requestBackendJson<GenerateMakeupRecommendationResponse>(
    '/makeup-recommendations/generate',
    {
      baseUrl: process.env.EXPO_PUBLIC_MAKEUP_RECOMMENDATION_API_BASE_URL?.trim() || undefined,
      body: {
        conditions,
        personalColor: session.useProfile
          ? session.personalColor ?? latestReport.personalColor
          : undefined,
        profile: {
          faceShape: latestReport.faceShape,
          recommendedMood: latestReport.recommendedMood,
          skinType: latestReport.skinType,
          summary: latestReport.summary,
          toneSummary: latestReport.toneSummary,
        },
        prompt: session.prompt,
        refinement,
        sourceImageUrl,
      },
      method: 'POST',
      timeoutMs: 240000,
    },
  );

  return {
    ...session,
    phase: 'results',
    currentQuestionIndex: session.questions.length,
    answers,
    additionalConstraints,
    results: response.results.slice(0, 1).map(result => ({
      ...result,
      imageSource: {uri: result.imageUrl},
    })),
  };
}

async function buildCompletedSession(
  input: StartMakeupRecommendationInput,
  answers: MakeupRecommendationAnswer[],
): Promise<MakeupRecommendationSession> {
  return completeSession(buildQuestionSession(input, []), answers);
}

export async function startMakeupRecommendation(
  input: StartMakeupRecommendationInput,
): Promise<MakeupRecommendationSession> {
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

export async function answerMakeupRecommendationQuestion(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
): Promise<MakeupRecommendationSession> {
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
  if (nextIndex >= session.questions.length) {
    return completeSession(session, answers, additionalConstraints);
  }

  return {...session, answers, currentQuestionIndex: nextIndex, additionalConstraints};
}

export async function refineMakeupRecommendation(
  session: MakeupRecommendationSession,
  refinement: MakeupRecommendationRefinement,
): Promise<MakeupRecommendationSession> {
  if (session.phase !== 'results') throw new Error('추천 결과가 나온 뒤에 조정할 수 있어요.');
  return completeSession(
    {...session, phase: 'question', results: []},
    session.answers,
    session.additionalConstraints,
    refinement,
  );
}
