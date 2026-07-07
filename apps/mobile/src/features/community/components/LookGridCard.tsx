import {Bookmark, Heart, MessageCircle, Sparkles} from 'lucide-react-native';
import {Image, Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {getCommunityMockImageSource} from '../mocks/community.mock';
import type {CommunityThreadSummary} from '../types';
import {formatCount} from '../utils/format';
import {categoryIcons} from './CommunityCategoryTabs';

export function LookGridCard({
  matchPercent = null,
  showActions = false,
  showMeta = false,
  thread,
  width,
  onPress,
  onToggleLike,
  onToggleSave,
}: {
  matchPercent?: number | null;
  showActions?: boolean;
  showMeta?: boolean;
  thread: CommunityThreadSummary;
  width: number;
  onPress: (threadId: string) => void;
  onToggleLike?: (threadId: string) => void;
  onToggleSave?: (threadId: string) => void;
}) {
  const coverUri = thread.coverMedia.thumbnailUrl ?? thread.coverMedia.imageUrl ?? thread.coverMedia.cdnUrl ?? null;
  const imageSource = coverUri
    ? {uri: coverUri}
    : getCommunityMockImageSource(thread.coverMedia.id);
  const imageHeight = Math.round(width * (5 / 4));

  return (
    <Pressable
      accessibilityLabel={`${thread.title} 룩 자세히 보기`}
      accessibilityRole="button"
      onPress={() => onPress(thread.id)}
      style={({pressed}) => [styles.card, {width}, pressed && styles.pressed]}>
      <View style={styles.imageLayer}>
        <Image
          resizeMode="cover"
          source={imageSource}
          style={[
            styles.image,
            {height: imageHeight, width},
            showMeta && styles.imageWithPanel,
          ]}
        />

        {matchPercent != null ? (
          <XStack style={[styles.overlayPill, styles.matchPill]}>
            <Sparkles color={colors.white} size={iconSize.xs - 6} strokeWidth={2.4} />
            <Text style={styles.overlayText}>{matchPercent}%</Text>
          </XStack>
        ) : null}

        <CategoryBadge category={thread.category} />

        {!showMeta ? (
          <XStack style={[styles.overlayPill, styles.likePill]}>
            <Heart color={colors.white} fill={colors.white} size={iconSize.xs - 6} strokeWidth={2} />
            <Text style={styles.overlayText}>{formatCount(thread.counts.likes)}</Text>
          </XStack>
        ) : null}
      </View>

      {showMeta ? (
        <YStack style={styles.infoPanel}>
          <Text numberOfLines={1} style={styles.title}>{thread.title}</Text>
          <XStack style={styles.actionRow}>
            <Pressable
              accessibilityLabel={thread.viewerState.liked ? '좋아요 취소' : '좋아요'}
              accessibilityRole="button"
              disabled={!showActions || !onToggleLike}
              hitSlop={8}
              onPress={() => onToggleLike?.(thread.id)}
              style={({pressed}) => [styles.actionButton, pressed && styles.actionPressed]}>
              <Heart
                color={thread.viewerState.liked ? colors.heart : colors.textSecondary}
                fill={thread.viewerState.liked ? colors.heart : 'transparent'}
                size={iconSize.xs}
                strokeWidth={2}
              />
              <Text style={styles.actionText}>{formatCount(thread.counts.likes)}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="댓글 보기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onPress(thread.id)}
              style={({pressed}) => [styles.actionButton, pressed && styles.actionPressed]}>
              <MessageCircle color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
              <Text style={styles.actionText}>{formatCount(thread.counts.replies)}</Text>
            </Pressable>

            <View style={styles.actionSpacer} />

            {showActions && onToggleSave ? (
              <Pressable
                accessibilityLabel={thread.viewerState.saved ? '저장 취소' : '저장'}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => onToggleSave(thread.id)}
                style={({pressed}) => [styles.saveButton, pressed && styles.actionPressed]}>
                <Bookmark
                  color={thread.viewerState.saved ? communityColors.accent : colors.textSecondary}
                  fill={thread.viewerState.saved ? communityColors.accent : 'transparent'}
                  size={iconSize.xs}
                  strokeWidth={2.2}
                />
              </Pressable>
            ) : null}
          </XStack>
        </YStack>
      ) : null}
    </Pressable>
  );
}

function CategoryBadge({category}: {category: CommunityThreadSummary['category']}) {
  const Icon = categoryIcons[category] ?? Sparkles;

  return (
    <XStack style={styles.categoryBadge}>
      <Icon color={colors.white} size={iconSize.xs - 4} strokeWidth={2.2} />
    </XStack>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    minHeight: 24,
  },
  actionPressed: {
    opacity: 0.62,
    transform: [{scale: 0.94}],
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 24,
  },
  actionSpacer: {
    flex: 1,
  },
  actionText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontVariant: ['tabular-nums'],
    lineHeight: typography.lineHeight.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  categoryBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.45)',
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 24,
  },
  image: {
    borderRadius: radius.md,
  },
  imageLayer: {
    position: 'relative',
  },
  imageWithPanel: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  infoPanel: {
    backgroundColor: colors.surface,
    gap: 5,
    minHeight: 58,
    paddingBottom: 6,
    paddingHorizontal: spacing.sm,
    paddingTop: 7,
  },
  likePill: {
    backgroundColor: 'rgba(17, 17, 17, 0.45)',
    bottom: spacing.sm,
    left: spacing.sm,
  },
  matchPill: {
    backgroundColor: communityColors.accent,
    left: spacing.sm,
    top: spacing.sm,
  },
  overlayPill: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    position: 'absolute',
  },
  overlayText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.85,
  },
  saveButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 12,
    lineHeight: 15,
  },
});
