import {X} from 'lucide-react-native';
import {FlatList, Image, Modal, Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {formatRelativeTime} from '../utils/format';

/**
 * 쌓아둔 얼굴 분석 결과에서 리포트를 눈으로 보고 고르는 바텀 시트.
 * 선택하면 BEFORE(분석 사진) + AFTER(추천 메이크업)가 자동 매칭된다.
 */
export function ReportPickerModal({
  reports,
  onClose,
  onSelect,
}: {
  reports: FaceAnalysisReport[] | null;
  onClose: () => void;
  onSelect: (report: FaceAnalysisReport) => void;
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={reports != null}
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <YStack style={styles.sheet}>
        <XStack style={styles.header}>
          <YStack style={styles.headerCopy}>
            <Text style={styles.title}>내 분석 결과에서 고르기</Text>
            <Text style={styles.subtitle}>선택하면 비포(분석 사진)와 애프터(추천 메이크업)가 함께 채워져요.</Text>
          </YStack>
          <Pressable
            accessibilityLabel="닫기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({pressed}) => pressed && styles.pressed}>
            <X color={colors.textSecondary} size={iconSize.sm} strokeWidth={2.2} />
          </Pressable>
        </XStack>

        <FlatList
          data={reports ?? []}
          keyExtractor={report => report.id}
          contentContainerStyle={styles.listContent}
          renderItem={({item}) => (
            <Pressable
              accessibilityLabel={`${item.reportTitle || item.title} 선택`}
              accessibilityRole="button"
              onPress={() => onSelect(item)}
              style={({pressed}) => [styles.row, pressed && styles.pressed]}>
              <Image resizeMode="cover" source={item.imageSource} style={styles.thumb} />
              <YStack style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {item.reportTitle || item.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatRelativeTime(item.analyzedAt)}
                </Text>
                {item.personalColor ? (
                  <View style={styles.toneChip}>
                    <Text style={styles.toneChipText}>{item.personalColor}</Text>
                  </View>
                ) : null}
              </YStack>
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
        />
      </YStack>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(17, 17, 17, 0.45)',
    flex: 1,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  pressed: {
    opacity: 0.72,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  rowMeta: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sheet: {
    backgroundColor: communityColors.surfaceWarm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '72%',
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  thumb: {
    borderRadius: radius.sm,
    height: 84,
    width: 66,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  toneChip: {
    alignSelf: 'flex-start',
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  toneChipText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
