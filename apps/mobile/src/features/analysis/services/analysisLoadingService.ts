import type {ImageSourcePropType} from 'react-native';

export type AnalysisLoadingStep = {
  id: string;
  title: string;
  description: string;
};

export type AnalysisProgressState = {
  activeStep: AnalysisLoadingStep;
  progress: number;
  progressLabel: string;
  isComplete: boolean;
};

export const ANALYSIS_LOADING_TOTAL_MS = 3200;

export const analysisLoadingPreviewSource =
  require('../../../assets/images/user-page/report-bare-face-20260622.png') as ImageSourcePropType;

export const mockAnalysisLoadingSteps: readonly AnalysisLoadingStep[] = [
  {
    id: 'face-map',
    title: '얼굴 균형을 확인하고 있어요',
    description: '촬영한 이미지를 기준으로 윤곽과 주요 포인트를 정렬합니다.',
  },
  {
    id: 'tone',
    title: '피부 톤을 분석하고 있어요',
    description: '밝기와 채도를 비교해 자연스럽게 어울리는 톤을 찾습니다.',
  },
  {
    id: 'mood',
    title: '맞춤 필터 조건을 설계해요',
    description: '데모용 mock 데이터로 어울리는 베이스, 아이, 립 조합을 준비합니다.',
  },
];

export const analysisLoadingTip =
  '정확한 추천 필터를 위해 정면 사진과 자연광에 가까운 밝기를 기준으로 분석해요.';

function clampProgress(elapsedMs: number) {
  return Math.min(Math.max(elapsedMs / ANALYSIS_LOADING_TOTAL_MS, 0), 1);
}

export function getAnalysisProgressState(elapsedMs: number): AnalysisProgressState {
  const progress = clampProgress(elapsedMs);
  const stepIndex = Math.min(
    Math.floor(progress * mockAnalysisLoadingSteps.length),
    mockAnalysisLoadingSteps.length - 1,
  );
  const progressPercent = Math.round(progress * 100);

  return {
    activeStep: mockAnalysisLoadingSteps[stepIndex],
    progress,
    progressLabel: `${progressPercent}%`,
    isComplete: progress >= 1,
  };
}
