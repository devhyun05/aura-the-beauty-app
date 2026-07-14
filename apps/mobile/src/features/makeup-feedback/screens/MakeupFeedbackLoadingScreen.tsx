import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {ArrowRight, Camera, CircleCheck, Search, Target} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {makeupFeedbackLoadingPreviewSource} from '../services/makeupFeedbackLoadingService';
import {getMakeupFeedbackRetakeActionLabels} from '../services/makeupFeedbackResultPresentation';
import {
  analyzeMakeupForFeedback,
  getMakeupFeedbackAnalysisErrorMessage,
} from '../services/makeupFeedbackService';
import {
  MAKEUP_FEEDBACK_REVIEW_CREW_LABELS,
  buildMakeupFeedbackClosingConferenceMessages,
  buildMakeupFeedbackConferencePreviewContext,
  canCommitMakeupFeedbackConferenceMessage,
  getNextMakeupFeedbackConferenceMessage,
  getMakeupFeedbackInitialTypingDelayMs,
  getMakeupFeedbackMessageExposureDelayMs,
  getMakeupFeedbackTypingDelayMs,
  requestMakeupFeedbackGeneratedConferenceMessages,
  requestMakeupFeedbackGeneratedPreviewMessages,
  type MakeupFeedbackAgentConferenceMessage,
  type MakeupFeedbackAgentId,
  type MakeupFeedbackConferencePreviewContext,
} from '../services/makeupFeedbackAgentConferenceService';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import type {
  MakeupFeedbackPhotoSelection,
  MakeupFeedbackResult,
  MakeupFeedbackRetakeOutcome,
} from '../types';

const CLOSING_GENERATION_GRACE_MS = 9500;
const EXPECTED_PREVIEW_CONFERENCE_MESSAGE_COUNT = 4;
const EXPECTED_CLOSING_CONFERENCE_MESSAGE_COUNT = 6;
const PRE_RESULT_PROGRESS_INITIAL = 0.08;
const PRE_RESULT_PROGRESS_CAP = 0.58;
const PRE_RESULT_PROGRESS_TICK_MS = 1000;
const PRE_RESULT_PROGRESS_EASING = 0.035;
const makeupTopicLabelById = new Map(
  MAKEUP_FEEDBACK_TOPICS.map(topic => [topic.id, topic.label]),
);
type AgentIconComponent = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

const agentProfiles: Record<
  MakeupFeedbackAgentId,
  {
    Icon: AgentIconComponent;
    avatarBackground: string;
    name: string;
    role: string;
    tint: string;
  }
> = {
  photo: {
    Icon: Camera,
    avatarBackground: '#F8E8EC',
    ...MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.photo,
    tint: '#9F5B68',
  },
  goal: {
    Icon: Target,
    avatarBackground: '#FFF1DD',
    ...MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.goal,
    tint: '#A05F2C',
  },
  detail: {
    Icon: Search,
    avatarBackground: '#EAF3EE',
    ...MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.detail,
    tint: '#596F62',
  },
  coach: {
    Icon: CircleCheck,
    avatarBackground: '#E8EEF7',
    ...MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.coach,
    tint: '#445A75',
  },
};

type MakeupFeedbackLoadingScreenProps = {
  headerTitle?: string;
  selection: MakeupFeedbackPhotoSelection;
  onBack?: () => void;
  onComplete: (result: MakeupFeedbackResult) => void;
  onChooseDifferentPhoto: () => void;
  onRetake: () => void;
};

export function resolveMakeupFeedbackLoadingPreviewSource(
  selection: MakeupFeedbackPhotoSelection,
) {
  return selection.imageUri ? {uri: selection.imageUri} : makeupFeedbackLoadingPreviewSource;
}

function getSelectionTitle(selection: MakeupFeedbackPhotoSelection) {
  return selection.photoTitle?.trim() || undefined;
}

function countMessagesByPhase(
  messages: readonly MakeupFeedbackAgentConferenceMessage[],
  phase: MakeupFeedbackAgentConferenceMessage['phase'],
) {
  return messages.filter(message => message.phase === phase).length;
}

function isPreviewConferenceMessage(message: MakeupFeedbackAgentConferenceMessage) {
  return message.phase === 'preview' || message.phase === 'safe';
}

function countPreviewConferenceMessages(
  messages: readonly MakeupFeedbackAgentConferenceMessage[],
) {
  return messages.filter(isPreviewConferenceMessage).length;
}

function getNextTypingAgentId({
  analysisResult,
  closingMessages,
  isPreviewGenerationSettled,
  messages,
  previewMessages,
}: {
  analysisResult: MakeupFeedbackResult | null;
  closingMessages: readonly MakeupFeedbackAgentConferenceMessage[];
  isPreviewGenerationSettled: boolean;
  messages: readonly MakeupFeedbackAgentConferenceMessage[];
  previewMessages: readonly MakeupFeedbackAgentConferenceMessage[];
}): MakeupFeedbackAgentId {
  const previewMessageCount = countPreviewConferenceMessages(messages);
  const nextPreviewMessage = previewMessages[previewMessageCount];

  if (nextPreviewMessage || !isPreviewGenerationSettled) {
    return nextPreviewMessage?.agentId ?? 'photo';
  }

  const closingMessageCount = countMessagesByPhase(messages, 'closing');

  return analysisResult
    ? closingMessages[closingMessageCount]?.agentId ?? 'coach'
    : 'photo';
}

function getConferenceProgress({
  analysisResult,
  closingMessages,
  isComplete,
  messages,
}: {
  analysisResult: MakeupFeedbackResult | null;
  closingMessages: readonly MakeupFeedbackAgentConferenceMessage[];
  isComplete: boolean;
  messages: readonly MakeupFeedbackAgentConferenceMessage[];
}) {
  if (isComplete) {
    return 1;
  }

  const previewMessageCount = Math.min(
    countPreviewConferenceMessages(messages),
    EXPECTED_PREVIEW_CONFERENCE_MESSAGE_COUNT,
  );
  const previewProgress =
    PRE_RESULT_PROGRESS_INITIAL +
    (previewMessageCount / EXPECTED_PREVIEW_CONFERENCE_MESSAGE_COUNT) * 0.28;

  if (!analysisResult) {
    return previewProgress;
  }

  const closingMessageCount = countMessagesByPhase(messages, 'closing');
  const expectedClosingCount =
    closingMessages.length || EXPECTED_CLOSING_CONFERENCE_MESSAGE_COUNT;
  const closingRatio = Math.min(closingMessageCount / expectedClosingCount, 1);

  return Math.min(0.62 + closingRatio * 0.34, 0.96);
}

export function MakeupFeedbackLoadingScreen({
  selection,
  onComplete,
  onChooseDifferentPhoto,
  onRetake,
}: MakeupFeedbackLoadingScreenProps) {
  const conversationRef = useRef<ScrollView | null>(null);
  const analysisRunIdRef = useRef(0);
  const conferenceRunIdRef = useRef(0);
  const conferenceMessagesRef = useRef<MakeupFeedbackAgentConferenceMessage[]>([]);
  const lastMessageShownAtRef = useRef(0);
  const hasCompletedRef = useRef(false);
  const retryRequestedRef = useRef(false);
  const [analysisResult, setAnalysisResult] = useState<MakeupFeedbackResult | null>(null);
  const [retakeOutcome, setRetakeOutcome] = useState<MakeupFeedbackRetakeOutcome | null>(null);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(null);
  const [previewConferenceMessages, setPreviewConferenceMessages] = useState<
    readonly MakeupFeedbackAgentConferenceMessage[]
  >([]);
  const [closingPreviewContext, setClosingPreviewContext] =
    useState<MakeupFeedbackConferencePreviewContext | null>(null);
  const [isPreviewGenerationSettled, setIsPreviewGenerationSettled] = useState(false);
  const [closingConferenceMessages, setClosingConferenceMessages] = useState<
    readonly MakeupFeedbackAgentConferenceMessage[]
  >([]);
  const [conferenceMessages, setConferenceMessages] = useState<
    MakeupFeedbackAgentConferenceMessage[]
  >([]);
  const [isConferenceTyping, setIsConferenceTyping] = useState(true);
  const [isConferenceComplete, setIsConferenceComplete] = useState(false);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const [preResultProgress, setPreResultProgress] = useState(PRE_RESULT_PROGRESS_INITIAL);
  const selectionTitle = getSelectionTitle(selection);

  const typingAgentId = useMemo(
    () =>
      getNextTypingAgentId({
        analysisResult,
        closingMessages: closingConferenceMessages,
        isPreviewGenerationSettled,
        messages: conferenceMessages,
        previewMessages: previewConferenceMessages,
      }),
    [
      analysisResult,
      closingConferenceMessages,
      conferenceMessages,
      isPreviewGenerationSettled,
      previewConferenceMessages,
    ],
  );
  const conferenceProgress = useMemo(
    () =>
      getConferenceProgress({
        analysisResult,
        closingMessages: closingConferenceMessages,
        isComplete: isConferenceComplete,
        messages: conferenceMessages,
      }),
    [analysisResult, closingConferenceMessages, conferenceMessages, isConferenceComplete],
  );
  const displayedConferenceProgress = analysisErrorMessage || retakeOutcome
    ? 1
    : analysisResult
      ? conferenceProgress
      : Math.max(conferenceProgress, preResultProgress);
  const reviewStatusLabel = analysisErrorMessage
    ? '다시 시도 필요'
    : retakeOutcome
      ? '사진 확인 완료'
      : isConferenceComplete
        ? '정리 완료'
        : '함께 정리 중';
  const reviewProgressAccessibilityLabel = analysisErrorMessage
    ? '피드백 구성이 중단되었어요'
    : retakeOutcome
      ? '사진 품질 확인이 끝났어요'
      : isConferenceComplete
        ? '피드백 구성이 끝났어요'
        : 'AURA 리뷰 크루가 피드백을 구성하고 있어요';
  const reviewProgressAccessibilityText = analysisErrorMessage
    ? '피드백 구성 중단'
    : retakeOutcome
      ? '사진 품질 확인 완료'
      : isConferenceComplete
        ? '피드백 구성 완료'
        : analysisResult
          ? '분석 결과를 대화로 정리 중, 예상 진행 상태예요'
          : '피드백 구성 중, 예상 진행 상태예요';
  const reviewBadgeLabel = analysisErrorMessage
    ? '리뷰 멈춤'
    : retakeOutcome
      ? '사진 확인 완료'
      : isConferenceComplete
        ? '리뷰 완료'
        : '리뷰 중';

  const handleRetryAnalysis = useCallback(() => {
    if (retryRequestedRef.current) {
      return;
    }

    retryRequestedRef.current = true;
    setAnalysisAttempt(currentAttempt => currentAttempt + 1);
  }, []);

  const handleComplete = useCallback(() => {
    if (!analysisResult || hasCompletedRef.current) {
      return;
    }

    hasCompletedRef.current = true;
    onComplete(analysisResult);
  }, [analysisResult, onComplete]);

  const handleConferenceMessageDisplayed = useCallback(
    (message: MakeupFeedbackAgentConferenceMessage) => {
      if (!conferenceMessagesRef.current.some(item => item.id === message.id)) {
        conferenceMessagesRef.current = [...conferenceMessagesRef.current, message];
      }

      lastMessageShownAtRef.current = Date.now();
    },
    [],
  );

  useEffect(() => {
    const runId = analysisRunIdRef.current + 1;
    analysisRunIdRef.current = runId;
    conferenceRunIdRef.current += 1;
    let isActive = true;
    const previewController = new AbortController();
    const isCurrentRun = () => isActive && analysisRunIdRef.current === runId;

    conferenceMessagesRef.current = [];
    lastMessageShownAtRef.current = 0;
    hasCompletedRef.current = false;

    setAnalysisResult(null);
    setRetakeOutcome(null);
    setAnalysisErrorMessage(null);
    setPreviewConferenceMessages([]);
    setClosingPreviewContext(null);
    setIsPreviewGenerationSettled(false);
    setClosingConferenceMessages([]);
    setConferenceMessages([]);
    setIsConferenceTyping(true);
    setIsConferenceComplete(false);
    setPreResultProgress(PRE_RESULT_PROGRESS_INITIAL);

    const settlePreviewUnavailable = () => {
      setPreviewConferenceMessages([]);
      setClosingPreviewContext(null);
      setIsPreviewGenerationSettled(true);
    };

    const startGeneratedPreview = (analysisId: string) => {
      requestMakeupFeedbackGeneratedPreviewMessages({
        analysisId,
        selection,
        signal: previewController.signal,
      })
        .then(preview => {
          if (!isCurrentRun()) {
            return;
          }

          if (
            preview.generationStatus !== 'bedrock_completed'
            || preview.messages.length < EXPECTED_PREVIEW_CONFERENCE_MESSAGE_COUNT
          ) {
            console.info('[aura:makeup-feedback] conference-preview:not-generated', {
              count: preview.messages.length,
              generationStatus: preview.generationStatus ?? null,
            });
            settlePreviewUnavailable();
            return;
          }

          setPreviewConferenceMessages(preview.messages);
          setClosingPreviewContext(
            buildMakeupFeedbackConferencePreviewContext({
              lastSpeaker: preview.lastSpeaker,
              messages: preview.messages,
              summary: preview.summary,
            }),
          );
          setIsPreviewGenerationSettled(true);
        })
        .catch(error => {
          if (!isCurrentRun()) {
            return;
          }

          console.info('[aura:makeup-feedback] conference-preview:unavailable', {
            message: error instanceof Error ? error.message : String(error),
          });
          settlePreviewUnavailable();
        });
    };

    analyzeMakeupForFeedback(selection, {onAnalysisCreated: startGeneratedPreview})
      .then(outcome => {
        if (!isCurrentRun()) {
          return;
        }

        if (outcome.analysisDecision === 'completed') {
          setAnalysisResult(outcome);
        } else {
          previewController.abort();
          settlePreviewUnavailable();
          setRetakeOutcome(outcome);
          setIsConferenceTyping(false);
          setIsConferenceComplete(true);
          setClosingConferenceMessages([]);
        }
      })
      .catch(error => {
        console.info('[aura:makeup-feedback] analysis:blocked', {
          message: error instanceof Error ? error.message : String(error),
        });

        if (isCurrentRun()) {
          previewController.abort();
          settlePreviewUnavailable();
          retryRequestedRef.current = false;
          setAnalysisErrorMessage(getMakeupFeedbackAnalysisErrorMessage(error));
          setIsConferenceTyping(false);
          setClosingConferenceMessages([]);
        }
      });

    return () => {
      isActive = false;
      previewController.abort();
    };
  }, [analysisAttempt, selection]);

  useEffect(() => {
    if (analysisResult || analysisErrorMessage || retakeOutcome) {
      return;
    }

    const intervalId = setInterval(() => {
      setPreResultProgress(currentProgress => {
        const baseline = Math.max(currentProgress, conferenceProgress);
        const nextProgress =
          baseline + (PRE_RESULT_PROGRESS_CAP - baseline) * PRE_RESULT_PROGRESS_EASING;

        return Math.min(nextProgress, PRE_RESULT_PROGRESS_CAP);
      });
    }, PRE_RESULT_PROGRESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [analysisErrorMessage, analysisResult, conferenceProgress, retakeOutcome]);

  useEffect(() => {
    if (!analysisResult || !isPreviewGenerationSettled) {
      return;
    }

    const runId = conferenceRunIdRef.current + 1;
    conferenceRunIdRef.current = runId;
    let isActive = true;
    let isSettled = false;
    const controller = new AbortController();
    const isCurrentRun = () => isActive && conferenceRunIdRef.current === runId;
    const useGroundedFallback = () => {
      setClosingConferenceMessages(
        buildMakeupFeedbackClosingConferenceMessages(
          analysisResult,
          closingPreviewContext?.lastSpeaker,
        ),
      );
    };

    setClosingConferenceMessages([]);
    const graceTimeoutId = setTimeout(() => {
      if (!isCurrentRun() || isSettled) {
        return;
      }

      isSettled = true;
      controller.abort();
      useGroundedFallback();
    }, CLOSING_GENERATION_GRACE_MS);

    requestMakeupFeedbackGeneratedConferenceMessages({
      previewContext: closingPreviewContext,
      result: analysisResult,
      selection,
      signal: controller.signal,
    })
      .then(generatedMessages => {
        if (!isCurrentRun() || isSettled) {
          return;
        }

        isSettled = true;
        clearTimeout(graceTimeoutId);
        if (generatedMessages.length >= 3) {
          setClosingConferenceMessages(generatedMessages);
        } else {
          useGroundedFallback();
        }
      })
      .catch(error => {
        if (!isCurrentRun() || isSettled) {
          return;
        }

        isSettled = true;
        clearTimeout(graceTimeoutId);
        console.info('[aura:makeup-feedback] conference-generation:fallback', {
          message: error instanceof Error ? error.message : String(error),
        });
        useGroundedFallback();
      });

    return () => {
      isActive = false;
      clearTimeout(graceTimeoutId);
      controller.abort();
    };
  }, [analysisResult, closingPreviewContext, isPreviewGenerationSettled, selection]);

  useEffect(() => {
    if (analysisErrorMessage || retakeOutcome || isConferenceComplete) {
      return;
    }

    const previewMessageCount = countPreviewConferenceMessages(conferenceMessages);
    const closingMessageCount = countMessagesByPhase(conferenceMessages, 'closing');
    const nextMessage = getNextMakeupFeedbackConferenceMessage({
      analysisReady: Boolean(analysisResult),
      closingMessages: closingConferenceMessages,
      displayedMessages: conferenceMessages,
      previewGenerationSettled: isPreviewGenerationSettled,
      previewMessages: previewConferenceMessages,
    });

    if (!nextMessage) {
      const previewMessagesDrained =
        isPreviewGenerationSettled
        && previewMessageCount >= previewConferenceMessages.length;

      if (
        analysisResult &&
        previewMessagesDrained &&
        closingConferenceMessages.length > 0 &&
        closingMessageCount >= closingConferenceMessages.length
      ) {
        setIsConferenceTyping(false);
        setIsConferenceComplete(true);
      } else {
        setIsConferenceTyping(true);
      }

      return;
    }

    const lastMessage = conferenceMessages[conferenceMessages.length - 1];
    const exposureDelay = lastMessage
      ? getMakeupFeedbackMessageExposureDelayMs(lastMessage.text)
      : 0;
    const elapsedSinceLastMessage = lastMessage
      ? Math.max(Date.now() - lastMessageShownAtRef.current, 0)
      : 0;
    const remainingExposureDelay = Math.max(exposureDelay - elapsedSinceLastMessage, 0);
    const scheduledAnalysisRunId = analysisRunIdRef.current;
    let typingTimeoutId: ReturnType<typeof setTimeout> | undefined;

    setIsConferenceTyping(false);

    const exposureTimeoutId = setTimeout(() => {
      setIsConferenceTyping(true);
      typingTimeoutId = setTimeout(() => {
        if (!canCommitMakeupFeedbackConferenceMessage({
          activeAnalysisRunId: analysisRunIdRef.current,
          scheduledAnalysisRunId,
        })) {
          return;
        }

        setConferenceMessages(currentMessages => {
          if (!canCommitMakeupFeedbackConferenceMessage({
            activeAnalysisRunId: analysisRunIdRef.current,
            scheduledAnalysisRunId,
          })) {
            return currentMessages;
          }

          if (currentMessages.some(message => message.id === nextMessage.id)) {
            return currentMessages;
          }

          return [...currentMessages, nextMessage];
        });
        setIsConferenceTyping(false);
      }, conferenceMessages.length === 0
        ? getMakeupFeedbackInitialTypingDelayMs()
        : getMakeupFeedbackTypingDelayMs());
    }, remainingExposureDelay);

    return () => {
      clearTimeout(exposureTimeoutId);
      if (typingTimeoutId) {
        clearTimeout(typingTimeoutId);
      }
    };
  }, [
    analysisErrorMessage,
    analysisResult,
    closingConferenceMessages,
    conferenceMessages,
    isConferenceComplete,
    isPreviewGenerationSettled,
    retakeOutcome,
    previewConferenceMessages,
  ]);


  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <YStack style={styles.content}>
        <YStack style={styles.heroCopy}>
          <XStack style={styles.crewHeader}>
            <Text style={styles.crewTitle}>AURA 리뷰 크루</Text>
            <Text style={styles.crewStatus}>
              {reviewStatusLabel}
            </Text>
          </XStack>
          <View
            accessibilityLabel={reviewProgressAccessibilityLabel}
            accessibilityRole="progressbar"
            accessibilityValue={{
              max: 100,
              min: 0,
              now: Math.round(displayedConferenceProgress * 100),
              text: reviewProgressAccessibilityText,
            }}
            style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {width: `${Math.round(displayedConferenceProgress * 100)}%`},
              ]}
            />
          </View>
        </YStack>

        <YStack style={styles.analysisPanel}>
          <View style={styles.previewFrame}>
            <Image
              resizeMode="cover"
              source={resolveMakeupFeedbackLoadingPreviewSource(selection)}
              style={styles.previewImage}
              testID="makeup-feedback-loading-preview-image"
            />
            <View style={styles.previewDim} />
            <PreviewScanOverlay isComplete={isConferenceComplete || Boolean(analysisErrorMessage)} />
            <XStack style={styles.previewBadge}>
              <LiveStatusDot compact />
              <Text style={styles.previewBadgeText}>{reviewBadgeLabel}</Text>
            </XStack>
            {selectionTitle ? (
              <YStack style={styles.previewTitleBlock}>
                <Text numberOfLines={1} style={styles.previewTitle}>
                  {selectionTitle}
                </Text>
              </YStack>
            ) : null}
          </View>

          {analysisErrorMessage ? (
            <YStack style={styles.errorPanel}>
              <Text accessibilityLiveRegion="polite" style={styles.errorTitle}>
                분석을 완료하지 못했어요
              </Text>
              <Text style={styles.errorDescription}>{analysisErrorMessage}</Text>
            </YStack>
          ) : retakeOutcome ? (
            <RetakeRequiredPanel
              onChooseDifferentPhoto={onChooseDifferentPhoto}
              onRetake={onRetake}
              outcome={retakeOutcome}
            />
          ) : (
            <View style={styles.conversationFrame}>
              <ScrollView
                ref={conversationRef}
                contentContainerStyle={styles.conversationContent}
                nestedScrollEnabled
                onContentSizeChange={() => {
                  conversationRef.current?.scrollToEnd({animated: true});
                }}
                showsVerticalScrollIndicator={false}>
                <YStack
                  accessibilityLabel="AURA 리뷰 크루 대화"
                  style={styles.conversationList}>
                  {conferenceMessages.map(message => (
                    <ConferenceMessageBubble
                      key={message.id}
                      message={message}
                      onDisplayed={handleConferenceMessageDisplayed}
                    />
                  ))}
                  {isConferenceTyping ? <TypingBubble agentId={typingAgentId} /> : null}
                </YStack>
              </ScrollView>
            </View>
          )}

          {analysisErrorMessage ? (
            <YStack style={styles.retakeActions}>
              <Pressable
                accessibilityLabel={'AI 피드백 분석 다시 시도하기'}
                accessibilityRole="button"
                onPress={handleRetryAnalysis}
                style={({pressed}) => [styles.resultButton, pressed && styles.resultButtonPressed]}>
                <Text style={styles.resultButtonText}>다시 시도하기</Text>
              </Pressable>
              {selection.photoSource === 'gallery' ? (
                <Pressable
                  accessibilityLabel="다른 사진 선택"
                  accessibilityRole="button"
                  onPress={onChooseDifferentPhoto}
                  style={({pressed}) => [
                    styles.secondaryButton,
                    pressed && styles.resultButtonPressed,
                  ]}>
                  <Text style={styles.secondaryButtonText}>다른 사진 선택</Text>
                </Pressable>
              ) : null}
            </YStack>
          ) : analysisResult && !retakeOutcome ? (
            <ResultRevealButton
              label={isConferenceComplete ? '결과 보기' : '결과 먼저 보기'}
              onPress={handleComplete}
            />
          ) : null}
        </YStack>
      </YStack>
    </AppScreen>
  );
}

function RetakeRequiredPanel({
  onChooseDifferentPhoto,
  onRetake,
  outcome,
}: {
  onChooseDifferentPhoto: () => void;
  onRetake: () => void;
  outcome: MakeupFeedbackRetakeOutcome;
}) {
  const actionLabels = getMakeupFeedbackRetakeActionLabels(outcome.photoSource);
  const primaryAction =
    outcome.photoSource === 'camera' ? onRetake : onChooseDifferentPhoto;
  const secondaryAction =
    outcome.photoSource === 'camera' ? onChooseDifferentPhoto : onRetake;

  return (
    <YStack
      accessibilityLabel="사진 품질 확인 결과"
      accessibilityLiveRegion="polite"
      style={styles.retakePanel}>
      <YStack style={styles.retakeCopy}>
        <Text style={styles.errorTitle}>사진을 다시 준비해 주세요</Text>
        <Text style={styles.errorDescription}>
          이 사진으로는 정확한 메이크업 판단이 어려워 결과를 저장하지 않았어요.
        </Text>
      </YStack>

      <ScrollView
        contentContainerStyle={styles.retakeIssueList}
        nestedScrollEnabled
        style={styles.retakeIssueScroll}
        showsVerticalScrollIndicator={false}>
        {outcome.captureQuality.issues.map(issue => {
          const affectedLabels = issue.affectedTopicIds
            .map(topicId => makeupTopicLabelById.get(topicId) ?? topicId)
            .join(', ');

          return (
            <YStack key={issue.code} style={styles.retakeIssue}>
              <Text style={styles.retakeIssueMessage}>{issue.message}</Text>
              {affectedLabels ? (
                <Text style={styles.retakeAffectedTopics}>
                  영향 부위: {affectedLabels}
                </Text>
              ) : null}
            </YStack>
          );
        })}
      </ScrollView>

      <YStack style={styles.retakeActions}>
        <Pressable
          accessibilityLabel={actionLabels.primary}
          accessibilityRole="button"
          onPress={primaryAction}
          style={({pressed}) => [
            styles.resultButton,
            pressed && styles.resultButtonPressed,
          ]}>
          <Text style={styles.resultButtonText}>{actionLabels.primary}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={actionLabels.secondary}
          accessibilityRole="button"
          onPress={secondaryAction}
          style={({pressed}) => [
            styles.secondaryButton,
            pressed && styles.resultButtonPressed,
          ]}>
          <Text style={styles.secondaryButtonText}>{actionLabels.secondary}</Text>
        </Pressable>
      </YStack>
    </YStack>
  );
}


function ConferenceMessageBubble({
  message,
  onDisplayed,
}: {
  message: MakeupFeedbackAgentConferenceMessage;
  onDisplayed: (message: MakeupFeedbackAgentConferenceMessage) => void;
}) {
  const enter = useFadeIn();
  const agent = agentProfiles[message.agentId];
  const Icon = agent.Icon;

  useEffect(() => {
    onDisplayed(message);
  }, [message, onDisplayed]);

  return (
    <Animated.View
      accessibilityLabel={agent.name + ', ' + agent.role + ', ' + message.text}
      accessibilityLiveRegion="polite"
      accessible
      style={[styles.messageRowAnimated, enter]}>
      <XStack style={styles.messageRow}>
        <View
          accessible={false}
          style={[styles.agentAvatar, {backgroundColor: agent.avatarBackground}]}>
          <Icon color={agent.tint} size={iconSize.xs} strokeWidth={2.2} />
        </View>
        <YStack style={styles.messageBubble}>
          <XStack style={styles.messageMeta}>
            <Text style={styles.agentName}>{agent.name}</Text>
            <Text style={styles.agentRole}>{agent.role}</Text>
          </XStack>
          <Text style={styles.messageText}>{message.text}</Text>
        </YStack>
      </XStack>
    </Animated.View>
  );
}

function PreviewScanOverlay({isComplete}: {isComplete: boolean}) {
  const completionGlow = useRef(new Animated.Value(0)).current;
  const lineFade = useRef(new Animated.Value(1)).current;
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation;

    scan.stopAnimation();
    completionGlow.stopAnimation();
    lineFade.stopAnimation();
    lineFade.setValue(1);

    if (isComplete) {
      scan.setValue(0);
      completionGlow.setValue(0);
      animation = Animated.sequence([
        Animated.timing(scan, {
          duration: 880,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(completionGlow, {
              duration: 220,
              easing: Easing.out(Easing.quad),
              toValue: 0.18,
              useNativeDriver: true,
            }),
            Animated.timing(completionGlow, {
              duration: 520,
              easing: Easing.inOut(Easing.quad),
              toValue: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(lineFade, {
            duration: 260,
            easing: Easing.out(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      ]);
    } else {
      scan.setValue(0);
      completionGlow.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(lineFade, {
            duration: 1,
            easing: Easing.linear,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(scan, {
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.delay(320),
          Animated.timing(lineFade, {
            duration: 180,
            easing: Easing.out(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.timing(scan, {
            duration: 1,
            easing: Easing.linear,
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    }

    animation.start();

    return () => {
      animation.stop();
    };
  }, [completionGlow, isComplete, lineFade, scan]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.previewCompletionGlow, {opacity: completionGlow}]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.previewScanLine,
          {
            opacity: Animated.multiply(
              lineFade,
              scan.interpolate({
                inputRange: [0, 0.12, 0.88, 1],
                outputRange: [0, 0.68, 0.68, 0],
              }),
            ),
            transform: [
              {
                translateY: scan.interpolate({inputRange: [0, 1], outputRange: [18, 238]}),
              },
            ],
          },
        ]}
      />
    </>
  );
}

function ResultRevealButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(value, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [value]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.resultButtonAnimated,
        {
          opacity: value,
          transform: [
            {
              translateY: value.interpolate({inputRange: [0, 1], outputRange: [8, 0]}),
            },
          ],
        },
      ]}>
      <Pressable
        accessibilityLabel={'메이크업 피드백 ' + label}
        accessibilityRole="button"
        onPress={onPress}
        style={({pressed}) => [styles.resultButton, pressed && styles.resultButtonPressed]}>
        <Text style={styles.resultButtonText}>{label}</Text>
        <ArrowRight color={colors.white} size={iconSize.sm} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}

function TypingBubble({agentId}: {agentId: MakeupFeedbackAgentId}) {
  const agent = agentProfiles[agentId];
  const Icon = agent.Icon;

  return (
    <XStack
      accessibilityLabel={agent.name + '이 답변을 정리 중이에요'}
      accessible
      style={styles.typingRow}>
      <View
        accessible={false}
        style={[styles.agentAvatar, {backgroundColor: agent.avatarBackground}]}>
        <Icon color={agent.tint} size={iconSize.xs} strokeWidth={2.2} />
      </View>
      <XStack style={styles.typingBubble}>
        <Text style={styles.typingName}>{agent.name}</Text>
        <TypingDots />
      </XStack>
    </XStack>
  );
}

function TypingDots() {
  const dotsRef = useRef<Animated.Value[] | null>(null);

  if (!dotsRef.current) {
    dotsRef.current = [
      new Animated.Value(0),
      new Animated.Value(0),
      new Animated.Value(0),
    ];
  }

  const dots = dotsRef.current;

  useEffect(() => {
    const loops = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(dot, {
            duration: 360,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            duration: 360,
            easing: Easing.in(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.delay((2 - index) * 160),
        ]),
      ),
    );

    loops.forEach(loop => loop.start());

    return () => {
      loops.forEach(loop => loop.stop());
    };
  }, [dots]);

  return (
    <XStack style={styles.typingDots}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: dot.interpolate({inputRange: [0, 1], outputRange: [0.24, 1]}),
              transform: [
                {
                  translateY: dot.interpolate({inputRange: [0, 1], outputRange: [0, -2]}),
                },
              ],
            },
          ]}
        />
      ))}
    </XStack>
  );
}

function LiveStatusDot({compact = false}: {compact?: boolean}) {
  const pulse = useBreathe(1400);
  const size = compact ? 8 : 10;

  return (
    <View style={[styles.liveDotHost, {height: size + 8, width: size + 8}]}>
      <Animated.View
        style={[
          styles.liveDotPulse,
          {
            opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.42, 0]}),
            transform: [
              {
                scale: pulse.interpolate({inputRange: [0, 1], outputRange: [0.7, 1.8]}),
              },
            ],
          },
        ]}
      />
      <View style={[styles.liveDotCore, {height: size, width: size}]} />
    </View>
  );
}

function useBreathe(duration = 2600) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          duration,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          duration,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [duration, value]);

  return value;
}

function useFadeIn(translateY = 10) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(value, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [value]);

  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [translateY, 0],
        }),
      },
    ],
  };
}

const styles = StyleSheet.create({
  agentAvatar: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  agentName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  agentRole: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: 14,
  },
  analysisPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.md,
    minHeight: 0,
    padding: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  content: {
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  crewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  crewStatus: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  crewTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  errorDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  errorPanel: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 160,
    padding: spacing.lg,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  conversationContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  conversationFrame: {
    flex: 1,
    minHeight: 210,
  },
  conversationList: {
    gap: spacing.sm,
    justifyContent: 'flex-end',
    minHeight: 0,
  },
  heroCopy: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    width: '100%',
  },
  liveDotCore: {
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
  },
  liveDotHost: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotPulse: {
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  messageBubble: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageMeta: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  messageRow: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    width: '100%',
  },
  messageRowAnimated: {
    width: '100%',
  },
  messageText: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  previewBadge: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
  previewBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  previewDim: {
    backgroundColor: colors.blackSurface,
    bottom: 0,
    left: 0,
    opacity: 0.16,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 252,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textShadowColor: 'rgba(0, 0, 0, 0.42)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 5,
  },
  previewTitleBlock: {
    bottom: spacing.md,
    gap: spacing.xs,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  previewCompletionGlow: {
    backgroundColor: colors.white,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewScanLine: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 2,
    left: spacing.md,
    opacity: 0.62,
    position: 'absolute',
    right: spacing.md,
    shadowColor: colors.white,
    shadowOffset: {height: 0, width: 0},
    shadowOpacity: 0.65,
    shadowRadius: 8,
  },
  progressFill: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 3,
    overflow: 'hidden',
    width: '100%',
  },
  retakeActions: {
    gap: spacing.sm,
    width: '100%',
  },
  retakeAffectedTopics: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  retakeCopy: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  retakeIssue: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  retakeIssueList: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  retakeIssueMessage: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  retakeIssueScroll: {
    flex: 1,
    width: '100%',
  },
  retakePanel: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.md,
    minHeight: 210,
    padding: spacing.lg,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.textPrimary,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },

  resultButtonAnimated: {
    width: '100%',
  },
  resultButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  resultButtonPressed: {
    opacity: 0.82,
  },
  resultButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  typingBubble: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typingDot: {
    backgroundColor: colors.textSecondary,
    borderRadius: radius.pill,
    height: 5,
    width: 5,
  },
  typingDots: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  typingName: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  typingRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
