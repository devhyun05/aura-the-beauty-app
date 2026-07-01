import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import {Check, ShoppingBag, Trash2} from 'lucide-react-native';
import { Text, View } from 'tamagui';

import { colors, iconSize, radius, spacing, typography } from '../../../shared/theme';
import {
  AppCard,
  ChevronRightIcon,
  ImagePlaceholder,
} from '../../../shared/ui';
import type { FaceAnalysisReport } from '../../../shared/types/faceAnalysis';

type FaceAnalysisSummaryCardProps = {
  report: FaceAnalysisReport;
  isDeleteConfirming?: boolean;
  isDeleting?: boolean;
  onDelete?: () => void;
  onPress?: () => void;
  onPressProducts?: () => void;
};

export function FaceAnalysisSummaryCard({
  isDeleteConfirming = false,
  isDeleting = false,
  onDelete,
  report,
  onPress,
  onPressProducts,
}: FaceAnalysisSummaryCardProps) {
  const hasActions = Boolean(onPressProducts || onDelete);
  const handlePressProducts = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPressProducts?.();
  };
  const handlePressDelete = (event: GestureResponderEvent) => {
    event.stopPropagation();

    if (!isDeleting) {
      onDelete?.();
    }
  };

  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.imageFrame}>
          <ImagePlaceholder
            borderRadius={radius.md}
            source={report.imageSource}
          />
        </View>

        <View style={styles.info}>
          <Text numberOfLines={1} style={styles.title}>
            {report.title}
          </Text>
          <Text numberOfLines={2} style={styles.description}>
            {report.shortSummary}
          </Text>
          <Text numberOfLines={1} style={styles.mood}>
            {report.recommendedMood}
          </Text>
        </View>

        <ChevronRightIcon />
      </View>

      {hasActions ? (
        <View style={styles.actionRow}>
          {onPressProducts ? (
            <Pressable
              accessibilityLabel={`${report.title} 기준 추천 제품 보기`}
              accessibilityRole="button"
              onPress={handlePressProducts}
              style={({pressed}) => [
                styles.productAction,
                pressed ? styles.actionPressed : null,
              ]}>
              <ShoppingBag color={colors.white} size={iconSize.xs} strokeWidth={2} />
              <Text numberOfLines={1} style={styles.productActionText}>
                추천 제품
              </Text>
            </Pressable>
          ) : null}

          {onDelete ? (
            <Pressable
              accessibilityLabel={`${report.title} 보고서 삭제`}
              accessibilityRole="button"
              accessibilityState={{busy: isDeleting}}
              disabled={isDeleting}
              onPress={handlePressDelete}
              style={({pressed}) => [
                isDeleteConfirming ? styles.deleteActionConfirm : styles.deleteAction,
                pressed ? styles.actionPressed : null,
              ]}>
              {isDeleting ? (
                <ActivityIndicator
                  color={isDeleteConfirming ? colors.white : colors.danger}
                  size="small"
                />
              ) : isDeleteConfirming ? (
                <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
              ) : (
                <Trash2 color={colors.danger} size={iconSize.xs} strokeWidth={2} />
              )}
              <Text
                numberOfLines={1}
                style={
                  isDeleteConfirming
                    ? styles.deleteActionTextConfirm
                    : styles.deleteActionText
                }>
                {isDeleting ? '삭제 중' : isDeleteConfirming ? '삭제 확인' : '삭제'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  actionPressed: {
    opacity: 0.72,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  card: {
    borderRadius: 18,
    padding: 10,
  },
  deleteAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 96,
    paddingHorizontal: spacing.md,
  },
  deleteActionConfirm: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 112,
    paddingHorizontal: spacing.md,
  },
  deleteActionText: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  deleteActionTextConfirm: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  description: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  imageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 92,
    overflow: 'hidden',
    width: 92,
  },
  info: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minWidth: 0,
  },
  mood: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  productAction: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  productActionText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
