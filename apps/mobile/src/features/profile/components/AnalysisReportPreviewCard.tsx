import { Pressable, StyleSheet } from 'react-native';
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

      <View style={styles.tags}>
        <ProfileChip label={report.personalColor} />
        <ProfileChip label={report.skinType} />
      </View>

      <Text style={styles.summary}>{report.summary}</Text>
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
  date: {
    color: userPageColors.textSoft,
    fontSize: 12,
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
