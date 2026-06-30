import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {Check, ShoppingBag, Trash2} from 'lucide-react-native';
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
          borderRadius={radius.md}
          resizeMode="cover"
          source={report.imageSource}
        />
      </View>
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.date}>
          {formatShortDate(report.analyzedAt)}
        </Text>
        <Text numberOfLines={1} style={styles.title}>
          {report.personalColor}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {report.recommendedMood}
        </Text>
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
                  추천
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
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.background,
    borderWidth: 0,
    elevation: 0,
    minWidth: 0,
    shadowOpacity: 0,
  },
  content: {
    gap: 2,
    paddingTop: spacing.sm,
  },
  deleteAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  deleteActionConfirm: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
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
  date: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  imageArea: {
    aspectRatio: 0.86,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  productAction: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 2,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  productActionText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
});
