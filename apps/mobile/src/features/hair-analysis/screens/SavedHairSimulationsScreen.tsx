import {Pressable, StyleSheet} from 'react-native';
import {Scissors, Trash2} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {CachedImage} from '../../../shared/ui/CachedImage';
import type {HairSimulation} from '../types';

type SavedHairSimulationsScreenProps = {
  errorMessage?: string | null;
  isLoading: boolean;
  items: HairSimulation[];
  onDelete: (item: HairSimulation) => void;
  onOpen: (item: HairSimulation) => void;
  onRetry: () => void;
};

export function SavedHairSimulationsScreen({errorMessage, isLoading, items, onDelete, onOpen, onRetry}: SavedHairSimulationsScreenProps) {
  return (
    <AppScreen contentGap={spacing.xl} topPadding="belowShellHeader">
      <YStack style={styles.header}>
        <Text style={styles.title}>저장한 헤어</Text>
        <Text style={styles.description}>계정에 직접 저장한 합성 결과만 표시돼요.</Text>
      </YStack>
      {isLoading ? <Text style={styles.stateText}>저장한 결과를 불러오는 중이에요.</Text> : null}
      {errorMessage ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.stateText}>{errorMessage}{`\n`}다시 불러오기</Text>
        </Pressable>
      ) : null}
      {!isLoading && !errorMessage && items.length === 0 ? (
        <YStack style={styles.empty}>
          <Scissors color={colors.textTertiary} size={iconSize.xl} strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>아직 저장한 헤어가 없어요</Text>
          <Text style={styles.stateText}>헤어 분석에서 마음에 드는 결과를 저장해 보세요.</Text>
        </YStack>
      ) : null}
      <YStack style={styles.list}>
        {items.map(item => (
          <XStack key={item.id} style={styles.row}>
            <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={styles.openArea}>
              <View style={styles.thumbnail}>
                {item.resultUrl ? <CachedImage cachePolicy="memory" source={{uri: item.resultUrl}} style={styles.image} /> : null}
              </View>
              <YStack style={styles.copy}>
                <Text style={styles.itemTitle}>{item.style?.name ?? '저장한 헤어'}</Text>
                <Text style={styles.itemMeta}>{item.completedAt ? new Date(item.completedAt).toLocaleDateString('ko-KR') : ''}</Text>
              </YStack>
            </Pressable>
            <Pressable accessibilityLabel="저장한 헤어 삭제" accessibilityRole="button" hitSlop={spacing.sm} onPress={() => onDelete(item)} style={styles.deleteButton}>
              <Trash2 color={colors.textSecondary} size={iconSize.sm} strokeWidth={2} />
            </Pressable>
          </XStack>
        ))}
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  copy: {flex: 1, gap: spacing.xs, minWidth: 0},
  deleteButton: {alignItems: 'center', height: 44, justifyContent: 'center', width: 44},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm},
  empty: {alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center', minHeight: 360},
  emptyTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg},
  header: {gap: spacing.xs},
  image: {height: '100%', width: '100%'},
  itemMeta: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs},
  itemTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  list: {gap: 0},
  openArea: {alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0},
  retry: {alignItems: 'center', justifyContent: 'center', minHeight: 240},
  row: {alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, minHeight: 100, paddingVertical: spacing.sm},
  stateText: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm, textAlign: 'center'},
  thumbnail: {backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, height: 80, overflow: 'hidden', width: 68},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl},
});
