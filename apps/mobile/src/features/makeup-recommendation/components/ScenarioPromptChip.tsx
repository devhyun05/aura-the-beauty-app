import {Pressable, StyleSheet, Text} from 'react-native';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupScenarioPrompt} from '../types';

type ScenarioPromptChipProps = {
  onPress: () => void;
  scenario: MakeupScenarioPrompt;
  variant?: 'default' | 'popular';
};

export function ScenarioPromptChip({
  onPress,
  scenario,
  variant = 'default',
}: ScenarioPromptChipProps) {
  const popular = variant === 'popular';
  return (
    <Pressable
      accessibilityLabel={scenario.displayText}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.chip,
        popular ? styles.popularChip : styles.defaultChip,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, popular ? styles.popularLabel : styles.defaultLabel]}>
        {scenario.displayText}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  popularChip: {
    backgroundColor: colors.textPrimary,
  },
  defaultChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    elevation: 1,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  label: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  popularLabel: {color: colors.white},
  defaultLabel: {color: colors.textPrimary},
  pressed: {opacity: 0.7},
});
