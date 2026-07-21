import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {
  AppCard,
  ImagePlaceholder,
  ReportOverflowMenuButton,
} from '../../../shared/ui';

type FaceAnalysisReportCardProps = {
  report: FaceAnalysisReport;
  onDelete?: () => Promise<void> | void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const FACE_ANALYSIS_REPORT_CARD_LAYOUT = 'journal-entry' as const;

const formatJournalDate = (dateText: string) => {
  const date = new Date(dateText);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${month}.${day}`;
};

function getReportTags(report: FaceAnalysisReport) {
  // 측정 실패로 personalColor 등이 NULL/미정일 수 있어 null-safe하게 다룬다.
  return [report.personalColor, report.faceShape, report.skinType]
    .map(tag => tag?.trim() ?? '')
    .filter(Boolean)
    .slice(0, 3);
}

export function FaceAnalysisReportCard({
  onDelete,
  onPress,
  report,
  style,
}: FaceAnalysisReportCardProps) {
  const tags = getReportTags(report);

  return (
    <AppCard
      accessibilityLabel={`${report.title} 얼굴 분석 보고서 보기`}
      onPress={onPress}
      padded={false}
      style={[styles.card, style]}>
      <View style={styles.dateColumn}>
        <Text style={styles.dateText}>{formatJournalDate(report.analyzedAt)}</Text>
        <View style={styles.dateDot} />
      </View>

      <View style={styles.thumbnail}>
        <ImagePlaceholder
          borderRadius={radius.md}
          resizeMode="cover"
          source={report.imageSource}
        />
      </View>

      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.title}>
          {report.recommendedMood}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {report.title}
        </Text>
        <View style={styles.tagRow}>
          {tags.map(tag => (
            <Text key={tag} numberOfLines={1} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      </View>

      {onDelete ? <ReportOverflowMenuButton onDelete={onDelete} /> : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 0,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowOpacity: 0,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  dateColumn: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 44,
  },
  dateDot: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 5,
    opacity: 0.38,
    width: 5,
  },
  dateText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  tag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
    maxWidth: 92,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  thumbnail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 64,
    overflow: 'hidden',
    width: 64,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
});
