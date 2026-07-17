import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT,
  getMakeupRecommendationEditorialTrends,
} from '../data/makeupRecommendationEditorialTrends';
import type {MakeupRecommendationDiscovery, MakeupScenarioPrompt} from '../types';

type EditorialTrendSectionProps = {
  catalog: MakeupRecommendationDiscovery | null;
  disabled?: boolean;
  onSelect: (prompt: MakeupScenarioPrompt) => void;
};

export function EditorialTrendSection({catalog, disabled = false, onSelect}: EditorialTrendSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const trends = useMemo(() => getMakeupRecommendationEditorialTrends(catalog), [catalog]);
  const visibleTrends = expanded
    ? trends
    : trends.slice(
        0,
        MAKEUP_RECOMMENDATION_EDITORIAL_TREND_INITIAL_COUNT,
      );

  return (
    <View style={styles.section}>
      <Text style={styles.title}>트렌드 메이크업</Text>

      <View accessibilityLabel="트렌드 메이크업 키워드" style={styles.chipList}>
        {visibleTrends.map(prompt => (
          <Pressable
            accessibilityHint="선택하면 맞춤 질문으로 이동합니다"
            accessibilityLabel={prompt.displayText}
            accessibilityRole="button"
            accessibilityState={{disabled}}
            disabled={disabled}
            key={prompt.id}
            onPress={() => onSelect(prompt)}
            style={({pressed}) => [
              styles.chip,
              pressed && !disabled && styles.chipPressed,
              disabled && styles.chipDisabled,
            ]}
          >
            <Text style={[styles.chipLabel, disabled && styles.chipLabelDisabled]}>
              {prompt.displayText}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityLabel={expanded ? '트렌드 메이크업 키워드 접기' : '트렌드 메이크업 키워드 더보기'}
        accessibilityRole="button"
        accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [styles.toggleButton, pressed && styles.togglePressed]}
      >
        <Text style={styles.toggleLabel}>{expanded ? '접기' : '더보기'}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.toggleIcon}>
          {expanded ? '↑' : '↓'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {gap: spacing.md},
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  chipList: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipPressed: {backgroundColor: colors.divider},
  chipDisabled: {opacity: 0.45},
  chipLabel: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  chipLabelDisabled: {color: colors.textSecondary},
  toggleButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  togglePressed: {opacity: 0.55},
  toggleLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  toggleIcon: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
});
