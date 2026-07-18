import type {ImageSourcePropType} from 'react-native';

import {appAssetSource} from '../../../shared/config/mediaAssets';

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
  appAssetSource('images/analysis/report-bare-face-20260622.png') as ImageSourcePropType;

export const faceAnalysisLoadingSteps: readonly FaceAnalysisLoadingStep[] = [
  {
    id: 'face-map',
    title: '카메라 측정을 정리하고 있어요',
    description: '정면 사진과 3D 측정값을 하나의 얼굴 프로필로 합칩니다.',
  },
  {
    id: 'tone',
    title: '사진에서 이목구비를 분석하고 있어요',
    description: 'AI가 얼굴형과 부위별 특징을 확인합니다.',
  },
  {
    id: 'mood',
    title: '맞춤 제안을 정리하고 있어요',
    description: 'AI 분석 결과를 바탕으로 메이크업 가이드를 만듭니다.',
  },
];

export const faceAnalysisLoadingTip =
  'AI 분석이 완료된 경우에만 보고서를 보여드려요.';

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
