import type {MakeupLookRole} from '../types';

export const makeupRecommendationDiscoveryCopy = {
  eyebrow: '',
  title: '어떤 모습이 끌리나요?',
  description: '마음에 걸리는 한 문장에서 시작해보세요.',
  placeholder: '내 이야기로 추천 받기',
  profile: '내 분석 결과 반영',
  submit: '확인',
  refresh: '새로 보기',
} as const;

export const makeupRecommendationHistoryCopy = {
  title: '지난 추천',
  description: '저장한 메이크업 추천을 다시 확인해보세요.',
  empty: '아직 저장된 추천이 없어요.',
  error: '추천 기록을 불러오지 못했어요.',
} as const;

export function formatMakeupRecommendationHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export type MakeupRecommendationScreenPhase = 'discovery' | 'loading' | 'question' | 'results' | 'error';
export function shouldHandleMakeupRecommendationBack(phase: MakeupRecommendationScreenPhase): boolean {
  return phase !== 'discovery';
}

export function getQuestionActionMode({currentQuestionIndex, questionCount}: {currentQuestionIndex: number; questionCount: number}): 'advance' | 'complete' {
  return currentQuestionIndex >= questionCount - 1 ? 'complete' : 'advance';
}
export function getQuestionProgressSegments({currentQuestionIndex, questionCount}: {currentQuestionIndex: number; questionCount: number}): Array<'complete' | 'pending'> {
  return Array.from({length: questionCount}, (_, index) => index <= currentQuestionIndex ? 'complete' : 'pending');
}

export const makeupRecommendationResultRoleLabels: Record<MakeupLookRole, string> = {
  anchor: '가장 잘 어울리는 메이크업',
  bold: '조금 더 과감한 메이크업',
  discovery: '예상 밖의 발견',
};
export function toggleExpandedLookId(previous: Set<string>, lookId: string): Set<string> {
  const next = new Set(previous);
  if (next.has(lookId)) next.delete(lookId);
  else next.add(lookId);
  return next;
}
