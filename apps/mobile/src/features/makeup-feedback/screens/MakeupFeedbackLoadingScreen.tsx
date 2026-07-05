import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {ArrowRight, Brush, Palette, ShieldCheck, Sparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {makeupFeedbackLoadingPreviewSource} from '../services/makeupFeedbackLoadingService';
import {
  analyzeMakeupForFeedback,
  getMakeupFeedbackAnalysisErrorMessage,
} from '../services/makeupFeedbackService';
import {
  MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES,
  buildMakeupFeedbackClosingConferenceMessages,
  buildMakeupFeedbackSafeConferenceMessages,
  requestMakeupFeedbackGeneratedConferenceMessages,
  type MakeupFeedbackAgentConferenceMessage,
  type MakeupFeedbackAgentId,
} from '../services/makeupFeedbackAgentConferenceService';
import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

const FIRST_CONFERENCE_MESSAGE_DELAY_MS = 720;
const SAFE_CONFERENCE_MESSAGE_INTERVAL_MS = 1540;
const CLOSING_CONFERENCE_MESSAGE_INTERVAL_MS = 1720;
const EXPECTED_CLOSING_CONFERENCE_MESSAGE_COUNT = 4;
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
  tone: {
    Icon: Sparkles,
    avatarBackground: '#F8E8EC',
    name: 'Tone Agent',
    role: '톤 기준',
    tint: '#9F5B68',
  },
  color: {
    Icon: Palette,
    avatarBackground: '#FFF1DD',
    name: 'Color Agent',
    role: '색감 균형',
    tint: '#A05F2C',
  },
  style: {
    Icon: Brush,
    avatarBackground: '#EAF3EE',
    name: 'Style Agent',
    role: '실행 포인트',
    tint: '#596F62',
  },
  quality: {
    Icon: ShieldCheck,
    avatarBackground: '#E8EEF7',
    name: 'Quality Agent',
    role: '최종 검토',
    tint: '#445A75',
  },
};

type MakeupFeedbackLoadingScreenProps = {
  headerTitle?: string;
  selection: MakeupFeedbackPhotoSelection;
  onBack?: () => void;
  onComplete: (result: MakeupFeedbackResult) => void;
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

function getNextTypingAgentId({
  analysisResult,
  closingMessages,
  messages,
  safeMessages,
}: {
  analysisResult: MakeupFeedbackResult | null;
  closingMessages: readonly MakeupFeedbackAgentConferenceMessage[];
  messages: readonly MakeupFeedbackAgentConferenceMessage[];
  safeMessages: readonly MakeupFeedbackAgentConferenceMessage[];
}): MakeupFeedbackAgentId {
  const safeMessageCount = countMessagesByPhase(messages, 'safe');
  const closingMessageCount = countMessagesByPhase(messages, 'closing');
  const canShowClosing =
    Boolean(analysisResult) &&
    closingMessages.length > 0 &&
    safeMessageCount >= MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES;

  if (canShowClosing) {
    return closingMessages[closingMessageCount]?.agentId ?? 'quality';
  }

  return safeMessages[safeMessageCount]?.agentId ?? 'quality';
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

  const safeMessageCount = Math.min(
    countMessagesByPhase(messages, 'safe'),
    MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES,
  );
  const closingMessageCount = countMessagesByPhase(messages, 'closing');
  const expectedClosingCount =
    closingMessages.length || EXPECTED_CLOSING_CONFERENCE_MESSAGE_COUNT;
  const totalMessageCount =
    MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES + expectedClosingCount;
  const rawProgress = (safeMessageCount + closingMessageCount) / totalMessageCount;
  const progress = 0.08 + rawProgress * 0.84;

  if (!analysisResult) {
    return Math.min(progress, 0.58);
  }

  if (closingMessages.length === 0) {
    return Math.min(progress, 0.72);
  }

  return Math.min(progress, 0.96);
}

export function MakeupFeedbackLoadingScreen({
  selection,
  onBack,
  onComplete,
}: MakeupFeedbackLoadingScreenProps) {
  const conversationRef = useRef<ScrollView | null>(null);
  const [analysisResult, setAnalysisResult] = useState<MakeupFeedbackResult | null>(null);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(null);
  const [safeConferenceMessages, setSafeConferenceMessages] = useState<
    readonly MakeupFeedbackAgentConferenceMessage[]
  >(() => buildMakeupFeedbackSafeConferenceMessages(selection));
  const [closingConferenceMessages, setClosingConferenceMessages] = useState<
    readonly MakeupFeedbackAgentConferenceMessage[]
  >([]);
  const [conferenceMessages, setConferenceMessages] = useState<
    MakeupFeedbackAgentConferenceMessage[]
  >([]);
  const [isConferenceTyping, setIsConferenceTyping] = useState(true);
  const [isConferenceComplete, setIsConferenceComplete] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const selectionTitle = getSelectionTitle(selection);

  const typingAgentId = useMemo(
    () =>
      getNextTypingAgentId({
        analysisResult,
        closingMessages: closingConferenceMessages,
        messages: conferenceMessages,
        safeMessages: safeConferenceMessages,
      }),
    [analysisResult, closingConferenceMessages, conferenceMessages, safeConferenceMessages],
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
  const displayedConferenceProgress = analysisErrorMessage ? 1 : conferenceProgress;

  const handleBackToGoalInput = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleComplete = useCallback(() => {
    if (!analysisResult || hasCompleted) {
      return;
    }

    setHasCompleted(true);
    onComplete(analysisResult);
  }, [analysisResult, hasCompleted, onComplete]);

  useEffect(() => {
    let isMounted = true;

    setAnalysisResult(null);
    setAnalysisErrorMessage(null);
    setSafeConferenceMessages(buildMakeupFeedbackSafeConferenceMessages(selection));
    setClosingConferenceMessages([]);
    setConferenceMessages([]);
    setIsConferenceTyping(true);
    setIsConferenceComplete(false);
    setHasCompleted(false);

    analyzeMakeupForFeedback(selection)
      .then(result => {
        if (isMounted) {
          setAnalysisResult(result);
        }
      })
      .catch(error => {
        console.info('[aura:makeup-feedback] analysis:blocked', {
          message: error instanceof Error ? error.message : String(error),
        });

        if (isMounted) {
          setAnalysisErrorMessage(getMakeupFeedbackAnalysisErrorMessage(error));
          setIsConferenceTyping(false);
          setClosingConferenceMessages([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selection]);

  useEffect(() => {
    if (!analysisResult) {
      return;
    }

    let isMounted = true;

    requestMakeupFeedbackGeneratedConferenceMessages({result: analysisResult, selection})
      .then(generatedMessages => {
        if (!isMounted) {
          return;
        }

        setClosingConferenceMessages(
          generatedMessages.length >= 3
            ? generatedMessages
            : buildMakeupFeedbackClosingConferenceMessages(analysisResult),
        );
      })
      .catch(error => {
        console.info('[aura:makeup-feedback] conference-generation:fallback', {
          message: error instanceof Error ? error.message : String(error),
        });

        if (isMounted) {
          setClosingConferenceMessages(buildMakeupFeedbackClosingConferenceMessages(analysisResult));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [analysisResult, selection]);

  useEffect(() => {
    if (analysisErrorMessage || isConferenceComplete) {
      return;
    }

    const safeMessageCount = countMessagesByPhase(conferenceMessages, 'safe');
    const closingMessageCount = countMessagesByPhase(conferenceMessages, 'closing');
    const canShowClosing =
      Boolean(analysisResult) &&
      closingConferenceMessages.length > 0 &&
      safeMessageCount >= MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES;
    const nextMessage = canShowClosing
      ? closingConferenceMessages[closingMessageCount]
      : safeConferenceMessages[safeMessageCount];

    if (!nextMessage) {
      if (canShowClosing) {
        setIsConferenceTyping(false);
        setIsConferenceComplete(true);
      } else {
        setIsConferenceTyping(true);
      }

      return;
    }

    const messageDelay =
      conferenceMessages.length === 0
        ? FIRST_CONFERENCE_MESSAGE_DELAY_MS
        : canShowClosing
          ? CLOSING_CONFERENCE_MESSAGE_INTERVAL_MS
          : SAFE_CONFERENCE_MESSAGE_INTERVAL_MS;

    setIsConferenceTyping(true);

    const timeoutId = setTimeout(() => {
      setConferenceMessages(currentMessages => {
        if (currentMessages.some(message => message.id === nextMessage.id)) {
          return currentMessages;
        }

        return [...currentMessages, nextMessage];
      });
    }, messageDelay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    analysisErrorMessage,
    analysisResult,
    closingConferenceMessages,
    conferenceMessages,
    isConferenceComplete,
    safeConferenceMessages,
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
          <View
            accessibilityLabel={`AI \uBDF0\uD2F0\uD300 \uD68C\uC758 \uC9C4\uD589\uB960 ${Math.round(displayedConferenceProgress * 100)}%`}
            accessibilityRole="progressbar"
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
              <Text style={styles.previewBadgeText}>회의 중</Text>
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
                목적을 다시 확인해 주세요
              </Text>
              <Text style={styles.errorDescription}>{analysisErrorMessage}</Text>
            </YStack>
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
                  accessibilityLabel="AI 에이전트 회의 대화"
                  accessibilityLiveRegion="polite"
                  style={styles.conversationList}>
                  {conferenceMessages.map(message => (
                    <ConferenceMessageBubble key={message.id} message={message} />
                  ))}
                  {isConferenceTyping ? <TypingBubble agentId={typingAgentId} /> : null}
                </YStack>
              </ScrollView>
            </View>
          )}

          {analysisErrorMessage ? (
            <Pressable
              accessibilityLabel="메이크업 목적 다시 적기"
              onPress={handleBackToGoalInput}
              style={({pressed}) => [styles.resultButton, pressed && styles.resultButtonPressed]}>
              <Text style={styles.resultButtonText}>다시 적기</Text>
            </Pressable>
          ) : isConferenceComplete ? (
            <ResultRevealButton onPress={handleComplete} />
          ) : null}
        </YStack>
      </YStack>
    </AppScreen>
  );
}

function ConferenceMessageBubble({
  message,
}: {
  message: MakeupFeedbackAgentConferenceMessage;
}) {
  const enter = useFadeIn();
  const agent = agentProfiles[message.agentId];
  const Icon = agent.Icon;

  return (
    <Animated.View style={[styles.messageRowAnimated, enter]}>
      <XStack style={styles.messageRow}>
        <View style={[styles.agentAvatar, {backgroundColor: agent.avatarBackground}]}>
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

function ResultRevealButton({onPress}: {onPress: () => void}) {
  const [isInteractive, setIsInteractive] = useState(false);
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(980),
      Animated.timing(value, {
        duration: 340,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({finished}) => {
      if (finished) {
        setIsInteractive(true);
      }
    });

    return () => {
      animation.stop();
    };
  }, [value]);

  return (
    <Animated.View
      pointerEvents={isInteractive ? 'auto' : 'none'}
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
        accessibilityLabel={'\uBA54\uC774\uD06C\uC5C5 \uD53C\uB4DC\uBC31 \uACB0\uACFC \uBCF4\uAE30'}
        onPress={onPress}
        style={({pressed}) => [styles.resultButton, pressed && styles.resultButtonPressed]}>
        <Text style={styles.resultButtonText}>{'\uACB0\uACFC \uBCF4\uAE30'}</Text>
        <ArrowRight color={colors.white} size={iconSize.sm} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}

function TypingBubble({agentId}: {agentId: MakeupFeedbackAgentId}) {
  const agent = agentProfiles[agentId];
  const Icon = agent.Icon;

  return (
    <XStack style={styles.typingRow}>
      <View style={[styles.agentAvatar, {backgroundColor: agent.avatarBackground}]}>
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
    paddingHorizontal: spacing.sm,
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
