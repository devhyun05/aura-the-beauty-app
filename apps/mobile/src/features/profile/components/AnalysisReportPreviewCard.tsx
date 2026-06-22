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
          <Text style={styles.date}>{report.analyzedAt}</Text>
        </View>

        <Text style={styles.chevron}>&gt;</Text>
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
            <ProfileChip label={report.skinType} />
          </View>

          <Text numberOfLines={2} style={styles.summary}>
            {report.summary}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  chevron: {
    color: userPageColors.accentMuted,
    fontSize: 24,
    lineHeight: 24,
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
