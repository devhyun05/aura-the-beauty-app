import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {Text} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {buildMakeupReportTargetPresentation} from '../services/makeupReportTargetPresentation';
import type {
  MakeupReportProductCategory,
  MakeupReportRecommendationTarget,
} from '../services/makeupReportProductRecommendationTypes';

export function MakeupReportTargetLegend({
  category,
  categoryLabel,
  target,
  variant = 'default',
  style,
}: {
  category: MakeupReportProductCategory;
  categoryLabel: string;
  target?: MakeupReportRecommendationTarget;
  variant?: 'default' | 'compact';
  style?: StyleProp<ViewStyle>;
}) {
  const presentation = buildMakeupReportTargetPresentation(category, target);
  const isCompact = variant === 'compact';
  const primaryLabel = isCompact && presentation.swatches.length === 0 && presentation.detailLabel
    ? presentation.detailLabel
    : presentation.label;
  const accessibleColorLabel = presentation.swatches
    .map(swatch => swatch.label?.trim())
    .filter((label): label is string => Boolean(label))
    .join(', ');
  const accessibilityLabel = [
    `${categoryLabel} 추천 기준`,
    accessibleColorLabel || presentation.label,
    presentation.detailLabel,
  ].filter(Boolean).join(', ');

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
      style={[styles.legend, isCompact ? styles.legendCompact : undefined, style]}>
      <Text style={[styles.category, isCompact ? styles.categoryCompact : undefined]}>{categoryLabel}</Text>
      {presentation.swatches.length > 0 ? (
        <View style={styles.swatches}>
          {presentation.swatches.slice(0, 5).map(swatch => (
            <View
              key={swatch.hex}
              accessibilityLabel={swatch.label}
              style={[
                styles.swatch,
                isCompact ? styles.swatchCompact : undefined,
                {backgroundColor: swatch.hex},
              ]}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.label}>{primaryLabel}</Text>
        {!isCompact && presentation.detailLabel ? (
          <Text numberOfLines={1} style={styles.detail}>{presentation.detailLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  legendCompact: {minHeight: 34, paddingHorizontal: spacing.sm, paddingVertical: 6},
  category: {...typography.caption, color: colors.textSecondary},
  categoryCompact: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold},
  swatches: {flexDirection: 'row'},
  swatch: {
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 16,
    marginLeft: -2,
    width: 16,
  },
  swatchCompact: {height: 14, width: 14},
  copy: {flexShrink: 1},
  label: {...typography.caption, color: colors.textPrimary},
  detail: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
