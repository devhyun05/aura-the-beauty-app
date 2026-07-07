import {Bookmark, Heart, ImageOff, MessageCircle, Sparkles, Timer} from 'lucide-react-native';
import {useRef, useState} from 'react';
import {Animated, Image, Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getCommunityMockImageSource} from '../mocks/community.mock';
import type {CommunityAuthor, CommunityThreadSummary} from '../types';
import {difficultyLabels, formatCount} from '../utils/format';
import {CommunityAvatar} from './CommunityAvatar';
import {categoryIcons} from './CommunityCategoryTabs';
import {LookMoodChips} from './LookMoodChips';
import {ScrimOverlay} from './ScrimOverlay';

type CoverImageStatus = 'loading' | 'loaded' | 'error';

// 스펙: 저장 버튼 시각 40px + hitSlop으로 터치 영역 44pt 이상.
const SAVE_BUTTON_SIZE = 40;
const SAVE_BUTTON_HIT_SLOP = 8;

// 스펙 §6: 저장/좋아요 토글 시 spring pop.
function popScale(scale: Animated.Value) {
  scale.setValue(0.9);
  Animated.spring(scale, {
    friction: 3.5,
    tension: 220,
    toValue: 1,
    useNativeDriver: true,
  }).start();
}

function CategoryBadge({category}: {category: CommunityThreadSummary['category']}) {
  const Icon = categoryIcons[category] ?? Sparkles;

  return (
    <XStack accessibilityLabel="룩 카테고리" style={styles.categoryBadge}>
      <Icon color={colors.white} size={iconSize.xs - 2} strokeWidth={2.2} />
    </XStack>
  );
}

export function LookThreadCard({
  matchPercent = null,
  thread,
  onPress,
  onPressAuthor,
  onToggleLike,
  onToggleSave,
}: {
  /** 최신 분석 리포트와의 매칭 점수(0~100). null이면 배지 미노출. */
  matchPercent?: number | null;
  thread: CommunityThreadSummary;
  onPress: (threadId: string) => void;
  onPressAuthor?: (author: CommunityAuthor) => void;
  onToggleLike: (threadId: string) => void;
  onToggleSave: (threadId: string) => void;
}) {
  const [coverStatus, setCoverStatus] = useState<CoverImageStatus>('loading');
  const [coverAttempt, setCoverAttempt] = useState(0);
  const likeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const coverUri = thread.coverMedia.thumbnailUrl ?? thread.coverMedia.imageUrl ?? thread.coverMedia.cdnUrl ?? null;
  const imageSource = coverUri
    ? {uri: coverUri}
    : getCommunityMockImageSource(thread.coverMedia.id);

  const coverLoaded = coverStatus === 'loaded';
  const coverFailed = coverStatus === 'error';
  // 레시피 스트립: 값이 있는 세그먼트만 표시, 둘 다 없으면 줄 자체를 숨긴다(기본값 날조 금지).
  // 질문 카테고리는 레시피 값이 없으면 같은 자리를 "답변 n개" 컨텍스트로 대체해 카드 리듬을 유지한다.
  const hasDuration = thread.durationMinutes != null;
  const hasDifficulty = thread.difficulty != null;
  const showRecipeStrip = hasDuration || hasDifficulty;
  const showQuestionContext = !showRecipeStrip && thread.category === 'question';

  const authorRow = (
    <XStack style={styles.authorRow}>
      <CommunityAvatar
        bordered
        avatarUrl={thread.author.avatarUrl}
        nickname={thread.author.nickname}
        size={24}
      />
      <Text style={[styles.authorText, coverFailed && styles.fallbackAuthorText]}>
        @{thread.author.nickname}
      </Text>
      {thread.situationTags[0] ? (
        <Text style={[styles.contextText, coverFailed && styles.fallbackContextText]}>
          · {thread.situationTags[0]}
        </Text>
      ) : null}
    </XStack>
  );

  return (
    <Pressable
      accessibilityLabel={`${thread.title} 룩 자세히 보기`}
      accessibilityRole="button"
      onPress={() => onPress(thread.id)}
      style={({pressed}) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.imageWrap}>
        {!coverFailed ? (
          <Image
            key={coverAttempt}
            resizeMode="cover"
            source={imageSource}
            style={styles.image}
            onError={() => setCoverStatus('error')}
            onLoad={() => setCoverStatus('loaded')}
          />
        ) : (
          <Pressable
            accessibilityLabel="이미지 다시 불러오기"
            accessibilityRole="button"
            style={styles.imageRetry}
            onPress={() => {
              setCoverStatus('loading');
              setCoverAttempt(attempt => attempt + 1);
            }}>
            <ImageOff color={colors.textTertiary} size={iconSize.lg} strokeWidth={1.8} />
            <Text style={styles.imageRetryText}>다시 불러오기</Text>
          </Pressable>
        )}

        {coverLoaded ? <ScrimOverlay /> : null}

        <CategoryBadge category={thread.category} />

        <Pressable
          accessibilityLabel={thread.viewerState.saved ? '저장 취소' : '저장'}
          accessibilityRole="button"
          hitSlop={SAVE_BUTTON_HIT_SLOP}
          onPress={() => {
            popScale(saveScale);
            onToggleSave(thread.id);
          }}
          style={({pressed}) => [styles.saveButton, pressed && styles.savePressed]}>
          <Animated.View style={{transform: [{scale: saveScale}]}}>
            <Bookmark
              color={thread.viewerState.saved ? communityColors.accent : colors.textPrimary}
              fill={thread.viewerState.saved ? communityColors.accent : 'transparent'}
              size={iconSize.sm}
              strokeWidth={2.2}
            />
          </Animated.View>
        </Pressable>

        {coverLoaded || coverFailed ? (
          <YStack style={styles.imageCopy}>
            {onPressAuthor ? (
              <Pressable
                accessibilityLabel={`${thread.author.nickname} 프로필 보기`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={event => {
                  event.stopPropagation();
                  onPressAuthor(thread.author);
                }}
                style={({pressed}) => pressed && styles.authorPressed}>
                {authorRow}
              </Pressable>
            ) : authorRow}
            <Text
              numberOfLines={2}
              style={[styles.title, coverFailed && styles.fallbackTitle]}>
              {thread.title}
            </Text>
            <LookMoodChips limit={2} tags={thread.moodTags} tone={coverFailed ? 'light' : 'dark'} />
          </YStack>
        ) : null}
      </View>

      <YStack style={styles.contentPanel}>
        {showRecipeStrip || showQuestionContext || matchPercent != null ? (
          <XStack style={styles.metaRow}>
            {showRecipeStrip ? (
              <XStack style={styles.recipeStrip}>
                <Timer color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
                {hasDuration ? <Text style={styles.recipeText}>{thread.durationMinutes}분</Text> : null}
                {hasDuration && hasDifficulty ? <Text style={styles.recipeSeparator}>·</Text> : null}
                {hasDifficulty && thread.difficulty ? (
                  <Text style={styles.recipeText}>{difficultyLabels[thread.difficulty]}</Text>
                ) : null}
              </XStack>
            ) : showQuestionContext ? (
              <XStack style={styles.recipeStrip}>
                <MessageCircle color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
                <Text style={styles.recipeText}>답변 {formatCount(thread.counts.replies)}개</Text>
              </XStack>
            ) : (
              <View />
            )}

            {matchPercent != null ? (
              <XStack
                accessibilityLabel={`내 리포트·활동 기반 스타일 매칭 ${matchPercent}퍼센트`}
                style={styles.matchBadge}>
                <Sparkles color={communityColors.accent} size={iconSize.xs - 2} strokeWidth={2.2} />
                <Text style={styles.matchBadgeText}>내 스타일 {matchPercent}%</Text>
              </XStack>
            ) : null}
          </XStack>
        ) : null}

        <XStack style={styles.reactionRow}>
          <Pressable
            accessibilityLabel={thread.viewerState.liked ? '좋아요 취소' : '좋아요'}
            accessibilityRole="button"
            onPress={() => {
              popScale(likeScale);
              onToggleLike(thread.id);
            }}
            style={({pressed}) => [styles.reactionButton, pressed && styles.reactionPressed]}>
            <Animated.View style={{transform: [{scale: likeScale}]}}>
              <Heart
                color={thread.viewerState.liked ? colors.heart : colors.textSecondary}
                fill={thread.viewerState.liked ? colors.heart : 'transparent'}
                size={iconSize.xs}
                strokeWidth={2}
              />
            </Animated.View>
            <Text style={styles.reactionText}>{formatCount(thread.counts.likes)}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="답글 보기"
            accessibilityRole="button"
            onPress={() => onPress(thread.id)}
            style={({pressed}) => [styles.reactionButton, pressed && styles.reactionPressed]}>
            <MessageCircle color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.reactionText}>{formatCount(thread.counts.replies)}</Text>
          </Pressable>
        </XStack>
      </YStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  authorPressed: {
    opacity: 0.72,
  },
  authorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  authorText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.screenX,
    overflow: 'hidden',
    ...shadows.soft,
  },
  categoryBadge: {
    alignItems: 'center',
    backgroundColor: communityColors.overlayPill,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 34,
  },
  contentPanel: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  contextText: {
    color: 'rgba(255, 255, 255, 0.78)',
    flexShrink: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  fallbackAuthorText: {
    color: colors.textPrimary,
  },
  fallbackContextText: {
    color: colors.textSecondary,
  },
  fallbackTitle: {
    color: colors.textPrimary,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageCopy: {
    bottom: spacing.lg,
    gap: spacing.sm,
    left: spacing.lg,
    position: 'absolute',
    right: SAVE_BUTTON_SIZE + spacing.lg + spacing.md,
  },
  imageRetry: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  imageRetryText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  imageWrap: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    position: 'relative',
    width: '100%',
  },
  matchBadge: {
    alignItems: 'center',
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  matchBadgeText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontVariant: ['tabular-nums'],
    lineHeight: typography.lineHeight.xs,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  pressed: {
    opacity: 0.92,
    transform: [{scale: 0.995}],
  },
  reactionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  reactionPressed: {
    opacity: 0.6,
  },
  reactionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  reactionText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recipeSeparator: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  recipeStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.xs,
  },
  recipeText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    bottom: spacing.md,
    height: SAVE_BUTTON_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    width: SAVE_BUTTON_SIZE,
    ...shadows.soft,
  },
  savePressed: {
    transform: [{scale: 0.94}],
  },
  title: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xl,
    lineHeight: 30,
  },
});
