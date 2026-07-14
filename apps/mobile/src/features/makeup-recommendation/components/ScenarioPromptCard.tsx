import {StyleSheet, Text, type ViewStyle} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard} from '../../../shared/ui';
import type {MakeupScenarioPrompt, MakeupScenarioTone} from '../types';

export type ScenarioCardEmphasis = 'featured' | 'regular';

type ScenarioPromptCardProps = {
  emphasis: ScenarioCardEmphasis;
  onPress: () => void;
  scenario: MakeupScenarioPrompt;
  style?: ViewStyle;
};

const toneStyles: Record<MakeupScenarioTone, ViewStyle> = {
  narrative: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  playful: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.liquidGlassBorder,
  },
  premium: {
    backgroundColor: colors.white,
    borderColor: colors.textPrimary,
  },
};

export function ScenarioPromptCard({
  emphasis,
  onPress,
  scenario,
  style,
}: ScenarioPromptCardProps) {
  const featured = emphasis === 'featured';

  return (
    <AppCard
      accessibilityLabel={`${scenario.displayText} 시나리오 선택`}
      onPress={onPress}
      padded={false}
      style={[
        styles.card,
        toneStyles[scenario.tone],
        featured ? styles.featured : styles.regular,
        style,
      ]}
    >
      <Text
        numberOfLines={2}
        style={[styles.label, featured ? styles.featuredLabel : null]}
      >
        {scenario.displayText}
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    justifyContent: 'center',
    minHeight: 52,
    overflow: 'hidden',
  },
  featured: {
    minHeight: 76,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    width: '100%',
  },
  regular: {
    borderRadius: radius.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  label: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  featuredLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
