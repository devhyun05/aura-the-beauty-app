import {Heart, MoreHorizontal} from 'lucide-react-native';
import {Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {CommunityReply} from '../types';
import {formatCount, formatRelativeTime} from '../utils/format';
import {CommunityAvatar} from './CommunityAvatar';

export type ReplyActionHandlers = {
  onPressManageReply: (reply: CommunityReply) => void;
  onPressReplyTo: (parentReplyId: string, nickname: string) => void;
  viewerAuthorId: string;
};

/**
 * 스레드(부모 답글 + 1단계 자식) 하나를 렌더링한다.
 * 상세 화면 FlatList의 renderItem으로 쓰인다.
 */
export function ReplyThreadItem({
  handlers,
  reply,
}: {
  handlers: ReplyActionHandlers;
  reply: CommunityReply;
}) {
  return (
    <YStack style={styles.threadItem}>
      <ReplyRow handlers={handlers} parentReplyId={reply.id} reply={reply} />

      {reply.replies?.length ? (
        <XStack style={styles.childWrap}>
          {/* 스펙: 들여쓰기 대신 2px threadLine 세로 커넥터 */}
          <View style={styles.threadLineColumn}>
            <View style={styles.threadLine} />
          </View>
          <YStack style={styles.childStack}>
            {reply.replies.map(child => (
              <ReplyRow
                key={child.id}
                handlers={handlers}
                mentionNickname={reply.author.nickname}
                parentReplyId={reply.id}
                reply={child}
                small
              />
            ))}
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  );
}

function ReplyRow({
  handlers,
  mentionNickname,
  parentReplyId,
  reply,
  small = false,
}: {
  handlers: ReplyActionHandlers;
  mentionNickname?: string;
  parentReplyId: string;
  reply: CommunityReply;
  small?: boolean;
}) {
  const isOwnReply = reply.author.id === handlers.viewerAuthorId;

  return (
    <Pressable
      accessibilityHint="답글 메뉴에서 수정 또는 삭제를 할 수 있어요"
      delayLongPress={350}
      onLongPress={() => handlers.onPressManageReply(reply)}
      style={({pressed}) => [styles.replyRow, pressed && styles.rowPressed]}>
      <CommunityAvatar
        avatarUrl={reply.author.avatarUrl}
        nickname={reply.author.nickname}
        size={small ? 24 : 28}
      />
      <YStack style={styles.replyCopy}>
        <XStack style={styles.replyTopRow}>
          <XStack style={styles.replyMeta}>
            <Text style={styles.nickname}>{reply.author.nickname}</Text>
            {mentionNickname ? (
              <Text style={styles.mentionBadge}>@{mentionNickname}</Text>
            ) : null}
            <Text style={styles.timeText}>{formatRelativeTime(reply.createdAt)}</Text>
          </XStack>
          <Pressable
            accessibilityLabel={`${reply.author.nickname} 답글 메뉴`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => handlers.onPressManageReply(reply)}
            style={({pressed}) => [styles.moreButton, isOwnReply && styles.ownMoreButton, pressed && styles.rowPressed]}>
            <MoreHorizontal
              color={isOwnReply ? colors.textPrimary : colors.textTertiary}
              size={iconSize.xs + 2}
              strokeWidth={2.3}
            />
          </Pressable>
        </XStack>
        <Text style={styles.body}>{reply.body}</Text>
        <XStack style={styles.replyFoot}>
          {/* 스펙: 답글 좋아요는 MVP display-only(토글 API 부재) */}
          {reply.likeCount > 0 ? (
            <XStack style={styles.likeBadge}>
              <Heart color={colors.textSecondary} size={iconSize.xs - 2} strokeWidth={2} />
              <Text style={styles.likeText}>{formatCount(reply.likeCount)}</Text>
            </XStack>
          ) : null}
          <Pressable
            accessibilityLabel={`${reply.author.nickname}에게 답글 달기`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => handlers.onPressReplyTo(parentReplyId, reply.author.nickname)}
            style={({pressed}) => pressed && styles.rowPressed}>
            <Text style={styles.replyActionText}>답글 달기</Text>
          </Pressable>
        </XStack>
      </YStack>
    </Pressable>
  );
}

export function ReplyEmptyState({onPressWrite}: {onPressWrite: () => void}) {
  return (
    <YStack style={styles.emptyBox}>
      <Text style={styles.emptyTitle}>첫 답글을 남겨보세요</Text>
      <Pressable
        accessibilityLabel="답글 작성 시작"
        accessibilityRole="button"
        onPress={onPressWrite}
        style={({pressed}) => [styles.emptyButton, pressed && styles.rowPressed]}>
        <Text style={styles.emptyButtonText}>답글 쓰기</Text>
      </Pressable>
    </YStack>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  childStack: {
    flex: 1,
    gap: spacing.md,
  },
  childWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingLeft: spacing.md,
  },
  emptyBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyButton: {
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  emptyButtonText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  likeBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  likeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontVariant: ['tabular-nums'],
    lineHeight: typography.lineHeight.xs,
  },
  mentionBadge: {
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.sm,
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.xs,
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  nickname: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  replyActionText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  replyCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  replyFoot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 2,
  },
  replyMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  replyRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  replyTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  ownMoreButton: {
    backgroundColor: colors.surfaceMuted,
  },
  rowPressed: {
    opacity: 0.72,
  },
  threadItem: {
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.md,
  },
  threadLine: {
    backgroundColor: communityColors.threadLine,
    borderRadius: radius.pill,
    flex: 1,
    width: 2,
  },
  threadLineColumn: {
    alignItems: 'center',
    width: 24,
  },
  timeText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
