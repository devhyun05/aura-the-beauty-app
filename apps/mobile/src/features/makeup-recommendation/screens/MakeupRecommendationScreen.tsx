import {forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  answerMakeupRecommendationQuestion,
  getMakeupScenarioSet,
  refineMakeupRecommendation,
  startMakeupRecommendation,
  type StartMakeupRecommendationInput,
} from '../services/makeupRecommendationService';
import {
  type MakeupRecommendationAnswerKeyword,
  type MakeupRecommendationLoadingContext,
} from '../services/makeupRecommendationAgentConversation';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationAnswer,
  MakeupRecommendationRefinement,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
} from '../types';
import {RecommendationQuestionView} from './RecommendationQuestionView';
import {RecommendationAgentLoadingView} from './RecommendationAgentLoadingView';
import {RecommendationResultsView} from './RecommendationResultsView';
import {ScenarioDiscoveryView} from './ScenarioDiscoveryView';
import {shouldHandleMakeupRecommendationBack, type MakeupRecommendationScreenPhase} from './makeupRecommendationViewContracts';
export {shouldHandleMakeupRecommendationBack, type MakeupRecommendationScreenPhase} from './makeupRecommendationViewContracts';

export type MakeupRecommendationScreenHandle = {
  handleBack: () => boolean;
};

export type MakeupRecommendationScreenProps = {
  faceImageUri?: string;
  onApplyAR?: (look: MakeupLookRecommendation) => void;
  personalColor?: string;
};

function getAnswerKeyword(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
): MakeupRecommendationAnswerKeyword | null {
  const question = session.questions.find(item => item.id === answer.questionId);

  if (!question) {
    return null;
  }

  const optionLabel = question.options.find(option => option.id === answer.optionId)?.label;
  const label = optionLabel ?? answer.freeText?.trim();

  return label ? {dimension: question.dimension, label} : null;
}

function buildLoadingContextFromSession(
  session: MakeupRecommendationSession,
  nextAnswer?: MakeupRecommendationAnswer,
  refinement?: MakeupRecommendationRefinement,
): MakeupRecommendationLoadingContext {
  const answers = nextAnswer ? [...session.answers, nextAnswer] : session.answers;
  const answerKeywords = answers
    .map(answer => getAnswerKeyword(session, answer))
    .filter((keyword): keyword is MakeupRecommendationAnswerKeyword => Boolean(keyword));

  return {
    additionalConstraints:
      nextAnswer?.additionalConstraints?.trim() || session.additionalConstraints,
    answerKeywords,
    personalColor: session.personalColor,
    prompt: session.prompt,
    refinement,
    useProfile: session.useProfile,
  };
}

export const MakeupRecommendationScreen = forwardRef<
  MakeupRecommendationScreenHandle,
  MakeupRecommendationScreenProps
>(function MakeupRecommendationScreen({faceImageUri, onApplyAR, personalColor}, ref) {
  const [phase, setPhase] = useState<MakeupRecommendationScreenPhase>('discovery');
  const [prompt, setPrompt] = useState('');
  const [scenarioSeed, setScenarioSeed] = useState(0);
  const [useProfile, setUseProfile] = useState(Boolean(personalColor));
  const [session, setSession] = useState<MakeupRecommendationSession>();
  const [errorMessage, setErrorMessage] = useState('');
  const [refinementError, setRefinementError] = useState('');
  const [loadingContext, setLoadingContext] =
    useState<MakeupRecommendationLoadingContext | null>(null);
  const lastStartInput = useRef<StartMakeupRecommendationInput | undefined>(undefined);
  const lastRefinement = useRef<MakeupRecommendationRefinement | undefined>(undefined);
  const scenarios = useMemo(
    () => getMakeupScenarioSet({seed: scenarioSeed}),
    [scenarioSeed],
  );

  const runStart = useCallback((input: StartMakeupRecommendationInput) => {
    lastStartInput.current = input;
    setLoadingContext({
      answerKeywords: [],
      personalColor: input.personalColor,
      prompt: input.prompt,
      useProfile: input.useProfile,
    });
    setPhase('loading');
    setErrorMessage('');

    Promise.resolve()
      .then(() => startMakeupRecommendation(input))
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
    runStart({prompt: trimmedPrompt, useProfile, personalColor});
  };

  const startFromScenario = (scenario: MakeupScenarioPrompt) => {
    setPrompt(scenario.displayText);
    runStart({
      prompt: scenario.seedPrompt,
      scenarioId: scenario.id,
      useProfile,
      personalColor,
    });
  };

  const handleAnswer = (answer: MakeupRecommendationAnswer) => {
    if (!session) return;
    setLoadingContext(buildLoadingContextFromSession(session, answer));
    setPhase('loading');
    setErrorMessage('');

    Promise.resolve()
      .then(() => answerMakeupRecommendationQuestion(session, answer))
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
    setLoadingContext(buildLoadingContextFromSession(session, undefined, refinement));
    setPhase('loading');

    Promise.resolve()
      .then(() => refineMakeupRecommendation(session, refinement))
      .then(nextSession => {
        setSession(nextSession);
        setPhase(nextSession.phase);
      })
      .catch(error => {
        setRefinementError(
          error instanceof Error ? error.message : '조정하지 못했어요. 기존 추천은 그대로 두었어요.',
        );
        setPhase('results');
      });
  };

  const reset = useCallback(() => {
    setPhase('discovery');
    setSession(undefined);
    setPrompt('');
    setErrorMessage('');
    setRefinementError('');
    setLoadingContext(null);
    lastStartInput.current = undefined;
    lastRefinement.current = undefined;
  }, []);

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
        onChangeUseProfile={setUseProfile}
        onRefreshScenarios={() => setScenarioSeed(seed => seed + 7)}
        onSelectScenario={startFromScenario}
        onSubmitPrompt={startFromPrompt}
        personalColor={personalColor}
        prompt={prompt}
        scenarios={scenarios}
        useProfile={useProfile}
      />
    );
  }

  if (phase === 'loading') {
    return loadingContext ? (
      <RecommendationAgentLoadingView context={loadingContext} faceImageUri={faceImageUri} />
    ) : null;
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
