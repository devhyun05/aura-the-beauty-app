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
      <Image resizeMode="cover" source={result.imageSource} style={styles.thumbnail} />

      <View style={styles.details}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>{result.title}</Text>
            <Text numberOfLines={1} style={styles.meta}>
              {result.personalColor} · {result.skinType}
            </Text>
          </View>

          <ChevronRightIcon />
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

function ChevronRightIcon() {
  return (
    <View pointerEvents="none" style={styles.chevronIcon}>
      <View style={[styles.chevronLine, styles.chevronLineTop]} />
      <View style={[styles.chevronLine, styles.chevronLineBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 12,
  },
  chevronIcon: {
    height: 24,
    position: 'relative',
    width: 18,
  },
  chevronLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    right: 2,
    width: 10,
  },
  chevronLineBottom: {
    top: 13,
    transform: [{ rotate: '-45deg' }],
  },
  chevronLineTop: {
    top: 7,
    transform: [{ rotate: '45deg' }],
  },
  details: {
    flex: 1,
    gap: 9,
    minWidth: 0,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  meta: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
  },
  mood: {
    color: userPageColors.text,
    flex: 1,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  summary: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 21,
  },
  tag: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.chip,
    borderWidth: 1,
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tags: {
    flexDirection: 'row',
    gap: 5,
  },
  thumbnail: {
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 12,
    borderWidth: 1,
    height: 104,
    width: 86,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 21,
  },
  titleGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
});
