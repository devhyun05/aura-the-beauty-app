import type {MakeupLookRole} from '../types';

export const makeupRecommendationDiscoveryCopy = {
  eyebrow: '',
  title: '어떤 모습이 끌리나요?',
  description: '마음에 걸리는 한 문장에서 시작해보세요.',
  placeholder: '내 이야기로 추천 받기',
  profile: '내 분석 결과 반영',
  submit: '확인',
  refresh: '새로 보기',
  scenarioLoadError: '새 카드를 더 만들지 못했어요. 잠시 후 다시 눌러주세요.',
} as const;

export const makeupRecommendationHistoryCopy = {
  action: '지난 추천',
  title: '지난 추천',
  description: '저장된 메이크업 추천을 다시 살펴보세요.',
  empty: '아직 저장된 추천이 없어요.',
  error: '지난 추천을 불러오지 못했어요.',
} as const;

export function formatMakeupRecommendationHistoryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}. ${match[2]}. ${match[3]}.` : '';
}

export type MakeupRecommendationScreenPhase = 'discovery' | 'history' | 'loading' | 'question' | 'results' | 'error';
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
export const makeupRecommendationImageStatusCopy = {
  failedAction: '이미지 다시 만들기',
} as const;
export const makeupRecommendationFallbackCopy = {
  description: 'AI 연결이 잠시 불안정해 검수된 임시 추천을 보여드려요. 이 결과는 보고서에 저장되지 않았어요.',
  retryAction: 'AI 추천 다시 연결하기',
} as const;
export const makeupRecommendationReportStatusCopy = {
  saved: '보고서 저장됨',
  temporary: '임시 추천',
} as const;
export function toggleExpandedLookId(previous: Set<string>, lookId: string): Set<string> {
  const next = new Set(previous);
  if (next.has(lookId)) next.delete(lookId);
  else next.add(lookId);
  return next;
}
