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
    title: '1차 보고서를 만들고 있어요',
    description: '측정값만으로 바로 확인할 수 있는 균형 결과를 준비합니다.',
  },
  {
    id: 'mood',
    title: 'AI 분석을 연결하고 있어요',
    description: '1차 보고서를 먼저 열고 상세 분석은 보고서에 이어서 추가합니다.',
  },
];

export const faceAnalysisLoadingTip =
  '카메라 측정 보고서는 먼저 볼 수 있고, AI 분석 결과는 보고서에 자동으로 추가돼요.';

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
