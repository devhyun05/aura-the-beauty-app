import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {Check, ChevronRight, ShoppingBag, Trash2} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppCard, ImagePlaceholder} from '../../../shared/ui';

type FaceAnalysisReportCardProps = {
  report: FaceAnalysisReport;
  isDeleteConfirming?: boolean;
  isDeleting?: boolean;
  onDelete?: () => void;
  onPress?: () => void;
  onPressProducts?: () => void;
  style?: StyleProp<ViewStyle>;
};

const formatShortDate = (dateText: string) => {
  const date = new Date(dateText);
  const year = String(date.getFullYear()).slice(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
};

export function FaceAnalysisReportCard({
  isDeleteConfirming = false,
  isDeleting = false,
  onDelete,
  report,
  onPress,
  onPressProducts,
  style,
}: FaceAnalysisReportCardProps) {
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
    <AppCard onPress={onPress} padded={false} style={[styles.card, style]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder
          borderRadius={radius.lg}
          resizeMode="cover"
          source={report.imageSource}
        />
        <View pointerEvents="none" style={styles.imageScrim} />
        <View style={styles.imageTopRow}>
          <View style={styles.dateChip}>
            <Text numberOfLines={1} style={styles.dateChipText}>
              {formatShortDate(report.analyzedAt)}
            </Text>
          </View>
          <View style={styles.environmentChip}>
            <Text numberOfLines={1} style={styles.environmentChipText}>
              {report.environmentLabel}
            </Text>
          </View>
        </View>
        <View style={styles.imageCaption}>
          <Text numberOfLines={1} style={styles.imageTitle}>
            {report.personalColor}
          </Text>
          <Text numberOfLines={1} style={styles.imageSubtitle}>
            {report.recommendedMood}
          </Text>
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>얼굴형</Text>
            <Text numberOfLines={1} style={styles.metaValue}>
              {report.faceShape}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>피부 타입</Text>
            <Text numberOfLines={1} style={styles.metaValue}>
              {report.skinType}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.summary}>
          {report.shortSummary}
        </Text>
        <View style={styles.detailHint}>
          <Text numberOfLines={1} style={styles.detailHintText}>
            분석 보고서 보기
          </Text>
          <ChevronRight color={colors.textPrimary} size={iconSize.xs} strokeWidth={2.2} />
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
                <ShoppingBag
                  color={colors.textPrimary}
                  size={iconSize.xs}
                  strokeWidth={2}
                />
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
                  {isDeleting ? '중' : isDeleteConfirming ? '확인' : '삭제'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
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
    backgroundColor: '#FBFAF7',
    borderWidth: 0,
    elevation: 0,
    minWidth: 0,
    overflow: 'hidden',
    shadowOpacity: 0,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
  },
  dateChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dateChipText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  deleteAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 90, 77, 0.08)',
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 38,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: spacing.md,
  },
  deleteActionConfirm: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 38,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: spacing.md,
  },
  deleteActionText: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  deleteActionTextConfirm: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  detailHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  detailHintText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  environmentChip: {
    backgroundColor: 'rgba(17, 17, 17, 0.38)',
    borderRadius: radius.pill,
    maxWidth: 170,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  environmentChipText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  imageArea: {
    aspectRatio: 1.32,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    margin: spacing.sm,
    marginBottom: 0,
    overflow: 'hidden',
  },
  imageCaption: {
    bottom: spacing.lg,
    gap: 2,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
  },
  imageScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  imageSubtitle: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  imageTitle: {
    color: colors.white,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  imageTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metaItem: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    flex: 1,
    gap: 2,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  productAction: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  productActionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
});
