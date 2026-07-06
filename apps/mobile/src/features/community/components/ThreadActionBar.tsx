import {Bookmark, Heart, MessageCircle, MoreHorizontal, Share2} from 'lucide-react-native';
import {Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack} from 'tamagui';

import {colors, iconSize, spacing, typography} from '../../../shared/theme';
import type {CommunityThreadDetail} from '../types';
import {formatCount} from '../utils/format';

// 스펙: 카운트 노출은 좋아요·답글 2개만. 저장은 상태(on/off)만 표시하고 카운트는 노출하지 않는다.
export function ThreadActionBar({
  isOwnThread = false,
  thread,
  onPressLike,
  onPressManageThread,
  onPressSave,
  onPressShare,
}: {
  isOwnThread?: boolean;
  thread: CommunityThreadDetail;
  onPressLike: () => void;
  onPressManageThread?: () => void;
  onPressSave: () => void;
  onPressShare: () => void;
}) {
  return (
    <XStack style={styles.bar}>
      <Pressable
        accessibilityLabel={thread.viewerState.liked ? '좋아요 취소' : '좋아요'}
        accessibilityRole="button"
        onPress={onPressLike}
        style={({pressed}) => [styles.action, pressed && styles.pressed]}>
        <Heart
          color={thread.viewerState.liked ? colors.heart : colors.textPrimary}
          fill={thread.viewerState.liked ? colors.heart : 'transparent'}
          size={iconSize.sm}
          strokeWidth={2}
        />
        <Text style={styles.countText}>{formatCount(thread.counts.likes)}</Text>
      </Pressable>

      <XStack style={styles.action}>
        <MessageCircle color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
        <Text style={styles.countText}>{formatCount(thread.counts.replies)}</Text>
      </XStack>

      <Pressable
        accessibilityLabel={thread.viewerState.saved ? '저장 취소' : '저장'}
        accessibilityRole="button"
        onPress={onPressSave}
        style={({pressed}) => [styles.action, pressed && styles.pressed]}>
        <Bookmark
          color={colors.textPrimary}
          fill={thread.viewerState.saved ? colors.textPrimary : 'transparent'}
          size={iconSize.sm}
          strokeWidth={2}
        />
      </Pressable>

      <View style={styles.spacer} />

      <Pressable
        accessibilityLabel="공유"
        accessibilityRole="button"
        onPress={onPressShare}
        style={({pressed}) => [styles.action, pressed && styles.pressed]}>
        <Share2 color={colors.textSecondary} size={iconSize.sm} strokeWidth={2} />
      </Pressable>

      {isOwnThread ? (
        <Pressable
          accessibilityLabel="내 글 관리"
          accessibilityRole="button"
          onPress={onPressManageThread}
          style={({pressed}) => [styles.action, pressed && styles.pressed]}>
          <MoreHorizontal color={colors.textSecondary} size={iconSize.sm} strokeWidth={2} />
        </Pressable>
      ) : null}
    </XStack>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  bar: {
    alignItems: 'center',
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
  },
  countText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontVariant: ['tabular-nums'],
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  spacer: {
    flex: 1,
  },
});
