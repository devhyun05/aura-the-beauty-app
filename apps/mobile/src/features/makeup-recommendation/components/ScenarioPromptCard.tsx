import {Pressable, StyleSheet, Text, type StyleProp, type ViewStyle} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {makeupRecommendationColors} from '../theme/makeupRecommendationTokens';
import type {MakeupScenarioPrompt} from '../types';

export function ScenarioPromptCard({fill = false, onPress, scenario, style}: {
  fill?: boolean;
  onPress: () => void;
  scenario: MakeupScenarioPrompt;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={`${scenario.displayText} 시나리오 선택`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        fill ? styles.fill : null,
        paletteStyles[scenario.palette],
        style,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.label, emphasisStyles[scenario.visualEmphasis], textPaletteStyles[scenario.palette]]}>
        {scenario.displayText}
      </Text>
    </Pressable>
  );
}

const paletteStyles = StyleSheet.create({
  paper: {backgroundColor: colors.surface, borderColor: colors.borderStrong},
  ink: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  muted: {backgroundColor: colors.surfaceMuted, borderColor: colors.divider},
  accent: {backgroundColor: makeupRecommendationColors.accent, borderColor: makeupRecommendationColors.accent},
});
const textPaletteStyles = StyleSheet.create({
  paper: {color: colors.textPrimary},
  ink: {color: colors.white},
  muted: {color: colors.textPrimary},
  accent: {color: makeupRecommendationColors.accentText},
});
const emphasisStyles = StyleSheet.create({
  compact: {fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  standard: {fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  featured: {fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
});
const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    overflow: 'visible',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fill: {height: '100%', width: '100%'},
  label: {fontFamily: typography.fontFamily.semibold, flexShrink: 1},
  pressed: {opacity: 0.72},
});
