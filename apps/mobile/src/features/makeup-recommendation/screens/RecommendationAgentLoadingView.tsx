import {useEffect, useMemo, useRef, useState, type ComponentType} from 'react';
import {Animated, Easing, ScrollView, StyleSheet} from 'react-native';
import {
  Brush,
  ClipboardList,
  Clock3,
  ImagePlus,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  getMakeupRecommendationAgentMessage,
  type MakeupRecommendationAgentId,
  type MakeupRecommendationAgentMessage,
  type MakeupRecommendationLoadingContext,
} from '../services/makeupRecommendationAgentConversation';

const FIRST_MESSAGE_DELAY_MS = 420;
const MESSAGE_INTERVAL_MS = 1460;
const MAX_VISIBLE_MESSAGES = 24;

type AgentIcon = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

const agentProfiles: Record<
  MakeupRecommendationAgentId,
  {
    Icon: AgentIcon;
    avatarBackground: string;
    name: string;
    role: string;
    tint: string;
  }
> = {
  brief: {
    Icon: ClipboardList,
    avatarBackground: '#F4ECF7',
    name: 'Brief Agent',
    role: '상황 조건',
    tint: '#76547E',
  },
  mood: {
    Icon: Palette,
    avatarBackground: '#FFF1DD',
    name: 'Mood Agent',
    role: '무드·색감',
    tint: '#A05F2C',
  },
  balance: {
    Icon: SlidersHorizontal,
    avatarBackground: '#E8F1F4',
    name: 'Balance Agent',
    role: '표현 강도',
    tint: '#466D78',
  },
  routine: {
    Icon: Clock3,
    avatarBackground: '#F3EFE7',
    name: 'Routine Agent',
    role: '시간·난이도',
    tint: '#75664D',
  },
  artist: {
    Icon: Brush,
    avatarBackground: '#F8E8EC',
    name: 'Makeup Artist',
    role: '룩 설계',
    tint: '#9F5B68',
  },
  image: {
    Icon: ImagePlus,
    avatarBackground: '#EDEAF7',
    name: 'Image Agent',
    role: 'OpenAI 편집',
    tint: '#655B8D',
  },
  quality: {
    Icon: ShieldCheck,
    avatarBackground: '#EAF3EE',
    name: 'Quality Agent',
    role: '결과 확인',
    tint: '#596F62',
  },
};

type VisibleMessage = MakeupRecommendationAgentMessage & {id: string};

export function RecommendationAgentLoadingView({
  context,
}: {
  context: MakeupRecommendationLoadingContext;
}) {
  const conversationRef = useRef<ScrollView | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const contextKey = useMemo(() => JSON.stringify(context), [context]);
  const nextMessage = getMakeupRecommendationAgentMessage(context, messageIndex);

  useEffect(() => {
    setMessageIndex(0);
    setMessages([]);
  }, [contextKey]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setMessages(current => [
        ...current.slice(-(MAX_VISIBLE_MESSAGES - 1)),
        {...nextMessage, id: `${contextKey}-${messageIndex}`},
      ]);
      setMessageIndex(index => index + 1);
    }, messages.length === 0 ? FIRST_MESSAGE_DELAY_MS : MESSAGE_INTERVAL_MS);

    return () => clearTimeout(timeoutId);
  }, [contextKey, messageIndex, messages.length, nextMessage]);

  return (
    <AppScreen
      bottomPadding={spacing.lg}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="belowShellHeader">
      <YStack style={styles.content}>
        <YStack style={styles.heading}>
          <XStack style={styles.liveStatus}>
            <LiveDot />
            <Text style={styles.liveStatusText}>AI BEAUTY TEAM</Text>
          </XStack>
          <Text style={styles.title}>가장 어울리는 메이크업을 만드는 중이에요</Text>
          <Text style={styles.description}>
            선택한 답변을 바탕으로 에이전트들이 결과가 완성될 때까지 의견을 맞춰볼게요.
          </Text>
        </YStack>

        <View style={styles.conversationPanel}>
          <ScrollView
            ref={conversationRef}
            contentContainerStyle={styles.conversationContent}
            onContentSizeChange={() => conversationRef.current?.scrollToEnd({animated: true})}
            showsVerticalScrollIndicator={false}>
            <YStack
              accessibilityLabel="메이크업 추천 AI 에이전트 대화"
              accessibilityLiveRegion="polite"
              style={styles.conversationList}>
              {messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <TypingBubble agentId={nextMessage.agentId} />
            </YStack>
          </ScrollView>
        </View>
      </YStack>
    </AppScreen>
  );
}

function MessageBubble({message}: {message: VisibleMessage}) {
  const enter = useRef(new Animated.Value(0)).current;
  const agent = agentProfiles[message.agentId];
  const Icon = agent.Icon;

  useEffect(() => {
    Animated.timing(enter, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          {translateY: enter.interpolate({inputRange: [0, 1], outputRange: [8, 0]})},
        ],
      }}>
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

function TypingBubble({agentId}: {agentId: MakeupRecommendationAgentId}) {
  const agent = agentProfiles[agentId];
  const Icon = agent.Icon;

  return (
    <XStack style={styles.messageRow}>
      <View style={[styles.agentAvatar, {backgroundColor: agent.avatarBackground}]}>
        <Icon color={agent.tint} size={iconSize.xs} strokeWidth={2.2} />
      </View>
      <XStack style={styles.typingBubble}>
        <Text style={styles.agentName}>{agent.name}</Text>
        <TypingDots />
      </XStack>
    </XStack>
  );
}

function TypingDots() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const loops = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, {
            duration: 320,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            duration: 320,
            easing: Easing.in(Easing.quad),
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.delay((2 - index) * 140),
        ]),
      ),
    );

    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [dots]);

  return (
    <XStack style={styles.typingDots}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: dot.interpolate({inputRange: [0, 1], outputRange: [0.25, 1]}),
              transform: [
                {translateY: dot.interpolate({inputRange: [0, 1], outputRange: [0, -2]})},
              ],
            },
          ]}
        />
      ))}
    </XStack>
  );
}

function LiveDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.liveDot,
        {opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.45, 1]})},
      ]}
    />
  );
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
    lineHeight: typography.lineHeight.xs,
  },
  agentRole: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  conversationContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  conversationList: {gap: spacing.sm, justifyContent: 'flex-end'},
  conversationPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    minHeight: 260,
    overflow: 'hidden',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  heading: {alignItems: 'center', gap: spacing.sm},
  liveDot: {
    backgroundColor: colors.heart,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  liveStatus: {alignItems: 'center', gap: spacing.xs},
  liveStatusText: {
    color: colors.brandMuted,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 1.1,
  },
  messageBubble: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderTopLeftRadius: spacing.xs,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageMeta: {alignItems: 'center', gap: spacing.xs},
  messageRow: {alignItems: 'flex-start', gap: spacing.sm},
  messageText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  typingBubble: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    gap: spacing.sm,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  typingDot: {
    backgroundColor: colors.brandMuted,
    borderRadius: radius.pill,
    height: 5,
    width: 5,
  },
  typingDots: {alignItems: 'center', gap: 4},
});
