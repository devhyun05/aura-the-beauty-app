import {useCallback, useEffect, useMemo, useState} from 'react';

import type {MakeupFeedbackResult} from '../types';
import {feedbackHaptics} from './feedbackHaptics';
import {
  mapMakeupFeedbackResultToViewModel,
  type MakeupFeedbackRedesignRegionId,
} from './makeupFeedbackResultViewModel';
import {
  useFeedbackCountUp,
  useFeedbackReduceMotion,
} from './useFeedbackMotion';

type FeedbackRedesignScreen = 'home' | 'slides';
export type FeedbackRedesignTab = 'all' | MakeupFeedbackRedesignRegionId;

export function useMakeupFeedbackRedesignController({
  reduceMotion: reduceMotionOverride,
  result,
}: {
  reduceMotion?: boolean;
  result: MakeupFeedbackResult;
}) {
  const viewModel = useMemo(
    () => mapMakeupFeedbackResultToViewModel(result),
    [result],
  );
  const reduceMotion = useFeedbackReduceMotion(reduceMotionOverride);
  const [screen, setScreen] = useState<FeedbackRedesignScreen>('home');
  const [evaluationIndex, setEvaluationIndex] = useState(0);
  const [selectedTab, setSelectedTab] = useState<FeedbackRedesignTab>('all');
  const [openAxisId, setOpenAxisId] = useState<string | null>(null);
  const [score, restartScore] = useFeedbackCountUp(viewModel.score, {
    reduceMotion,
  });
  const summaryIndex = viewModel.evaluations.length;
  const isSummary = evaluationIndex >= summaryIndex;
  const currentEvaluation = isSummary
    ? null
    : viewModel.evaluations[evaluationIndex] ?? null;

  useEffect(() => {
    setScreen('home');
    setEvaluationIndex(0);
    setSelectedTab('all');
    setOpenAxisId(null);
  }, [result.id]);

  useEffect(() => {
    if (screen === 'home') {
      restartScore();
    }
  }, [restartScore, screen]);

  const goHome = useCallback(() => {
    feedbackHaptics.select();
    setScreen('home');
  }, []);

  const prepareCapture = useCallback(() => {
    setScreen('home');
  }, []);

  const restoreSlidesAfterCapture = useCallback(() => {
    setScreen('slides');
  }, []);

  const startSlides = useCallback(() => {
    feedbackHaptics.tap();
    setEvaluationIndex(0);
    setScreen('slides');
  }, []);

  const openEvaluation = useCallback((index: number) => {
    feedbackHaptics.select();
    setEvaluationIndex(Math.max(0, Math.min(summaryIndex, index)));
    setScreen('slides');
  }, [summaryIndex]);

  const next = useCallback(() => {
    feedbackHaptics.select();
    setEvaluationIndex(current => Math.min(summaryIndex, current + 1));
  }, [summaryIndex]);

  const previous = useCallback(() => {
    feedbackHaptics.select();
    setEvaluationIndex(current => Math.max(0, current - 1));
  }, []);

  const restart = useCallback(() => {
    feedbackHaptics.tap();
    setEvaluationIndex(0);
  }, []);

  const selectTab = useCallback((tab: FeedbackRedesignTab) => {
    feedbackHaptics.select();
    setSelectedTab(tab);
  }, []);

  const jumpToRegion = useCallback((regionId: MakeupFeedbackRedesignRegionId) => {
    const firstEvaluation = viewModel.evaluations.find(
      evaluation => evaluation.regionId === regionId,
    );

    if (firstEvaluation) {
      openEvaluation(firstEvaluation.index);
    }
  }, [openEvaluation, viewModel.evaluations]);

  const toggleAxis = useCallback((axisId: string) => {
    feedbackHaptics.select();
    setOpenAxisId(current => current === axisId ? null : axisId);
  }, []);

  const visibleGroups = useMemo(
    () => selectedTab === 'all'
      ? viewModel.groups
      : viewModel.groups.filter(group => group.id === selectedTab),
    [selectedTab, viewModel.groups],
  );

  const progressSegments = useMemo(() => {
    let startIndex = 0;

    return viewModel.groups.map(group => {
      const count = group.evaluations.length;
      let fill = 0;

      if (isSummary || evaluationIndex >= startIndex + count) {
        fill = 100;
      } else if (evaluationIndex >= startIndex && count > 0) {
        fill = Math.round(((evaluationIndex - startIndex + 1) / count) * 100);
      }

      startIndex += count;
      return {fill, flex: Math.max(1, count), id: group.id};
    });
  }, [evaluationIndex, isSummary, viewModel.groups]);

  const nextHint = useMemo(() => {
    if (isSummary) {
      return '';
    }

    if (evaluationIndex === summaryIndex - 1) {
      return '다음은 요약';
    }

    const nextEvaluation = viewModel.evaluations[evaluationIndex + 1];
    return nextEvaluation
      ? `다음: ${nextEvaluation.regionLabel} · ${nextEvaluation.topicLabel}`
      : '';
  }, [evaluationIndex, isSummary, summaryIndex, viewModel.evaluations]);

  return {
    currentEvaluation,
    evaluationIndex,
    goHome,
    isHome: screen === 'home',
    isSlides: screen === 'slides',
    isSummary,
    jumpToRegion,
    next,
    nextHint,
    openAxisId,
    openEvaluation,
    previous,
    prepareCapture,
    progressSegments,
    reduceMotion,
    restart,
    restoreSlidesAfterCapture,
    score,
    selectedTab,
    selectTab,
    startSlides,
    summaryIndex,
    toggleAxis,
    viewModel,
    visibleGroups,
  };
}

export type MakeupFeedbackRedesignController = ReturnType<
  typeof useMakeupFeedbackRedesignController
>;
