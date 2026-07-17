import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {BackendApiError, isRequestAbortedError} from '../../../shared/services/backendApi';
import {
  answerGeneratedMakeupRecommendationQuestion,
  fetchGeneratedMakeupRecommendationReport,
  fetchGeneratedMakeupRecommendationReports,
  getMakeupScenarioSet,
  getPopularMakeupScenarios,
  refineGeneratedMakeupRecommendation,
  refreshGeneratedMakeupRecommendation,
  restoreMakeupRecommendationReport,
  retryGeneratedMakeupRecommendationImages,
  startGeneratedMakeupRecommendation,
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
  MakeupRecommendationReportHistoryItem,
  MakeupScenarioPrompt,
} from '../types';
import {RecommendationQuestionView} from './RecommendationQuestionView';
import {RecommendationHistoryView} from './RecommendationHistoryView';
import {RecommendationAgentLoadingView} from './RecommendationAgentLoadingView';
import {RecommendationResultsView} from './RecommendationResultsView';
import {ScenarioDiscoveryView} from './ScenarioDiscoveryView';
import {
  shouldHandleMakeupRecommendationBack,
  type MakeupRecommendationScreenPhase,
} from './makeupRecommendationViewContracts';
export {shouldHandleMakeupRecommendationBack, type MakeupRecommendationScreenPhase} from './makeupRecommendationViewContracts';

export type MakeupRecommendationScreenHandle = {
  handleBack: () => boolean;
};

export type MakeupRecommendationScreenProps = {
  compactReportView?: boolean;
  faceImageUri?: string;
  initialReportId?: string;
  initialView?: 'discovery' | 'history';
  onApplyAR?: (look: MakeupLookRecommendation) => void;
  personalColor?: string;
};

const HISTORY_PAGE_SIZE = 20;
const IMAGE_POLL_MAX_FAILURES = 3;
export const INITIAL_GENERAL_SCENARIO_COUNT = 7;
export const SCENARIO_LOAD_MORE_COUNT = 12;

function getMakeupRecommendationErrorDiagnostic(error: unknown): string {
  if (!__DEV__ || !(error instanceof BackendApiError) || !error.code) return '';
  const providerCode = typeof error.details?.providerCode === 'string' ? error.details.providerCode : '';
  const validationErrors = Array.isArray(error.details?.validationErrors) ? error.details.validationErrors : [];
  const validationSummary = validationErrors
    .slice(0, 3)
    .map(item => {
      if (!item || typeof item !== 'object') return '';
      const validationError = item as Record<string, unknown>;
      const loc = Array.isArray(validationError.loc) ? validationError.loc.join('.') : '';
      const type = typeof validationError.type === 'string' ? validationError.type : '';
      return [loc, type].filter(Boolean).join(':');
    })
    .filter(Boolean)
    .join(', ');
  return ` (${[error.code, providerCode, validationSummary].filter(Boolean).join(' / ')})`;
}

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
>(function MakeupRecommendationScreen({
  compactReportView = false,
  faceImageUri,
  initialReportId,
  initialView = 'discovery',
  onApplyAR,
}, ref) {
  const initialScenarioSeed = useRef(Math.floor(Math.random() * 10_000));
  const scenarioSeed = useRef(initialScenarioSeed.current);
  const popularScenarios = useRef(getPopularMakeupScenarios());
  const [phase, setPhase] = useState<MakeupRecommendationScreenPhase>(initialView);
  const [prompt, setPrompt] = useState('');
  const [scenarioOrder, setScenarioOrder] = useState(() => getMakeupScenarioSet({seed: scenarioSeed.current}));
  const [visibleScenarioCount, setVisibleScenarioCount] = useState(INITIAL_GENERAL_SCENARIO_COUNT);
  const [session, setSession] = useState<MakeupRecommendationSession>();
  const [errorMessage, setErrorMessage] = useState('');
  const [refinementError, setRefinementError] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [imageRetryError, setImageRetryError] = useState('');
  const [historyItems, setHistoryItems] = useState<MakeupRecommendationReportHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingContext, setLoadingContext] =
    useState<MakeupRecommendationLoadingContext | null>(null);
  const lastStartInput = useRef<StartMakeupRecommendationInput | undefined>(undefined);
  const lastRefinement = useRef<MakeupRecommendationRefinement | undefined>(undefined);
  const activeScenarioTags = useRef<string[]>([]);
  const imagePollFailureCount = useRef(0);
  const workflowRequest = useRef<{controller: AbortController; id: number} | undefined>(undefined);
  const mutationRequest = useRef<{controller: AbortController; id: number} | undefined>(undefined);
  const operationSequence = useRef(0);
  const loadedInitialReportId = useRef<string | null>(null);
  const loadedInitialView = useRef(false);

  const beginOperation = useCallback((slot: typeof workflowRequest) => {
    slot.current?.controller.abort();
    const operation = {controller: new AbortController(), id: ++operationSequence.current};
    slot.current = operation;
    return operation;
  }, []);

  const scenarios = scenarioOrder.slice(0, visibleScenarioCount);
  const canLoadMoreScenarios = visibleScenarioCount < scenarioOrder.length;
  const refreshScenarios = useCallback(() => {
    scenarioSeed.current += 17;
    setScenarioOrder(getMakeupScenarioSet({seed: scenarioSeed.current}));
    setVisibleScenarioCount(INITIAL_GENERAL_SCENARIO_COUNT);
  }, []);
  const loadMoreScenarios = useCallback(() => {
    setVisibleScenarioCount(previous => Math.min(previous + SCENARIO_LOAD_MORE_COUNT, scenarioOrder.length));
  }, [scenarioOrder.length]);

  const runStart = useCallback((input: StartMakeupRecommendationInput) => {
    const operation = beginOperation(workflowRequest);
    lastStartInput.current = input;
    imagePollFailureCount.current = 0;
    setLoadingContext({
      answerKeywords: [],
      personalColor: input.personalColor,
      prompt: input.prompt,
      useProfile: input.useProfile,
    });
    setPhase('loading');
    setErrorMessage('');
    setImageRetryError('');

    Promise.resolve()
      .then(() => startGeneratedMakeupRecommendation(
        input,
        activeScenarioTags.current,
        undefined,
        operation.controller.signal,
      ))
      .then(nextSession => {
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(nextSession);
        setPhase(nextSession.phase);
      })
      .catch(error => {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
        setErrorMessage('AI 질문을 만들지 못했어요. 잠시 후 다시 시도해주세요.');
        setPhase('error');
      });
  }, [beginOperation]);

  const loadHistory = useCallback(async (mode: 'replace' | 'append' = 'replace') => {
    if (mode === 'append') setIsLoadingMoreHistory(true);
    else setIsLoadingHistory(true);
    setHistoryError('');
    try {
      const offset = mode === 'append' ? historyItems.length : 0;
      const reports = await fetchGeneratedMakeupRecommendationReports({limit: HISTORY_PAGE_SIZE, offset});
      setHistoryItems(previous => {
        if (mode === 'replace') return reports;
        const known = new Set(previous.map(item => item.reportId));
        return [...previous, ...reports.filter(item => !known.has(item.reportId))];
      });
      setHasMoreHistory(reports.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '지난 추천을 불러오지 못했어요.');
    } finally {
      setIsLoadingHistory(false);
      setIsLoadingMoreHistory(false);
    }
  }, [historyItems.length]);

  const openHistory = () => {
    setPhase('history');
    void loadHistory();
  };

  useEffect(() => {
    if (initialView !== 'history' || loadedInitialView.current) {
      return;
    }

    loadedInitialView.current = true;
    void loadHistory();
  }, [initialView, loadHistory]);

  const openHistoryReport = (report: MakeupRecommendationReportHistoryItem) => {
    imagePollFailureCount.current = 0;
    setImageRetryError('');
    setSession(restoreMakeupRecommendationReport(report));
    setPhase('results');
  };

  useEffect(() => {
    const reportId = initialReportId?.trim();
    if (!reportId || loadedInitialReportId.current === reportId) {
      return;
    }

    loadedInitialReportId.current = reportId;
    const operation = beginOperation(workflowRequest);
    setLoadingContext({
      answerKeywords: [],
      prompt: '완성된 추천 메이크업 보고서를 불러오는 중이에요.',
      useProfile: false,
    });
    setPhase('loading');
    setErrorMessage('');

    void fetchGeneratedMakeupRecommendationReport(
      reportId,
      operation.controller.signal,
    )
      .then(report => {
        if (workflowRequest.current?.id !== operation.id) return;
        openHistoryReport(report);
      })
      .catch(error => {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) {
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : '추천 메이크업 보고서를 불러오지 못했어요.',
        );
        setPhase('error');
      });

    return () => {
      if (workflowRequest.current?.id === operation.id) {
        operation.controller.abort();
      }
    };
  }, [beginOperation, initialReportId]);

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
      scenarioLabel: scenario.displayText,
      useProfile: false,
    });
  };

  const handleAnswer = (answer: MakeupRecommendationAnswer) => {
    if (!session) return;
    const operation = beginOperation(workflowRequest);
    imagePollFailureCount.current = 0;
    setLoadingContext(buildLoadingContextFromSession(session, answer));
    setPhase('loading');
    setErrorMessage('');
    setImageRetryError('');

    Promise.resolve()
      .then(() => answerGeneratedMakeupRecommendationQuestion(
        session,
        answer,
        activeScenarioTags.current,
        undefined,
        operation.controller.signal,
      ))
      .then(nextSession => {
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(nextSession);
        setPhase(nextSession.phase);
      })
      .catch(error => {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
        setErrorMessage(`AI 추천을 만들지 못했어요. 잠시 후 다시 시도해주세요.${getMakeupRecommendationErrorDiagnostic(error)}`);
        setPhase('error');
      });
  };

  const handleRefine = (refinement: MakeupRecommendationRefinement) => {
    if (!session) return;
    const operation = beginOperation(mutationRequest);
    lastRefinement.current = refinement;
    setRefinementError('');
    setIsRefining(true);
    setLoadingContext(buildLoadingContextFromSession(session, undefined, refinement));
    setPhase('loading');

    Promise.resolve()
      .then(() => refineGeneratedMakeupRecommendation(session, refinement, operation.controller.signal))
      .then(nextSession => {
        if (mutationRequest.current?.id !== operation.id) return;
        setSession(nextSession);
        setPhase(nextSession.phase);
      })
      .catch(error => {
        if (isRequestAbortedError(error) || mutationRequest.current?.id !== operation.id) return;
        setRefinementError(
          error instanceof Error ? error.message : '조정하지 못했어요. 기존 추천은 그대로 두었어요.',
        );
        setPhase('results');
      })
      .finally(() => {
        if (mutationRequest.current?.id === operation.id) setIsRefining(false);
      });
  };

  const handleRetryImages = () => {
    if (!session) return;
    const operation = beginOperation(mutationRequest);
    setImageRetryError('');
    void retryGeneratedMakeupRecommendationImages(session, operation.controller.signal)
      .then(nextSession => {
        if (mutationRequest.current?.id === operation.id) setSession(nextSession);
      })
      .catch(error => {
        if (isRequestAbortedError(error) || mutationRequest.current?.id !== operation.id) return;
        setImageRetryError(error instanceof Error ? error.message : '이미지를 다시 만들지 못했어요.');
      });
  };

  const reset = useCallback(() => {
    workflowRequest.current?.controller.abort();
    mutationRequest.current?.controller.abort();
    workflowRequest.current = undefined;
    mutationRequest.current = undefined;
    setPhase('discovery');
    setSession(undefined);
    setPrompt('');
    setErrorMessage('');
    setRefinementError('');
    setLoadingContext(null);
    setImageRetryError('');
    imagePollFailureCount.current = 0;
    lastStartInput.current = undefined;
    lastRefinement.current = undefined;
  }, []);

  useEffect(() => {
    if (phase !== 'results' || !session?.reportId || !['pending', 'processing'].includes(session.imageStatus ?? '')) return;
    const controller = new AbortController();
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      void refreshGeneratedMakeupRecommendation(session, controller.signal)
        .then(nextSession => {
          if (!cancelled) {
            imagePollFailureCount.current = 0;
            setSession(nextSession);
          }
        })
        .catch(error => {
          if (cancelled || isRequestAbortedError(error)) return;
          imagePollFailureCount.current += 1;
          if (imagePollFailureCount.current >= IMAGE_POLL_MAX_FAILURES) {
            setImageRetryError('이미지 상태를 확인하지 못했어요. 추천 내용은 그대로 볼 수 있어요.');
            setSession(current => {
              if (!current || current.reportId !== session.reportId) return current;
              return {...current, imageStatus: 'failed', imageError: '이미지 상태 확인 실패'};
            });
            return;
          }
          retryTimer = setTimeout(poll, 5000);
        });
    };
    const timer = setTimeout(() => {
      poll();
    }, 2500);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
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
        onLoadMoreScenarios={loadMoreScenarios}
        onOpenHistory={openHistory}
        onRefreshScenarios={refreshScenarios}
        onSelectScenario={startFromScenario}
        onSubmitPrompt={startFromPrompt}
        canLoadMoreScenarios={canLoadMoreScenarios}
        popularScenarios={popularScenarios.current}
        prompt={prompt}
        scenarios={scenarios}
      />
    );
  }

  if (phase === 'history') {
    return (
      <RecommendationHistoryView
        error={historyError}
        isLoading={isLoadingHistory}
        isLoadingMore={isLoadingMoreHistory}
        items={historyItems}
        canLoadMore={hasMoreHistory}
        onBack={() => setPhase('discovery')}
        onRefresh={() => void loadHistory()}
        onLoadMore={() => void loadHistory('append')}
        onSelect={openHistoryReport}
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
          scenarioLabel={session.scenarioLabel}
        />
      );
    }
  }

  if (phase === 'results' && session) {
    return (
      <RecommendationResultsView
        compactReportView={compactReportView}
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
        isReportSaved={Boolean(session.reportId)}
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
