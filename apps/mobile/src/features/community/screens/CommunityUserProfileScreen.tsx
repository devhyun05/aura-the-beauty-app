import {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, spacing, typography} from '../../../shared/theme';
import {CommunityAvatar} from '../components/CommunityAvatar';
import {LookGridCard} from '../components/LookGridCard';
import {getCommunityThreadsByAuthor} from '../services/communityService';
import type {CommunityThreadSummary} from '../types';

/**
 * 커뮤니티 공개 프로필 — 작성자 아바타를 탭하면 열리는 경량 화면.
 * 마이페이지(사적 정보 포함)와 달리 닉네임 + 올린 룩 그리드만 노출한다.
 * 팔로우/팔로워는 커뮤니티 활성화 이후 P2 (초기엔 '팔로워 0'이 역효과).
 */
export function CommunityUserProfileScreen({
  avatarUrl,
  nickname,
  userId,
  onPressThread,
}: {
  avatarUrl?: string | null;
  nickname: string;
  userId: string;
  onPressThread: (threadId: string) => void;
}) {
  const {width: windowWidth} = useWindowDimensions();
  const [isLoading, setIsLoading] = useState(true);
  const [threads, setThreads] = useState<CommunityThreadSummary[]>([]);
  const gridItemWidth = (windowWidth - spacing.screenX * 2 - spacing.md) / 2;

  const loadThreads = useCallback(async () => {
    setIsLoading(true);

    try {
      setThreads(await getCommunityThreadsByAuthor(userId));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  return (
    <View style={styles.screen}>
      <FlatList
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        data={threads}
        keyExtractor={thread => thread.id}
        ListEmptyComponent={
          isLoading
            ? (
              <View style={styles.stateBox}>
                <ActivityIndicator color={colors.textPrimary} />
              </View>
            )
            : (
              <View style={styles.stateBox}>
                <Text style={styles.emptyText}>아직 올린 룩이 없어요.</Text>
              </View>
            )
        }
        ListHeaderComponent={
          <XStack style={styles.header}>
            <CommunityAvatar avatarUrl={avatarUrl} nickname={nickname} size={64} />
            <YStack style={styles.headerCopy}>
              <Text style={styles.nickname}>{nickname}</Text>
              <Text style={styles.meta}>올린 룩 {threads.length}개</Text>
            </YStack>
          </XStack>
        }
        numColumns={2}
        renderItem={({item}) => (
          <LookGridCard
            showMeta
            thread={item}
            width={gridItemWidth}
            onPress={onPressThread}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
  },
  headerCopy: {
    gap: 2,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  meta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  nickname: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  screen: {
    backgroundColor: communityColors.surfaceWarm,
    flex: 1,
  },
  stateBox: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
});
