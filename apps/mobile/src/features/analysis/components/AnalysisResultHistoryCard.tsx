import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { AnalysisResult } from '../../../shared/types/analysis';

interface AnalysisResultHistoryCardProps {
  result: AnalysisResult;
  onPress?: () => void;
}

export const AnalysisResultHistoryCard = ({
  result,
  onPress,
}: AnalysisResultHistoryCardProps) => {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Image resizeMode="cover" source={result.imageSource} style={styles.image} />

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text numberOfLines={1} style={styles.title}>
              {result.title}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {result.analyzedAt} · {result.environmentLabel}
            </Text>
          </View>

          <View style={styles.subjectBadge}>
            <Text style={styles.subjectText}>{result.personLabel}</Text>
          </View>
        </View>

        <Text numberOfLines={2} style={styles.summary}>
          {result.shortSummary}
        </Text>

        <View style={styles.footer}>
          <Text numberOfLines={1} style={styles.mood}>
            {result.recommendedMood}
          </Text>

          <View style={styles.tags}>
            {result.tags.slice(0, 2).map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  content: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  footer: {
    gap: 8,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  image: {
    backgroundColor: userPageColors.background,
    borderRadius: userPageRadius.image,
    height: 108,
    width: 94,
  },
  meta: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
  },
  mood: {
    color: userPageColors.accent,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  subjectBadge: {
    backgroundColor: userPageColors.accentSoft,
    borderRadius: userPageRadius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  subjectText: {
    color: userPageColors.accent,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  summary: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 21,
  },
  tag: {
    backgroundColor: userPageColors.background,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.chip,
    borderWidth: 1,
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 21,
  },
  titleGroup: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
});
