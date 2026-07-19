import type {Look, PartKey} from '../screens/recommendationResultTypes';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationAnswer,
  MakeupRecommendationQuestion,
} from '../types';
import {toRecommendationResultLooks} from './toRecommendationResultLooks';

export type FinalRecommendationAnswerRow = {
  id: string;
  questionLabel: string;
  answerLabel: string;
};

export type FinalRecommendationMatch = {
  value: number | null;
  source: 'server-match' | 'insufficient-evidence' | 'legacy-unavailable';
  explanation: string;
};

export type FinalRecommendationResultModel = {
  sourceLook: MakeupLookRecommendation;
  look: Look;
  answerRows: FinalRecommendationAnswerRow[];
  additionalConstraints?: string;
  match: FinalRecommendationMatch;
};

export type FinalRecommendationResultOptions = {
  personalColor?: string;
  questions?: readonly MakeupRecommendationQuestion[];
  answers?: readonly MakeupRecommendationAnswer[];
  additionalConstraints?: string;
};

function trimmed(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveAnswerLabel(
  question: MakeupRecommendationQuestion,
  answer: MakeupRecommendationAnswer,
): string | undefined {
  const optionLabel = answer.optionId
    ? trimmed(question.options.find(option => option.id === answer.optionId)?.label)
    : undefined;
  return optionLabel ?? trimmed(answer.freeText);
}

export function toFinalRecommendationAnswerRows(
  questions: readonly MakeupRecommendationQuestion[] = [],
  answers: readonly MakeupRecommendationAnswer[] = [],
): FinalRecommendationAnswerRow[] {
  const answersByQuestion = new Map<string, MakeupRecommendationAnswer[]>();

  for (const answer of answers) {
    const existing = answersByQuestion.get(answer.questionId);
    if (existing) existing.push(answer);
    else answersByQuestion.set(answer.questionId, [answer]);
  }

  const seenRows = new Set<string>();
  const rows: FinalRecommendationAnswerRow[] = [];

  for (const question of questions) {
    const questionLabel = trimmed(question.title);
    if (!questionLabel) continue;

    const answerLabel = answersByQuestion
      .get(question.id)
      ?.map(answer => resolveAnswerLabel(question, answer))
      .find((label): label is string => Boolean(label));
    if (!answerLabel) continue;

    const rowKey = `${questionLabel}\u0000${answerLabel}`;
    if (seenRows.has(rowKey)) continue;
    seenRows.add(rowKey);
    rows.push({id: question.id, questionLabel, answerLabel});
  }

  return rows;
}

export function clampFinalLookMapCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

function deriveFinalRecommendationMatch(
  sourceLook: MakeupLookRecommendation,
): FinalRecommendationMatch {
  const assessment = sourceLook.matchAssessment;
  if (!assessment) {
    return {
      value: null,
      source: 'legacy-unavailable',
      explanation: '매칭률 정보가 없는 이전 결과예요.',
    };
  }
  if (assessment.score === null) {
    return {
      value: null,
      source: 'insufficient-evidence',
      explanation: '선택한 상황과 분석 정보가 충분하지 않아 퍼센트를 계산하지 않았어요.',
    };
  }
  return {
    value: clampFinalLookMapCoordinate(assessment.score),
    source: 'server-match',
    explanation: '선택한 상황과 분석 정보를 기준으로 계산한 예상값이에요.',
  };
}

function resolveAdditionalConstraints(
  directValue: string | undefined,
  answers: readonly MakeupRecommendationAnswer[],
): string | undefined {
  const direct = trimmed(directValue);
  if (direct) return direct;

  for (let index = answers.length - 1; index >= 0; index -= 1) {
    const fromAnswer = trimmed(answers[index]?.additionalConstraints);
    if (fromAnswer) return fromAnswer;
  }

  return undefined;
}

export function toFinalRecommendationResult(
  results: readonly MakeupLookRecommendation[],
  options: FinalRecommendationResultOptions = {},
): FinalRecommendationResultModel | null {
  const sourceLook = results.find(result => result.role === 'anchor') ?? results[0];
  if (!sourceLook) return null;

  const mappedLook = toRecommendationResultLooks(
    [sourceLook],
    {personalColor: options.personalColor},
  )[0];
  if (!mappedLook) return null;

  const answers = options.answers ?? [];
  const answerRows = toFinalRecommendationAnswerRows(options.questions, answers);
  const additionalConstraints = resolveAdditionalConstraints(options.additionalConstraints, answers);
  const match = deriveFinalRecommendationMatch(sourceLook);
  const look: Look = {
    ...mappedLook,
    match: match.value,
    mx: clampFinalLookMapCoordinate(mappedLook.mx),
    my: clampFinalLookMapCoordinate(mappedLook.my),
  };

  return {
    sourceLook,
    look,
    answerRows,
    additionalConstraints,
    match,
  };
}
