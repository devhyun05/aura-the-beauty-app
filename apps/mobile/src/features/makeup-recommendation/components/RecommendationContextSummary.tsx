import {StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {getNeutralGenderRecommendationNote} from '../screens/makeupRecommendationViewContracts';
import type {MakeupRecommendationProfileGender} from '../types';

export function RecommendationContextSummary({
  keywordLabel,
  profileGender,
  reportLabel,
  situationLabel,
}: {
  keywordLabel?: string;
  profileGender?: MakeupRecommendationProfileGender;
  reportLabel?: string;
  situationLabel?: string;
}) {
  const items = [reportLabel, situationLabel, keywordLabel].filter(Boolean) as string[];
  const neutralGenderNote = getNeutralGenderRecommendationNote(profileGender);
  if (items.length === 0 && !neutralGenderNote) return null;
  return (
    <View accessibilityLabel={`추천 기준: ${[...items, neutralGenderNote].filter(Boolean).join(', ')}`} style={styles.container}>
      <Text style={styles.title}>이번 추천에 반영했어요</Text>
      {items.length > 0 ? <View style={styles.chips}>
        {items.map(item => <Text key={item} style={styles.chip}>{item}</Text>)}
      </View> : null}
      {neutralGenderNote ? <Text style={styles.note}>{neutralGenderNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md},
  title: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  chip: {backgroundColor: colors.bottomSheetSurface, borderRadius: radius.pill, color: colors.textPrimary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
  note: {color: colors.textTertiary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
});