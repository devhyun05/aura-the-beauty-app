import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {AnalysisResult} from '../../../shared/types/analysis';
import {AppCard, ImagePlaceholder} from '../../../shared/ui';

type AnalysisResultCardProps = {
  result: AnalysisResult;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const formatShortDate = (dateText: string) => {
  const date = new Date(dateText);
  const year = String(date.getFullYear()).slice(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
};

export function AnalysisResultCard({
  result,
  onPress,
  style,
}: AnalysisResultCardProps) {
  return (
    <AppCard onPress={onPress} padded={false} style={[styles.card, style]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder
          borderRadius={radius.md}
          resizeMode="cover"
          source={result.imageSource}
        />
      </View>
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.date}>
          {formatShortDate(result.analyzedAt)}
        </Text>
        <Text numberOfLines={1} style={styles.title}>
          {result.personalColor}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {result.recommendedMood}
        </Text>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderWidth: 0,
    elevation: 0,
    minWidth: 0,
    shadowOpacity: 0,
  },
  content: {
    gap: 2,
    paddingTop: spacing.sm,
  },
  date: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  imageArea: {
    aspectRatio: 0.86,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
});
