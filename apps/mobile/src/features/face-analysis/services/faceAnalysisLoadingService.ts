import type {ImageSourcePropType} from 'react-native';

export type FaceAnalysisLoadingStep = {
  id: string;
  title: string;
  description: string;
};

export type FaceAnalysisProgressState = {
  activeStep: FaceAnalysisLoadingStep;
  progress: number;
  progressLabel: string;
  isComplete: boolean;
};

export const FACE_ANALYSIS_LOADING_TOTAL_MS = 30000;

export const faceAnalysisLoadingPreviewSource =
  require('../../../assets/images/analysis/report-bare-face-20260622.png') as ImageSourcePropType;

export const faceAnalysisLoadingSteps: readonly FaceAnalysisLoadingStep[] = [
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
    title: '추천 메이크업을 생성하고 있어요',
    description: '촬영 사진 기준으로 보고서와 추천 룩 3개를 준비합니다.',
  },
];

export const faceAnalysisLoadingTip =
  '정확한 맞춤 필터 생성을 위해 정면 사진과 자연광에 가까운 밝기를 기준으로 분석해요.';

function clampProgress(elapsedMs: number) {
  return Math.min(Math.max(elapsedMs / FACE_ANALYSIS_LOADING_TOTAL_MS, 0), 1);
}

export function getFaceAnalysisProgressState(
  elapsedMs: number,
): FaceAnalysisProgressState {
  const progress = clampProgress(elapsedMs);
  const stepIndex = Math.min(
    Math.floor(progress * faceAnalysisLoadingSteps.length),
    faceAnalysisLoadingSteps.length - 1,
  );
  const progressPercent = Math.round(progress * 100);

  return {
    activeStep: faceAnalysisLoadingSteps[stepIndex],
    progress,
    progressLabel: `${progressPercent}%`,
    isComplete: progress >= 1,
  };
}
