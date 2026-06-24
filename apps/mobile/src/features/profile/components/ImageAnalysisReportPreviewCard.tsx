import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  myPageColors,
  myPageRadius,
  myPageTypography,
} from '../../../shared/theme/tokens';
import {iconSize} from '../../../shared/theme';
import {ChevronRightIcon} from '../../../shared/ui/LineIcons';
import type { ImageAnalysisReportPreview } from '../../../shared/types/myPage';

interface ImageAnalysisReportPreviewCardProps {
  report: ImageAnalysisReportPreview;
  onPress?: () => void;
}

export const IMAGE_ANALYSIS_REPORT_PREVIEW_ACTION_ICON_NAME = 'ChevronRight';

export const ImageAnalysisReportPreviewCard = ({
  report,
  onPress,
}: ImageAnalysisReportPreviewCardProps) => {
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

          <ChevronRightIcon color={myPageColors.textSoft} size={iconSize.sm} />
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: myPageColors.surface,
    borderColor: myPageColors.borderSubtle,
    borderRadius: myPageRadius.image,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 10,
  },
  details: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  footer: {
    alignSelf: 'flex-start',
    backgroundColor: myPageColors.surfaceMuted,
    borderRadius: myPageRadius.chip,
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
    color: myPageColors.textSoft,
    fontSize: myPageTypography.caption,
    lineHeight: 16,
  },
  mood: {
    color: myPageColors.text,
    fontSize: myPageTypography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  summary: {
    color: myPageColors.textMuted,
    fontSize: myPageTypography.body,
    lineHeight: 19,
  },
  thumbnail: {
    backgroundColor: myPageColors.surfaceMuted,
    borderRadius: 10,
    height: 96,
    width: 82,
  },
  title: {
    color: myPageColors.text,
    fontSize: myPageTypography.body,
    fontWeight: '700',
    lineHeight: 21,
  },
  titleGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
});
