import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  answerGeneratedMakeupRecommendationQuestion,
  fetchGeneratedMakeupScenarios,
  getFallbackMakeupScenarios,
  getMakeupScenarioSet,
  refineGeneratedMakeupRecommendation,
  refreshGeneratedMakeupRecommendation,
  retryGeneratedMakeupRecommendationImages,
  startGeneratedMakeupRecommendation,
  type StartMakeupRecommendationInput,
} from '../services/makeupRecommendationService';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationAnswer,
  MakeupRecommendationRefinement,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
} from '../types';
import {RecommendationQuestionView} from './RecommendationQuestionView';
import {RecommendationResultsView} from './RecommendationResultsView';
import {ScenarioDiscoveryView} from './ScenarioDiscoveryView';
import {
  makeupRecommendationDiscoveryCopy,
  shouldHandleMakeupRecommendationBack,
  type MakeupRecommendationScreenPhase,
} from './makeupRecommendationViewContracts';
export {shouldHandleMakeupRecommendationBack, type MakeupRecommendationScreenPhase} from './makeupRecommendationViewContracts';

export type MakeupRecommendationScreenHandle = {
  handleBack: () => boolean;
};

export type MakeupRecommendationScreenProps = {
  onApplyAR?: (look: MakeupLookRecommendation) => void;
  personalColor?: string;
};

export const MakeupRecommendationScreen = forwardRef<
  MakeupRecommendationScreenHandle,
  MakeupRecommendationScreenProps
>(function MakeupRecommendationScreen({onApplyAR}, ref) {
  const initialScenarios = useRef(getMakeupScenarioSet({seed: 0}).slice(0, 12));
  const [phase, setPhase] = useState<MakeupRecommendationScreenPhase>('discovery');
  const [prompt, setPrompt] = useState('');
  const [scenarios, setScenarios] = useState<MakeupScenarioPrompt[]>(initialScenarios.current);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(false);
  const [scenarioError, setScenarioError] = useState('');
  const [session, setSession] = useState<MakeupRecommendationSession>();
  const [errorMessage, setErrorMessage] = useState('');
  const [refinementError, setRefinementError] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [imageRetryError, setImageRetryError] = useState('');
  const lastStartInput = useRef<StartMakeupRecommendationInput | undefined>(undefined);
  const lastRefinement = useRef<MakeupRecommendationRefinement | undefined>(undefined);
  const activeScenarioTags = useRef<string[]>([]);
  const seenScenarioTexts = useRef(new Set(initialScenarios.current.map(item => item.displayText)));
  const scenarioRequestInFlight = useRef(false);
  const localScenarioSeed = useRef(12);

  const loadScenarios = useCallback(async (mode: 'replace' | 'append') => {
    if (scenarioRequestInFlight.current) return;
    scenarioRequestInFlight.current = true;
    setIsLoadingScenarios(true);
    setScenarioError('');
    try {
      const generated = await fetchGeneratedMakeupScenarios({
        count: 12,
        excludeTexts: [...seenScenarioTexts.current].slice(-100),
      });
      const fresh = generated.filter(item => !seenScenarioTexts.current.has(item.displayText));
      if (fresh.length === 0) throw new Error('새 문장을 준비하지 못했어요.');
      fresh.forEach(item => seenScenarioTexts.current.add(item.displayText));
      setScenarios(previous => mode === 'replace' ? fresh : [...previous, ...fresh]);
    } catch (error) {
      const fallback = getFallbackMakeupScenarios({
        count: 12,
        excludeTexts: [...seenScenarioTexts.current],
        seed: localScenarioSeed.current,
      });
      localScenarioSeed.current += 12;
      if (fallback.length > 0) {
        fallback.forEach(item => seenScenarioTexts.current.add(item.displayText));
        setScenarios(previous => mode === 'replace' ? fallback : [...previous, ...fallback]);
      } else {
        setScenarioError(makeupRecommendationDiscoveryCopy.scenarioLoadError);
      }
    } finally {
      scenarioRequestInFlight.current = false;
      setIsLoadingScenarios(false);
    }
  }, []);

  useEffect(() => {
    void loadScenarios('replace');
  }, []); // Initial fixture cards stay visible if the network request fails.

  const runStart = useCallback((input: StartMakeupRecommendationInput) => {
    lastStartInput.current = input;
    setPhase('loading');
    setErrorMessage('');

    Promise.resolve()
      .then(() => startGeneratedMakeupRecommendation(input, activeScenarioTags.current))
      .then(nextSession => {
        setSession(nextSession);
        setPhase(nextSession.phase);
      })
      .catch(error => {
        setErrorMessage(error instanceof Error ? error.message : '추천을 시작하지 못했어요.');
        setPhase('error');
      });
  }, []);

  const startFromPrompt = () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    activeScenarioTags.current = [];
    runStart({prompt: trimmedPrompt, useProfile: false});
  };

  const startFromScenario = (scenario: MakeupScenarioPrompt) => {
    setPrompt(scenario.displayText);
    activeScenarioTags.current = [...scenario.intentTags];
    runStart({
      prompt: scenario.seedPrompt,
      scenarioId: scenario.id,
      useProfile: false,
    });
  };

  const handleAnswer = (answer: MakeupRecommendationAnswer) => {
    if (!session) return;
    setPhase('loading');
    setErrorMessage('');

    Promise.resolve()
      .then(() => answerGeneratedMakeupRecommendationQuestion(session, answer, activeScenarioTags.current))
      .then(nextSession => {
        setSession(nextSession);
        setPhase(nextSession.phase);
      })
      .catch(error => {
        setErrorMessage(error instanceof Error ? error.message : '답변을 반영하지 못했어요.');
        setPhase('error');
      });
  };

  const handleRefine = (refinement: MakeupRecommendationRefinement) => {
    if (!session) return;
    lastRefinement.current = refinement;
    setRefinementError('');
    setIsRefining(true);

    Promise.resolve()
      .then(() => refineGeneratedMakeupRecommendation(session, refinement))
      .then(nextSession => {
        setSession(nextSession);
      })
      .catch(error => {
        setRefinementError(
          error instanceof Error ? error.message : '조정하지 못했어요. 기존 추천은 그대로 두었어요.',
        );
      })
      .finally(() => setIsRefining(false));
  };

  const handleRetryImages = () => {
    if (!session) return;
    setImageRetryError('');
    void retryGeneratedMakeupRecommendationImages(session)
      .then(setSession)
      .catch(error => {
        setImageRetryError(error instanceof Error ? error.message : '이미지를 다시 만들지 못했어요.');
      });
  };

  const reset = useCallback(() => {
    setPhase('discovery');
    setSession(undefined);
    setPrompt('');
    setErrorMessage('');
    setRefinementError('');
    setImageRetryError('');
    lastStartInput.current = undefined;
    lastRefinement.current = undefined;
  }, []);

  useEffect(() => {
    if (phase !== 'results' || !session?.reportId || !['pending', 'processing'].includes(session.imageStatus ?? '')) return;
    const timer = setTimeout(() => {
      void refreshGeneratedMakeupRecommendation(session)
        .then(setSession)
        .catch(() => undefined);
    }, 2500);
    return () => clearTimeout(timer);
  }, [phase, session]);

  useImperativeHandle(
    ref,
    () => ({
      handleBack() {
        if (!shouldHandleMakeupRecommendationBack(phase)) return false;
        reset();
        return true;
      },
    }),
    [phase, reset],
  );

  const retry = () => {
    const input = lastStartInput.current;
    if (input) runStart(input);
    else setPhase('discovery');
  };

  if (phase === 'discovery') {
    return (
      <ScenarioDiscoveryView
        onChangePrompt={setPrompt}
        onLoadMoreScenarios={() => void loadScenarios('append')}
        onRefreshScenarios={() => void loadScenarios('replace')}
        onSelectScenario={startFromScenario}
        onSubmitPrompt={startFromPrompt}
        isLoadingScenarios={isLoadingScenarios}
        prompt={prompt}
        scenarioError={scenarioError}
        scenarios={scenarios}
      />
    );
  }

  if (phase === 'loading') {
    return (
      <AppScreen contentGap={spacing.md} scroll={false} topPadding="belowShellHeader">
        <ActivityIndicator color={colors.textPrimary} size="small" />
        <Text style={styles.loadingTitle}>당신의 오늘을 읽고 있어요</Text>
        <Text style={styles.loadingDescription}>상황과 무드가 자연스럽게 만나는 지점을 찾는 중이에요.</Text>
      </AppScreen>
    );
  }

  if (phase === 'question' && session) {
    const question = session.questions[session.currentQuestionIndex];
    if (question) {
      return (
        <RecommendationQuestionView
          currentQuestionIndex={session.currentQuestionIndex}
          onAnswer={handleAnswer}
          onBack={reset}
          question={question}
          questionCount={session.questions.length}
        />
      );
    }
  }

  if (phase === 'results' && session) {
    return (
      <RecommendationResultsView
        onApplyAR={look => onApplyAR?.(look)}
        onRefine={handleRefine}
        onReset={reset}
        onRetry={retry}
        onRetryRefinement={() => {
          if (lastRefinement.current) handleRefine(lastRefinement.current);
        }}
        refinementError={refinementError}
        results={session.results}
        imageStatus={session.imageStatus}
        generationMode={session.generationMode}
        imageRetryError={imageRetryError}
        isRefining={isRefining}
        onRetryImages={handleRetryImages}
      />
    );
  }

  return (
    <AppScreen contentGap={spacing.lg} scroll={false} topPadding="belowShellHeader">
      <Text style={styles.errorTitle}>추천을 이어가지 못했어요</Text>
      <Text style={styles.loadingDescription}>{errorMessage || '잠시 후 다시 시도해 주세요.'}</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryLabel}>다시 시도하기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={reset} style={styles.resetButton}>
        <Text style={styles.resetLabel}>처음으로 돌아가기</Text>
      </Pressable>
    </AppScreen>
  );
});

const styles = StyleSheet.create({
  loadingTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  loadingDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  retryLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  resetButton: {alignItems: 'center', justifyContent: 'center', minHeight: 48},
  resetLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
});
