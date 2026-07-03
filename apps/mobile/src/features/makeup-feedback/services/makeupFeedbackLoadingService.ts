import type {ImageSourcePropType} from 'react-native';

import {appAssetSource} from '../../../shared/config/mediaAssets';

export type MakeupFeedbackLoadingStep = {
  id: string;
  title: string;
  description: string;
};

export type MakeupFeedbackProgressState = {
  activeStep: MakeupFeedbackLoadingStep;
  progress: number;
  progressLabel: string;
  isComplete: boolean;
};

export const MAKEUP_FEEDBACK_LOADING_TOTAL_MS = 26000;

export const makeupFeedbackLoadingPreviewSource =
  appAssetSource('images/analysis/report-retake-20260608.png') as ImageSourcePropType;

export const makeupFeedbackLoadingSteps: readonly MakeupFeedbackLoadingStep[] = [
  {
    id: 'image-quality',
    title: '사진 상태를 확인하고 있어요',
    description: '밝기와 흔들림을 먼저 확인해 분석 기준을 맞추고 있어요.',
  },
  {
    id: 'goal-context',
    title: '상황 기준을 정리하고 있어요',
    description: '입력한 목적과 원하는 분위기를 피드백 기준으로 반영하고 있어요.',
  },
  {
    id: 'makeup-balance',
    title: '메이크업 균형을 살펴보고 있어요',
    description: '눈매, 베이스, 컬러감, 음영이 목적에 맞게 어울리는지 확인하고 있어요.',
  },
  {
    id: 'report',
    title: '피드백을 구성하고 있어요',
    description: '잘한 포인트와 보완 포인트를 보기 쉬운 결과로 정리하고 있어요.',
  },
];

export const makeupFeedbackLoadingTip =
  '정면에 가까운 사진일수록 눈매, 베이스, 색감의 균형을 더 안정적으로 비교할 수 있어요.';

function clampProgress(elapsedMs: number) {
  return Math.min(Math.max(elapsedMs / MAKEUP_FEEDBACK_LOADING_TOTAL_MS, 0), 1);
}

export function getMakeupFeedbackProgressState(
  elapsedMs: number,
): MakeupFeedbackProgressState {
  const progress = clampProgress(elapsedMs);
  const stepIndex = Math.min(
    Math.floor(progress * makeupFeedbackLoadingSteps.length),
    makeupFeedbackLoadingSteps.length - 1,
  );
  const progressPercent = Math.round(progress * 100);

  return {
    activeStep: makeupFeedbackLoadingSteps[stepIndex],
    progress,
    progressLabel: `${progressPercent}%`,
    isComplete: progress >= 1,
  };
}