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
    <Pressable onPress={onPress} style={styles.card}>
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
    alignSelf: 'flex-start',
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.chip,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    fontSize: 14,
    lineHeight: 20,
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
