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
    title: '사진 품질을 확인하고 있어요',
    description: '얼굴 방향, 밝기, 흔들림을 먼저 보고 분석 가능한 기준을 잡아요.',
  },
  {
    id: 'topic-scan',
    title: '10개 메이크업 항목을 읽고 있어요',
    description: '눈썹, 속눈썹, 렌즈, 아이라인부터 베이스와 윤곽까지 나눠 봐요.',
  },
  {
    id: 'classify',
    title: '잘한 포인트와 보완 포인트를 나누고 있어요',
    description: '각 항목을 잘한 점과 개선하면 좋은 점으로 분류해요.',
  },
  {
    id: 'report',
    title: 'AI 피드백 리포트를 구성하고 있어요',
    description: '바로 확인하기 쉬운 카드 형태로 분석 내용을 정리해요.',
  },
];

export const makeupFeedbackLoadingTip =
  '정면에 가까운 사진일수록 눈매, 베이스, 윤곽 항목을 더 안정적으로 비교할 수 있어요.';

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