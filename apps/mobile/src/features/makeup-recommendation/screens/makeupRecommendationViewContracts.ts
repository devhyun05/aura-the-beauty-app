import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {
  MakeupRecommendationDiscovery,
  MakeupRecommendationImageStatus,
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

export type MakeupRecommendationScreenPhase =
  | 'discovery'
  | 'history'
  | 'reportLoading'
  | 'loading'
  | 'question'
  | 'results'
  | 'error';

export function getInitialMakeupRecommendationScreenPhase({
  initialView,
  reportId,
}: {
  initialView: 'discovery' | 'history';
  reportId?: string;
}): MakeupRecommendationScreenPhase {
  return reportId?.trim() ? 'reportLoading' : initialView;
}

export function getMakeupRecommendationResultPhase(
  imageStatus: MakeupRecommendationImageStatus | undefined,
  waitingPhase: 'loading' | 'reportLoading',
): MakeupRecommendationScreenPhase {
  if (imageStatus === 'pending' || imageStatus === 'processing') return waitingPhase;
  if (imageStatus === 'partial' || imageStatus === 'failed') return 'error';
  return 'results';
}

export function shouldHandleMakeupRecommendationBack(
  phase: MakeupRecommendationScreenPhase,
  {directReportEntry = false}: {directReportEntry?: boolean} = {},
): boolean {
  return !directReportEntry && phase !== 'discovery';
}

export function getQuestionActionMode({currentQuestionIndex, questionCount}: {currentQuestionIndex: number; questionCount: number}): 'advance' | 'complete' {
  return currentQuestionIndex >= questionCount - 1 ? 'complete' : 'advance';
}
export function getQuestionProgressSegments({currentQuestionIndex, questionCount}: {currentQuestionIndex: number; questionCount: number}): Array<'complete' | 'pending'> {
  return Array.from({length: questionCount}, (_, index) => index <= currentQuestionIndex ? 'complete' : 'pending');
}
