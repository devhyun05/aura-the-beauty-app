import type {MakeupLookRole} from '../types';

export const makeupRecommendationDiscoveryCopy = {
  eyebrow: 'AI MAKEUP DISCOVERY',
  title: '어떤 모습이 끌리나요?',
  description: '설명하기 어렵다면 천천히 둘러보세요. 마음에 걸리는 한 문장에서 시작해도 좋아요.',
  placeholder: '원하는 느낌이나 상황을 들려주세요',
  profile: '내 분석 결과 반영',
  submit: '내 이야기로 추천받기',
  refresh: '새로 보기',
} as const;

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
  anchor: '가장 잘 어울리는 룩',
  bold: '조금 더 과감한 룩',
  discovery: '예상 밖의 발견',
};
export function toggleExpandedLookId(previous: Set<string>, lookId: string): Set<string> {
  const next = new Set(previous);
  if (next.has(lookId)) next.delete(lookId);
  else next.add(lookId);
  return next;
}
