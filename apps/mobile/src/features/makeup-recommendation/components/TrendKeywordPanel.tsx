import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupSituation, MakeupTrendBadge, MakeupTrendKeyword} from '../types';

const badgeLabels: Record<MakeupTrendBadge, string> = {
  TREND_K_BEAUTY_2026: 'K-BEAUTY 2026',
  TREND_GLOBAL_SS26: 'GLOBAL SS26',
  STEADY: 'STEADY',
  CURATED: 'CURATED',
};

export function TrendKeywordPanel({
  disabled,
  onSelect,
  selectedKeywordId,
  situation,
}: {
  disabled?: boolean;
  onSelect: (keyword: MakeupTrendKeyword) => void;
  selectedKeywordId: string | null;
  situation: MakeupSituation;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>{situation.label}에서 원하는 무드를 골라주세요</Text>
        <Text style={styles.description}>키워드를 고르면 필요한 내용만 더 물어볼게요.</Text>
      </View>
      <View style={styles.list}>
        {situation.keywords.map(keyword => {
          const selected = keyword.id === selectedKeywordId;
          return (
            <Pressable
              accessibilityHint={`${badgeLabels[keyword.badge]} 키워드. 선택하면 맞춤 질문으로 이동합니다`}
              accessibilityLabel={keyword.label}
              accessibilityRole="button"
              accessibilityState={{disabled, selected}}
              disabled={disabled}
              key={keyword.id}
              onPress={() => onSelect(keyword)}
              style={[styles.keyword, selected && styles.keywordSelected]}
            >
              <Text style={[styles.keywordLabel, selected && styles.keywordLabelSelected]}>{keyword.label}</Text>
              <Text style={[styles.badge, selected && styles.badgeSelected]}>{badgeLabels[keyword.badge]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {gap: spacing.md},
  heading: {gap: spacing.xs},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  list: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  keyword: {borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  keywordSelected: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  keywordLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  keywordLabelSelected: {color: colors.white},
  badge: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: 9, letterSpacing: 0.5},
  badgeSelected: {color: colors.border},
});