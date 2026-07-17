import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Pressable, StyleSheet, Text} from 'react-native';

import {BackendApiError, getBackendApiBaseUrl, isRequestAbortedError} from '../../../shared/services/backendApi';
import {
  getFaceAnalysisReportById,
  getFaceAnalysisReports,
} from '../../../shared/services/faceAnalysisService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  answerGeneratedMakeupRecommendationQuestionV2,
  createMakeupRecommendationIdempotencyKey,
  fetchGeneratedMakeupRecommendationReport,
  fetchGeneratedMakeupRecommendationReports,
  fetchGeneratedMakeupRecommendationSessionV2,
  fetchMakeupRecommendationDiscovery,
  generateMakeupRecommendationV2,
  refineGeneratedMakeupRecommendation,
  refineMakeupRecommendation,
  refreshGeneratedMakeupRecommendation,
  restoreMakeupRecommendationReport,
  retryGeneratedMakeupRecommendationImages,
  startGeneratedMakeupRecommendationV2,
  type StartMakeupRecommendationV2Input,
} from '../services/makeupRecommendationService';
import {
  getMakeupRecommendationCustomSituationServerError,
  validateMakeupRecommendationCustomSituation,
} from '../services/makeupRecommendationCustomSituationValidation';
import {
  clearCurrentMakeupRecommendationSessionId,
  getMakeupRecommendationSessionRestoreDestination,
  readCurrentMakeupRecommendationSessionId,
  saveCurrentMakeupRecommendationSessionId,
  shouldDiscardStoredMakeupRecommendationSessionForError,
} from '../services/makeupRecommendationSessionPersistence';
import {
  markKnownMakeupRecommendationImageEvents,
  takeNewMakeupRecommendationImageEvents,
  trackMakeupRecommendationEvent,
} from '../services/makeupRecommendationTelemetry';
import {
  type MakeupRecommendationAnswerKeyword,
  type MakeupRecommendationLoadingContext,
} from '../services/makeupRecommendationAgentConversation';
import {
  getSelectedFaceAnalysisReport,
  getSelectedMakeupSituation,
  initialMakeupRecommendationDiscoveryState,
  makeupRecommendationDiscoveryReducer,
} from '../state/makeupRecommendationDiscoveryReducer';
import type {
  MakeupGuideArea,
  MakeupLookRecommendation,
  MakeupRecommendationAnswer,
  MakeupRecommendationRefinement,
  MakeupRecommendationReportHistoryItem,
  MakeupRecommendationSession,
  MakeupScenarioPrompt,
  MakeupSituation,
  MakeupTrendKeyword,
} from '../types';
import {RecommendationAgentLoadingView} from './RecommendationAgentLoadingView';
import {RecommendationHistoryView} from './RecommendationHistoryView';
import {RecommendationQuestionView} from './RecommendationQuestionView';
import {RecommendationResultsView} from './RecommendationResultsView';
import {ScenarioDiscoveryView} from './ScenarioDiscoveryView';
import {
  filterMakeupRecommendationReportsByDiscovery,
  isMakeupRecommendationReportAllowedByDiscovery,
  shouldHandleMakeupRecommendationBack,
  type MakeupRecommendationScreenPhase,
} from './makeupRecommendationViewContracts';
export {shouldHandleMakeupRecommendationBack, type MakeupRecommendationScreenPhase} from './makeupRecommendationViewContracts';

export type MakeupRecommendationScreenHandle = {
  handleBack: () => boolean;
};

export type MakeupRecommendationScreenProps = {
  faceImageUri?: string;
  analysisReportId?: string;
  initialView?: 'discovery' | 'history';
  onApplyAR?: (look: MakeupLookRecommendation) => void;
  onStartFaceAnalysis?: () => void;
  personalColor?: string;
  reportId?: string;
};

// Kept as exports for the temporary v1 contract runner. V2 renders a fixed 4-card hierarchy.
export const INITIAL_GENERAL_SCENARIO_COUNT = 7;
export const SCENARIO_LOAD_MORE_COUNT = 12;

const HISTORY_PAGE_SIZE = 20;
const IMAGE_POLL_MAX_FAILURES = 3;
const SESSION_RESTORE_POLL_MS = 2500;
const SESSION_RESTORE_MAX_POLLS = 72;

function waitForSessionRestorePoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      clearTimeout(timer);
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      reject(error);
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, SESSION_RESTORE_POLL_MS);
    signal.addEventListener('abort', onAbort, {once: true});
    if (signal.aborted) onAbort();
  });
}

async function pollGeneratingSession(
  initialSession: MakeupRecommendationSession,
  signal: AbortSignal,
): Promise<MakeupRecommendationSession> {
  let currentSession = initialSession;
  let pollCount = 0;
  while (currentSession.status === 'generating') {
    if (pollCount >= SESSION_RESTORE_MAX_POLLS) {
      throw new Error('추천 생성 시간이 초과됐어요. 답변은 저장되어 있어요.');
    }
    pollCount += 1;
    await waitForSessionRestorePoll(signal);
    currentSession = await fetchGeneratedMakeupRecommendationSessionV2(
      currentSession.id,
      undefined,
      signal,
    );
  }
  return currentSession;
}

function isMakeupRecommendationGeneratingConflict(error: unknown): boolean {
  return error instanceof BackendApiError
    && error.status === 409
    && (
      error.code === 'MAKEUP_SESSION_GENERATING'
      || error.code === 'MAKEUP_SESSION_STATE_CHANGED'
    );
}

function getMakeupRecommendationErrorDiagnostic(error: unknown): string {
  if (!__DEV__ || !(error instanceof BackendApiError) || !error.code) return '';
  const providerCode = typeof error.details?.providerCode === 'string' ? error.details.providerCode : '';
  return ` (${[error.code, providerCode].filter(Boolean).join(' / ')})`;
}


function getAnswerKeyword(
  session: MakeupRecommendationSession,
  answer: MakeupRecommendationAnswer,
): MakeupRecommendationAnswerKeyword | null {
  const question = session.questions.find(item => item.id === answer.questionId);
  if (!question) return null;
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
  return {
    additionalConstraints: nextAnswer?.additionalConstraints?.trim() || session.additionalConstraints,
    answerKeywords: answers
      .map(answer => getAnswerKeyword(session, answer))
      .filter((keyword): keyword is MakeupRecommendationAnswerKeyword => Boolean(keyword)),
    personalColor: session.personalColor,
    prompt: session.prompt,
    refinement,
    useProfile: session.useProfile,
  };
}

function imageUriFromSource(source: unknown): string | undefined {
  if (!source || typeof source !== 'object' || Array.isArray(source) || !('uri' in source)) return undefined;
  return typeof source.uri === 'string' ? source.uri : undefined;
}

export const MakeupRecommendationScreen = forwardRef<
  MakeupRecommendationScreenHandle,
  MakeupRecommendationScreenProps
>(function MakeupRecommendationScreen({
  faceImageUri,
  analysisReportId,
  initialView = 'discovery',
  onApplyAR,
  onStartFaceAnalysis,
  personalColor,
  reportId,
}, ref) {
  const [phase, setPhase] = useState<MakeupRecommendationScreenPhase>(initialView);
  const [discovery, dispatchDiscovery] = useReducer(
    makeupRecommendationDiscoveryReducer,
    initialMakeupRecommendationDiscoveryState,
  );
  const [session, setSession] = useState<MakeupRecommendationSession>();
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [customSituationServerError, setCustomSituationServerError] = useState('');
  const [refinementError, setRefinementError] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [imageRetryError, setImageRetryError] = useState('');
  const [historyItems, setHistoryItems] = useState<MakeupRecommendationReportHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingContext, setLoadingContext] = useState<MakeupRecommendationLoadingContext | null>(null);
  const [reportLoadAttempt, setReportLoadAttempt] = useState(0);
  const lastStartInput = useRef<StartMakeupRecommendationV2Input | undefined>(undefined);
  const lastRefinement = useRef<MakeupRecommendationRefinement | undefined>(undefined);
  const imagePollFailureCount = useRef(0);
  const workflowRequest = useRef<{controller: AbortController; id: number} | undefined>(undefined);
  const mutationRequest = useRef<{controller: AbortController; id: number} | undefined>(undefined);
  const operationSequence = useRef(0);
  const imageTelemetryReportIds = useRef(new Set<string>());
  const answerRequestInFlight = useRef(false);
  const emittedImageTelemetryKeys = useRef(new Set<string>());
  const loadedReportId = useRef<string | null>(null);
  const loadedInitialView = useRef(false);

  const beginOperation = useCallback((slot: typeof workflowRequest) => {
    slot.current?.controller.abort();
    const operation = {controller: new AbortController(), id: ++operationSequence.current};
    slot.current = operation;
    return operation;
  }, []);

  useEffect(() => () => {
    workflowRequest.current?.controller.abort();
    mutationRequest.current?.controller.abort();
  }, []);

  useEffect(() => {
    trackMakeupRecommendationEvent('makeup_recommendation_opened', {
      category: 'v2',
      modelVersion: 'makeup-recommendation-v2',
      status: 'opened',
    });
  }, []);

  const loadDiscoveryData = useCallback(async () => {
    dispatchDiscovery({type: 'catalog/loading'});
    dispatchDiscovery({type: 'reports/loading'});

    const [catalogResult, reportsResult] = await Promise.allSettled([
      fetchMakeupRecommendationDiscovery(),
      getFaceAnalysisReports({limit: 50}),
    ]);
    const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : undefined;

    if (catalogResult.status === 'fulfilled') {
      dispatchDiscovery({type: 'catalog/loaded', catalog: catalogResult.value});
    } else {
      dispatchDiscovery({
        type: 'catalog/failed',
        message: catalogResult.reason instanceof Error
          ? catalogResult.reason.message
          : '상황 목록을 불러오지 못했어요.',
      });
    }

    if (reportsResult.status === 'rejected') {
      dispatchDiscovery({
        type: 'reports/failed',
        message: reportsResult.reason instanceof Error
          ? reportsResult.reason.message
          : '얼굴 분석 보고서를 불러오지 못했어요.',
      });
      return;
    }

    const reports = filterMakeupRecommendationReportsByDiscovery(reportsResult.value, catalog);
    const routeReportIsAllowed = !analysisReportId
      || isMakeupRecommendationReportAllowedByDiscovery(analysisReportId, catalog);
    if (analysisReportId && routeReportIsAllowed && !reports.some(item => item.id === analysisReportId)) {
      try {
        const requested = await getFaceAnalysisReportById(analysisReportId);
        if (requested) reports.unshift(requested);
      } catch {
        // Ownership/not-found stays hidden; latest owned completed report remains the safe default.
      }
    }
    dispatchDiscovery({type: 'reports/loaded', reports, preferredReportId: analysisReportId});
  }, [analysisReportId]);

  useEffect(() => {
    void loadDiscoveryData();
  }, [loadDiscoveryData]);

  const selectedReport = getSelectedFaceAnalysisReport(discovery);
  const selectedSituation = getSelectedMakeupSituation(discovery);
  const selectedFaceImageUri = faceImageUri ?? imageUriFromSource(selectedReport?.imageSource);

  const resolveReadySession = useCallback(async (
    nextSession: MakeupRecommendationSession,
    signal: AbortSignal,
  ) => {
    const hydrateCompletedSession = async (completedSession: MakeupRecommendationSession) => {
      if (!completedSession.reportId) throw new Error('완료된 추천 보고서를 찾지 못했어요.');
      const hydrated = await refreshGeneratedMakeupRecommendation(completedSession, signal);
      if (hydrated.results.length === 0) throw new Error('저장된 추천 결과를 복원하지 못했어요.');
      await clearCurrentMakeupRecommendationSessionId(AsyncStorage, completedSession.id);
      return hydrated;
    };

    let activeSession = nextSession;
    if (activeSession.generationMode === 'v2' && activeSession.status === 'generating') {
      activeSession = await pollGeneratingSession(activeSession, signal);
      if (activeSession.status === 'failed') {
        throw new Error('추천 생성이 완료되지 않았어요. 답변은 저장되어 있으니 다시 시도해주세요.');
      }
    }
    if (activeSession.generationMode === 'v2' && activeSession.status === 'completed') {
      return hydrateCompletedSession(activeSession);
    }
    if (activeSession.phase !== 'ready') return activeSession;

    const startedAt = Date.now();
    trackMakeupRecommendationEvent('recommendation_generation_started', {
      id: activeSession.id,
      modelVersion: 'makeup-recommendation-v2',
      status: 'started',
    });
    let generated: MakeupRecommendationSession;
    try {
      generated = await generateMakeupRecommendationV2(activeSession, undefined, signal);
    } catch (error) {
      if (!isMakeupRecommendationGeneratingConflict(error)) throw error;
      let recoveringSession = await fetchGeneratedMakeupRecommendationSessionV2(
        activeSession.id,
        undefined,
        signal,
      );
      recoveringSession = await pollGeneratingSession(recoveringSession, signal);
      if (recoveringSession.status === 'completed') {
        generated = await hydrateCompletedSession(recoveringSession);
      } else if (recoveringSession.status === 'failed') {
        throw new Error('추천 생성이 완료되지 않았어요. 답변은 저장되어 있으니 다시 시도해주세요.');
      } else {
        throw error;
      }
    }
    await clearCurrentMakeupRecommendationSessionId(AsyncStorage, activeSession.id);
    if (generated.reportId) imageTelemetryReportIds.current.add(generated.reportId);
    trackMakeupRecommendationEvent('recommendation_text_completed', {
      id: generated.reportId ?? generated.id,
      durationMs: Date.now() - startedAt,
      modelVersion: 'makeup-recommendation-v2',
      status: 'completed',
    });
    return generated;
  }, []);

  useEffect(() => {
    if (reportId?.trim()) return undefined;
    const operation = beginOperation(workflowRequest);
    const isCurrent = () => workflowRequest.current?.id === operation.id;
    void (async () => {
      let storedSessionId: string | null = null;
      try {
        storedSessionId = await readCurrentMakeupRecommendationSessionId(AsyncStorage);
        if (!storedSessionId || !isCurrent()) return;
        let restored = await fetchGeneratedMakeupRecommendationSessionV2(
          storedSessionId,
          undefined,
          operation.controller.signal,
        );
        if (!isCurrent()) return;
        setLoadingContext(buildLoadingContextFromSession(restored));

        if (restored.status === 'generating') {
          setSession(restored);
          setPhase('loading');
          restored = await pollGeneratingSession(restored, operation.controller.signal);
        }
        if (!isCurrent()) return;

        const destination = getMakeupRecommendationSessionRestoreDestination(restored);
        if (destination === 'discard') {
          await clearCurrentMakeupRecommendationSessionId(AsyncStorage, storedSessionId);
          if (isCurrent()) {
            setSession(undefined);
            setLoadingContext(null);
            setPhase('discovery');
          }
          return;
        }
        if (destination === 'question') {
          setSession(restored);
          setPhase('question');
          return;
        }
        if (destination === 'retry') {
          setSession(restored);
          setErrorMessage('이전 추천 생성이 완료되지 않았어요. 답변은 그대로 유지했으니 다시 시도해 주세요.');
          setPhase('error');
          return;
        }

        setSession(restored);
        setPhase('loading');
        if (destination === 'loading') {
          const generated = await resolveReadySession(restored, operation.controller.signal);
          if (!isCurrent()) return;
          setSession(generated);
          setPhase('results');
          return;
        }

        const hydrated = await refreshGeneratedMakeupRecommendation(
          restored,
          operation.controller.signal,
        );
        if (hydrated.results.length === 0) throw new Error('저장된 추천 결과를 복원하지 못했어요.');
        await clearCurrentMakeupRecommendationSessionId(AsyncStorage, storedSessionId);
        if (!isCurrent()) return;
        setSession(hydrated);
        setPhase('results');
      } catch (error) {
        if (isRequestAbortedError(error) || !isCurrent()) return;
        if (storedSessionId && shouldDiscardStoredMakeupRecommendationSessionForError(error)) {
          await clearCurrentMakeupRecommendationSessionId(AsyncStorage, storedSessionId);
        }
        setSession(undefined);
        setLoadingContext(null);
        setPhase('discovery');
      } finally {
        if (isCurrent()) workflowRequest.current = undefined;
      }
    })();
    return () => operation.controller.abort();
  }, [beginOperation, reportId, resolveReadySession]);

  const runStart = useCallback((input: StartMakeupRecommendationV2Input) => {
    const operation = beginOperation(workflowRequest);
    lastStartInput.current = input;
    imagePollFailureCount.current = 0;
    setIsStarting(true);
    setErrorMessage('');
    setCustomSituationServerError('');
    setImageRetryError('');

    void (async () => {
      try {
        await clearCurrentMakeupRecommendationSessionId(AsyncStorage);
        const startedSession = await startGeneratedMakeupRecommendationV2(
          input,
          undefined,
          operation.controller.signal,
        );
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(startedSession);
        if (startedSession.generationMode === 'v2') {
          await saveCurrentMakeupRecommendationSessionId(startedSession.id, AsyncStorage);
        }
        if (workflowRequest.current?.id !== operation.id) return;
        const nextSession = await resolveReadySession(startedSession, operation.controller.signal);
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(nextSession);
        setPhase(nextSession.phase === 'ready' ? 'loading' : nextSession.phase);
      } catch (error) {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
        const customSituationError = !input.customSituationLabel && input.customSituationText
          ? getMakeupRecommendationCustomSituationServerError(error)
          : null;
        if (customSituationError) {
          setCustomSituationServerError(customSituationError);
          return;
        }
        setErrorMessage(`추천 질문을 만들지 못했어요. 잠시 후 다시 시도해주세요.${getMakeupRecommendationErrorDiagnostic(error)}`);
        setPhase('error');
      } finally {
        if (workflowRequest.current?.id === operation.id) setIsStarting(false);
      }
    })();
  }, [beginOperation, resolveReadySession]);

  const startFromKeyword = useCallback((keyword: MakeupTrendKeyword) => {
    if (!selectedReport || !selectedSituation || isStarting) return;
    trackMakeupRecommendationEvent('makeup_keyword_selected', {
      id: keyword.id,
      category: keyword.kind,
      status: 'selected',
    });
    dispatchDiscovery({type: 'keyword/selected', keywordId: keyword.id});
    runStart({
      analysisReportId: selectedReport.id,
      idempotencyKey: createMakeupRecommendationIdempotencyKey(),
      forceFixture: discovery.catalog?.source === 'fixture' && !getBackendApiBaseUrl(),
      imageMode: 'personalized',
      keyword,
      personalColor: selectedReport.personalColor || personalColor,
      situation: selectedSituation,
    });
  }, [discovery.catalog?.source, isStarting, personalColor, runStart, selectedReport, selectedSituation]);

  const startFromEditorialTrend = useCallback((trend: MakeupScenarioPrompt) => {
    if (!selectedReport || isStarting) return;
    trackMakeupRecommendationEvent('makeup_keyword_selected', {
      id: trend.id,
      category: 'editorial',
      status: 'selected',
    });
    if (trend.situation && trend.keyword) {
      dispatchDiscovery({type: 'situation/selected', situationId: trend.situation.id});
      dispatchDiscovery({type: 'keyword/selected', keywordId: trend.keyword.id});
      runStart({
        analysisReportId: selectedReport.id,
        idempotencyKey: createMakeupRecommendationIdempotencyKey(),
        forceFixture: discovery.catalog?.source === 'fixture' && !getBackendApiBaseUrl(),
        imageMode: 'personalized',
        keyword: trend.keyword,
        personalColor: selectedReport.personalColor || personalColor,
        situation: trend.situation,
      });
      return;
    }
    runStart({
      analysisReportId: selectedReport.id,
      idempotencyKey: createMakeupRecommendationIdempotencyKey(),
      editorialPresetId: trend.id,
      editorialPresetLabel: trend.displayText,
      editorialPresetPrompt: trend.seedPrompt,
      forceFixture: discovery.catalog?.source === 'fixture' && !getBackendApiBaseUrl(),
      imageMode: 'personalized',
      personalColor: selectedReport.personalColor || personalColor,
    });
  }, [discovery.catalog?.source, isStarting, personalColor, runStart, selectedReport]);

  const startFromCustom = useCallback(() => {
    const validation = validateMakeupRecommendationCustomSituation(discovery.customSituationText);
    if (!selectedReport || !validation.isValid || isStarting) return;
    const customSituationText = validation.normalizedText;
    trackMakeupRecommendationEvent('custom_situation_submitted', {
      id: selectedReport.id,
      category: 'custom',
      status: 'submitted',
    });
    runStart({
      analysisReportId: selectedReport.id,
      idempotencyKey: createMakeupRecommendationIdempotencyKey(),
      customSituationText,
      forceFixture: discovery.catalog?.source === 'fixture' && !getBackendApiBaseUrl(),
      imageMode: 'personalized',
      personalColor: selectedReport.personalColor || personalColor,
    });
  }, [discovery.catalog?.source, discovery.customSituationText, isStarting, personalColor, runStart, selectedReport]);

  const handleAnswer = (answer: MakeupRecommendationAnswer) => {
    if (!session || answerRequestInFlight.current) return;
    answerRequestInFlight.current = true;
    const isFinalQuestion = session.currentQuestionIndex >= session.questions.length - 1;
    const answeredQuestion = session.questions.find(question => question.id === answer.questionId);
    trackMakeupRecommendationEvent('recommendation_question_answered', {
      id: answer.questionId,
      category: answeredQuestion?.dimension,
      status: answer.freeText?.trim() ? 'free_text' : 'option',
    });
    const operation = beginOperation(workflowRequest);
    imagePollFailureCount.current = 0;
    if (isFinalQuestion) {
      setLoadingContext(buildLoadingContextFromSession(session, answer));
      setPhase('loading');
    }
    setErrorMessage('');
    setImageRetryError('');

    void (async () => {
      try {
        const answeredSession = await answerGeneratedMakeupRecommendationQuestionV2(
          session,
          answer,
          undefined,
          operation.controller.signal,
        );
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(answeredSession);
        if (answeredSession.generationMode === 'v2') {
          await saveCurrentMakeupRecommendationSessionId(answeredSession.id, AsyncStorage);
        }
        if (workflowRequest.current?.id !== operation.id) return;
        const nextSession = await resolveReadySession(answeredSession, operation.controller.signal);
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(nextSession);
        setPhase(nextSession.phase === 'ready' ? 'loading' : nextSession.phase);
      } catch (error) {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
        setErrorMessage(`AI 추천을 만들지 못했어요. 응답은 저장되어 있으니 다시 시도해주세요.${getMakeupRecommendationErrorDiagnostic(error)}`);
        setPhase('error');
      } finally {
        answerRequestInFlight.current = false;
      }
    })();  };

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

  useEffect(() => {
    if (initialView !== 'history' || loadedInitialView.current) return;

    loadedInitialView.current = true;
    void loadHistory();
  }, [initialView, loadHistory]);

  const openHistoryReport = useCallback((report: MakeupRecommendationReportHistoryItem) => {
    const restored = restoreMakeupRecommendationReport(report);
    const operation = beginOperation(workflowRequest);
    imagePollFailureCount.current = 0;
    setImageRetryError('');
    setLoadingContext(buildLoadingContextFromSession(restored));
    setSession(restored);
    setPhase('loading');
    void refreshGeneratedMakeupRecommendation(restored, operation.controller.signal)
      .then(nextSession => {
        if (workflowRequest.current?.id !== operation.id) return;
        setSession(nextSession);
        setPhase('results');
      })
      .catch(error => {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
        setImageRetryError('상세 이미지 상태를 불러오지 못했어요. 저장된 추천 내용은 그대로 보여드려요.');
        setPhase('results');
      });
  }, [beginOperation]);

  useEffect(() => {
    const requestedReportId = reportId?.trim();
    if (!requestedReportId) {
      loadedReportId.current = null;
      return undefined;
    }
    if (loadedReportId.current === requestedReportId) return undefined;

    loadedReportId.current = requestedReportId;
    const operation = beginOperation(workflowRequest);
    setSession(undefined);
    setLoadingContext({
      answerKeywords: [],
      prompt: '완성된 추천 메이크업 보고서를 불러오는 중이에요.',
      useProfile: false,
    });
    setPhase('loading');
    setErrorMessage('');
    setImageRetryError('');

    void (async () => {
      try {
        await clearCurrentMakeupRecommendationSessionId(AsyncStorage);
        if (workflowRequest.current?.id !== operation.id) return;
        const requestedReport = await fetchGeneratedMakeupRecommendationReport(
          requestedReportId,
          operation.controller.signal,
        );
        if (workflowRequest.current?.id !== operation.id) return;
        openHistoryReport(requestedReport);
      } catch (error) {
        if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
        loadedReportId.current = null;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : '추천 메이크업 보고서를 불러오지 못했어요.',
        );
        setPhase('error');
      }
    })();

    return () => {
      if (workflowRequest.current?.id === operation.id) operation.controller.abort();
    };
  }, [beginOperation, openHistoryReport, reportId, reportLoadAttempt]);

  const handleRefine = (refinement: MakeupRecommendationRefinement) => {
    if (!session) return;
    const operation = beginOperation(mutationRequest);
    const startedAt = Date.now();
    trackMakeupRecommendationEvent('recommendation_generation_started', {
      id: session.reportId ?? session.id,
      category: 'refinement',
      modelVersion: 'makeup-recommendation-v2',
      status: 'started',
    });
    lastRefinement.current = refinement;
    setRefinementError('');
    setIsRefining(true);
    setLoadingContext(buildLoadingContextFromSession(session, undefined, refinement));
    setPhase('loading');

    const refinementRequest = session.generationMode === 'fixture'
      ? Promise.resolve(refineMakeupRecommendation(session, refinement))
      : refineGeneratedMakeupRecommendation(session, refinement, operation.controller.signal);
    void refinementRequest
      .then(nextSession => {
        if (mutationRequest.current?.id !== operation.id) return;
        if (nextSession.reportId) imageTelemetryReportIds.current.add(nextSession.reportId);
        trackMakeupRecommendationEvent('recommendation_text_completed', {
          id: nextSession.reportId ?? nextSession.id,
          category: 'refinement',
          durationMs: Date.now() - startedAt,
          modelVersion: 'makeup-recommendation-v2',
          status: 'completed',
        });
        setSession(nextSession);
        setPhase('results');
      })
      .catch(error => {
        if (isRequestAbortedError(error) || mutationRequest.current?.id !== operation.id) return;
        setRefinementError(error instanceof Error ? error.message : '조정하지 못했어요. 기존 추천은 그대로 두었어요.');
        setPhase('results');
      })
      .finally(() => {
        if (mutationRequest.current?.id === operation.id) setIsRefining(false);
      });
  };

  const handleRetryImages = (lookId?: string) => {
    if (!session?.reportId) return;
    const operation = beginOperation(mutationRequest);
    markKnownMakeupRecommendationImageEvents({
      contextId: session.reportId,
      reportStatus: session.imageStatus,
      looks: session.results,
    }, emittedImageTelemetryKeys.current);
    imageTelemetryReportIds.current.add(session.reportId);
    setImageRetryError('');
    void retryGeneratedMakeupRecommendationImages(session, operation.controller.signal, lookId)
      .then(nextSession => {
        if (mutationRequest.current?.id === operation.id) setSession(nextSession);
      })
      .catch(error => {
        if (isRequestAbortedError(error) || mutationRequest.current?.id !== operation.id) return;
        setImageRetryError(error instanceof Error ? error.message : '이미지를 다시 만들지 못했어요.');
      });
  };

  const returnToDiscovery = useCallback((resetIntent = false) => {
    workflowRequest.current?.controller.abort();
    mutationRequest.current?.controller.abort();
    workflowRequest.current = undefined;
    mutationRequest.current = undefined;
    setPhase('discovery');
    setSession(undefined);
    setErrorMessage('');
    setCustomSituationServerError('');
    setRefinementError('');
    setLoadingContext(null);
    setImageRetryError('');
    setIsStarting(false);
    imagePollFailureCount.current = 0;
    void clearCurrentMakeupRecommendationSessionId(
      AsyncStorage,
      session?.generationMode === 'v2' ? session.id : undefined,
    );
    if (resetIntent) dispatchDiscovery({type: 'intent/reset'});
  }, [session?.generationMode, session?.id]);

  const telemetryContextId = session?.reportId ?? session?.id;
  const telemetryLooks = session?.results;
  useEffect(() => {
    if (
      phase !== 'results'
      || !telemetryContextId
      || !telemetryLooks
      || !imageTelemetryReportIds.current.has(telemetryContextId)
    ) return;
    takeNewMakeupRecommendationImageEvents({
      contextId: telemetryContextId,
      reportStatus: session?.imageStatus,
      looks: telemetryLooks,
    }, emittedImageTelemetryKeys.current).forEach(event => {
      trackMakeupRecommendationEvent(event.eventName, event.metadata);
    });
  }, [phase, session?.imageStatus, telemetryContextId, telemetryLooks]);

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
            setSession(current => current ? {...current, imageStatus: 'failed', imageError: '이미지 상태 확인 실패'} : current);
            return;
          }
          retryTimer = setTimeout(poll, 5000);
        });
    };
    const timer = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [phase, session]);

  useImperativeHandle(ref, () => ({
    handleBack() {
      if (!shouldHandleMakeupRecommendationBack(phase)) return false;
      returnToDiscovery(false);
      return true;
    },
  }), [phase, returnToDiscovery]);

  const handleSelectReport = useCallback((selectedId: string) => {
    trackMakeupRecommendationEvent('analysis_report_selected', {
      id: selectedId,
      category: 'analysis_report',
      status: 'selected',
    });
    dispatchDiscovery({type: 'report/selected', reportId: selectedId});
  }, []);

  const handleSelectSituation = useCallback((situation: MakeupSituation) => {
    trackMakeupRecommendationEvent('makeup_situation_selected', {
      id: situation.id,
      category: situation.key,
      status: 'selected',
    });
    dispatchDiscovery({type: 'situation/selected', situationId: situation.id});
  }, []);

  const handleAreaOpened = useCallback((area: MakeupGuideArea, look: MakeupLookRecommendation) => {
    trackMakeupRecommendationEvent('recommendation_area_opened', {
      id: `${session?.reportId ?? session?.id ?? 'recommendation'}:${look.id}`,
      category: area,
      status: 'opened',
    });
  }, [session?.id, session?.reportId]);

  const handleApplyAR = useCallback((look: MakeupLookRecommendation) => {
    if (!onApplyAR) return;
    trackMakeupRecommendationEvent('recommendation_ar_applied', {
      id: look.id,
      category: look.role,
      status: 'applied',
    });
    onApplyAR(look);
  }, [onApplyAR]);

  const retry = () => {
    if (reportId?.trim() && phase === 'error' && !session) {
      loadedReportId.current = null;
      setReportLoadAttempt(current => current + 1);
      return;
    }
    if (session?.phase === 'ready') {
      const operation = beginOperation(workflowRequest);
      setLoadingContext(buildLoadingContextFromSession(session));
      setPhase('loading');
      setErrorMessage('');
      void resolveReadySession(session, operation.controller.signal)
        .then(nextSession => {
          if (workflowRequest.current?.id !== operation.id) return;
          setSession(nextSession);
          setPhase('results');
        })
        .catch(error => {
          if (isRequestAbortedError(error) || workflowRequest.current?.id !== operation.id) return;
          setErrorMessage(`AI 추천을 만들지 못했어요. 답변은 유지했으니 다시 시도해주세요.${getMakeupRecommendationErrorDiagnostic(error)}`);
          setPhase('error');
        });
      return;
    }
    if (session?.phase === 'question') {
      setPhase('question');
      return;
    }
    if (lastStartInput.current) runStart(lastStartInput.current);
    else returnToDiscovery(false);
  };

  if (phase === 'discovery') {
    return (
      <ScenarioDiscoveryView
        catalog={discovery.catalog}
        catalogError={discovery.catalogError}
        catalogStatus={discovery.catalogStatus}
        customOpen={discovery.customOpen}
        customSituationError={customSituationServerError}
        customSituationText={discovery.customSituationText}
        isStarting={isStarting}
        showAuraLoading={isStarting && Boolean(lastStartInput.current?.customSituationText?.trim())}
        onChangeCustomSituation={value => {
          setCustomSituationServerError('');
          dispatchDiscovery({type: 'custom/changed', value});
        }}
        onCloseCustom={() => {
          setCustomSituationServerError('');
          dispatchDiscovery({type: 'custom/closed'});
        }}
        onOpenCustom={() => {
          setCustomSituationServerError('');
          dispatchDiscovery({type: 'custom/opened'});
        }}
        onRetryCatalog={() => void loadDiscoveryData()}
        onRetryReports={() => void loadDiscoveryData()}
        onSelectKeyword={startFromKeyword}
        onSelectEditorialTrend={startFromEditorialTrend}
        onSelectReport={handleSelectReport}
        onSelectSituation={handleSelectSituation}
        onStartFaceAnalysis={onStartFaceAnalysis}
        onSubmitCustom={startFromCustom}
        reportError={discovery.reportError}
        reports={discovery.reports}
        reportStatus={discovery.reportStatus}
        selectedKeywordId={discovery.selectedKeywordId}
        selectedReportId={discovery.selectedReportId}
        selectedSituation={selectedSituation}
      />
    );
  }

  if (phase === 'history') {
    return (
      <RecommendationHistoryView
        canLoadMore={hasMoreHistory}
        error={historyError}
        isLoading={isLoadingHistory}
        isLoadingMore={isLoadingMoreHistory}
        items={historyItems}
        onBack={() => returnToDiscovery(false)}
        onLoadMore={() => void loadHistory('append')}
        onRefresh={() => void loadHistory()}
        onSelect={openHistoryReport}
      />
    );
  }

  if (phase === 'loading') {
    return loadingContext ? (
      <RecommendationAgentLoadingView context={loadingContext} faceImageUri={selectedFaceImageUri} />
    ) : null;
  }

  if (phase === 'question' && session) {
    const question = session.questions[session.currentQuestionIndex];
    if (question) {
      return (
        <RecommendationQuestionView
          currentQuestionIndex={session.currentQuestionIndex}
          initialAnswer={session.answers.find(answer => answer.questionId === question.id)}
          onAnswer={handleAnswer}
          onBack={() => {
            if (session.currentQuestionIndex > 0) {
              setSession({...session, currentQuestionIndex: session.currentQuestionIndex - 1});
            } else {
              returnToDiscovery(false);
            }
          }}
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
        context={{
          profileGender: session.profileGender,
          keywordLabel: session.keyword?.label
            ?? (session.editorialPresetId ? session.scenarioLabel : undefined),
          reportLabel: discovery.reports.find(report => report.id === session.sourceAnalysisReportId)?.reportTitle,
          situationLabel: session.editorialPresetId
            ? undefined
            : session.customSituationText
              ? '직접 입력'
              : session.situation?.label,
        }}
        imageRetryError={imageRetryError}
        imageStatus={session.imageStatus}
        isRefining={isRefining}
        isReportSaved={Boolean(session.reportId)}
        onApplyAR={handleApplyAR}
        onAreaOpened={handleAreaOpened}
        onRefine={handleRefine}
        onReset={() => returnToDiscovery(true)}
        onRetry={retry}
        onRetryImages={handleRetryImages}
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
      <Text accessibilityRole="alert" style={styles.errorTitle}>추천을 이어가지 못했어요</Text>
      <Text style={styles.errorDescription}>{errorMessage || '잠시 후 다시 시도해 주세요.'}</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryLabel}>다시 시도하기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => returnToDiscovery(false)} style={styles.resetButton}>
        <Text style={styles.resetLabel}>선택 화면으로 돌아가기</Text>
      </Pressable>
    </AppScreen>
  );
});

const styles = StyleSheet.create({
  errorDescription: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm, textAlign: 'center'},
  errorTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl, textAlign: 'center'},
  retryButton: {alignItems: 'center', backgroundColor: colors.textPrimary, borderRadius: radius.pill, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.lg},
  retryLabel: {color: colors.white, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  resetButton: {alignItems: 'center', justifyContent: 'center', minHeight: 48},
  resetLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
});