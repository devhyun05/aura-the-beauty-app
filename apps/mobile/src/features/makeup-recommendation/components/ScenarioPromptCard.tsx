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
  paper: {backgroundColor: makeupRecommendationColors.paper, borderColor: makeupRecommendationColors.paperBorder, borderWidth: 1, shadowOpacity: 0.12},
  ink: {backgroundColor: makeupRecommendationColors.ink, shadowOpacity: 0.18},
  muted: {backgroundColor: makeupRecommendationColors.muted, shadowOpacity: 0.06},
  mid: {backgroundColor: makeupRecommendationColors.mid, shadowOpacity: 0.08},
  soft: {backgroundColor: makeupRecommendationColors.soft, shadowOpacity: 0.1},
  accent: {backgroundColor: makeupRecommendationColors.accent, shadowOpacity: 0.12},
});
const textPaletteStyles = StyleSheet.create({
  paper: {color: colors.textPrimary},
  ink: {color: colors.white},
  muted: {color: makeupRecommendationColors.ink},
  mid: {color: colors.textPrimary},
  soft: {color: colors.textPrimary},
  accent: {color: colors.textPrimary},
});
const emphasisStyles = StyleSheet.create({
  whisper: {fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  compact: {fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  standard: {fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  featured: {fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg},
  hero: {fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
});
const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    overflow: 'visible',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#000000',
    shadowOffset: {height: 8, width: 0},
    shadowRadius: 18,
  },
  fill: {height: '100%', width: '100%'},
  label: {fontFamily: typography.fontFamily.semibold, flexShrink: 1},
  pressed: {opacity: 0.72},
});
