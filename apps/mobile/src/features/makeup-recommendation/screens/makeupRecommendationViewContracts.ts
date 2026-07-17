import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {
  MakeupLookRole,
  MakeupRecommendationDiscovery,
  MakeupRecommendationProfileGender,
} from '../types';

type ReportVisibilityDiscovery = Pick<MakeupRecommendationDiscovery, 'source' | 'sourceReportIds'>;

export function isMakeupRecommendationReportAllowedByDiscovery(
  reportId: string,
  discovery?: ReportVisibilityDiscovery,
): boolean {
  return discovery?.source !== 'api' || new Set(discovery.sourceReportIds ?? []).has(reportId);
}

export function filterMakeupRecommendationReportsByDiscovery(
  reports: FaceAnalysisReport[],
  discovery?: ReportVisibilityDiscovery,
): FaceAnalysisReport[] {
  if (discovery?.source !== 'api') return reports;
  const allowedReportIds = new Set(discovery.sourceReportIds ?? []);
  return reports.filter(report => allowedReportIds.has(report.id));
}

export const makeupRecommendationDiscoveryCopy = {
  eyebrow: 'AI MAKEUP RECOMMENDATION',
  title: '어떤 상황을 위한 메이크업인가요?',
  description: '얼굴 분석 보고서와 상황을 함께 보고 나에게 맞는 룩을 추천해요.',
  placeholder: '원하는 상황을 직접 설명해 주세요',
  profile: '내 분석 결과 반영',
  submit: '확인',
  refresh: '새로 보기',
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
  partial: '일부 룩 이미지는 준비 중이거나 실패했어요. 완성된 추천과 부위별 가이드는 바로 볼 수 있어요.',
} as const;
export const makeupRecommendationReportStatusCopy = {
  saved: '보고서 저장됨',
} as const;

export const neutralGenderRecommendationNote =
  '성별을 선택하지 않아 중성적인 표현을 기준으로 추천했어요.';

export function getNeutralGenderRecommendationNote(
  profileGender?: MakeupRecommendationProfileGender,
): string | undefined {
  return profileGender === 'unspecified'
    ? neutralGenderRecommendationNote
    : undefined;
}

export function toggleExpandedLookId(previous: Set<string>, lookId: string): Set<string> {
  const next = new Set(previous);
  if (next.has(lookId)) next.delete(lookId);
  else next.add(lookId);
  return next;
}
