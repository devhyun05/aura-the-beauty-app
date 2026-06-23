import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { AnalysisReportPreview } from '../../../shared/types/userPage';

interface AnalysisReportPreviewCardProps {
  report: AnalysisReportPreview;
  onPress?: () => void;
}

export const AnalysisReportPreviewCard = ({
  report,
  onPress,
}: AnalysisReportPreviewCardProps) => {
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
      <Image
        resizeMode="cover"
        source={report.imageSource}
        style={styles.thumbnail}
      />

      <View style={styles.details}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>{report.title}</Text>
            <Text numberOfLines={1} style={styles.meta}>
              {report.personalColor} · {report.skinType}
            </Text>
          </View>

          <ChevronRightIcon />
        </View>

        <Text numberOfLines={2} style={styles.summary}>
          {report.shortSummary}
        </Text>

        <View style={styles.footer}>
          <Text numberOfLines={1} style={styles.mood}>
            {report.recommendedMood}
          </Text>
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
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 10,
  },
  chevronIcon: {
    height: 24,
    position: 'relative',
    width: 18,
  },
  chevronLine: {
    backgroundColor: userPageColors.textSoft,
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
    gap: 7,
    minWidth: 0,
  },
  footer: {
    alignSelf: 'flex-start',
    backgroundColor: userPageColors.surfaceMuted,
    borderRadius: userPageRadius.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  summary: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 19,
  },
  thumbnail: {
    backgroundColor: userPageColors.surfaceMuted,
    borderRadius: 10,
    height: 96,
    width: 82,
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
