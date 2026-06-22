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
      <View style={styles.thumbnailFrame}>
        <Image
          resizeMode="cover"
          source={report.imageSource}
          style={styles.thumbnail}
        />
        <View pointerEvents="none" style={styles.faceGuide}>
          <View style={styles.guideDot} />
          <View style={styles.guideDot} />
          <View style={styles.guideDot} />
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.kicker}>맞춤 분석 보고서</Text>
            <Text style={styles.title}>{report.title}</Text>
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
  faceGuide: {
    alignItems: 'center',
    gap: 5,
    left: '50%',
    marginLeft: -3,
    position: 'absolute',
    top: 26,
  },
  footer: {
    alignSelf: 'flex-start',
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.chip,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  guideDot: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.text,
    borderRadius: 4,
    borderWidth: 1,
    height: 6,
    width: 6,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  kicker: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
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
    height: 104,
    width: 86,
  },
  thumbnailFrame: {
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 104,
    overflow: 'hidden',
    position: 'relative',
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
    gap: 2,
    minWidth: 0,
  },
});
