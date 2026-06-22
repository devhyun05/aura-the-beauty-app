import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
} from '../../../shared/theme/tokens';
import type { AnalysisReportPreview } from '../../../shared/types/userPage';
import { ProfileChip } from './ProfileChip';

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
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>{report.title}</Text>
          <Text numberOfLines={1} style={styles.date}>
            {report.analyzedAt} · {report.environmentLabel}
          </Text>
        </View>

        <ChevronRightIcon />
      </View>

      <View style={styles.content}>
        <Image
          resizeMode="cover"
          source={report.imageSource}
          style={styles.thumbnail}
        />

        <View style={styles.details}>
          <View style={styles.tags}>
            <ProfileChip label={report.personalColor} />
            <ProfileChip label={report.recommendedMood} />
          </View>

          <Text numberOfLines={2} style={styles.summary}>
            {report.summary}
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
    gap: 12,
    padding: 16,
  },
  chevronIcon: {
    height: 24,
    position: 'relative',
    width: 18,
  },
  chevronLine: {
    backgroundColor: userPageColors.accentMuted,
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
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  date: {
    color: userPageColors.textSoft,
    fontSize: 12,
  },
  details: {
    flex: 1,
    gap: 9,
    minWidth: 0,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summary: {
    color: userPageColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumbnail: {
    backgroundColor: userPageColors.background,
    borderRadius: 14,
    height: 74,
    width: 74,
  },
  title: {
    color: userPageColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  titleGroup: {
    flex: 1,
    gap: 4,
  },
});
