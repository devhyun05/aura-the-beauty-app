import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {BookmarkCheck, WandSparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisMakeupCard,
  FaceAnalysisReport,
} from '../../../shared/types/faceAnalysis';
import {AppScreen, ImagePlaceholder} from '../../../shared/ui';

type SavedMakeupListScreenProps = {
  latestAnalysisReport?: FaceAnalysisReport | null;
  onApplyMakeup?: (makeup: SavedRecommendedMakeup) => void;
};

type SavedRecommendedMakeup = {
  id: string;
  makeup: FaceAnalysisMakeupCard;
  reportAnalyzedAt: string;
  reportId: string;
  reportMood: string;
  reportTitle: string;
};

const ALL_REPORT_ID = 'all';

export function SavedMakeupListScreen({
  latestAnalysisReport,
  onApplyMakeup,
}: SavedMakeupListScreenProps) {
  const {width} = useWindowDimensions();
  const [reports, setReports] = useState<FaceAnalysisReport[]>(
    latestAnalysisReport ? [latestAnalysisReport] : [],
  );
  const [selectedReportId, setSelectedReportId] = useState(ALL_REPORT_ID);
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  useEffect(() => {
    let isMounted = true;

    getFaceAnalysisReports().then(nextReports => {
      if (!isMounted) {
        return;
      }

      setReports(mergeLatestReportWithReports(latestAnalysisReport, nextReports));
    });

    return () => {
      isMounted = false;
    };
  }, [latestAnalysisReport]);

  const savedMakeups = useMemo(
    () => reports.flatMap(report => mapReportToSavedMakeups(report)),
    [reports],
  );
  const visibleMakeups = useMemo(
    () =>
      selectedReportId === ALL_REPORT_ID
        ? savedMakeups
        : savedMakeups.filter(makeup => makeup.reportId === selectedReportId),
    [savedMakeups, selectedReportId],
  );

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <YStack style={styles.summary}>
        <XStack style={styles.summaryHeader}>
          <View style={styles.summaryIcon}>
            <BookmarkCheck color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </View>
          <YStack style={styles.summaryTextGroup}>
            <Text style={styles.summaryTitle}>추천 메이크업 {savedMakeups.length}개</Text>
            <Text style={styles.summaryDescription}>
              내가 찍은 사진 분석에서 생성된 추천 메이크업만 모았어요.
            </Text>
          </YStack>
        </XStack>
      </YStack>

      <XStack style={styles.reportChipList}>
        <ReportChip
          label="전체"
          onPress={() => setSelectedReportId(ALL_REPORT_ID)}
          selected={selectedReportId === ALL_REPORT_ID}
        />
        {reports.map(report => (
          <ReportChip
            key={report.id}
            label={formatReportChipLabel(report)}
            onPress={() => setSelectedReportId(report.id)}
            selected={selectedReportId === report.id}
          />
        ))}
      </XStack>

      <View style={[styles.grid, {columnGap: gap, rowGap: spacing.xl}]}>
        {visibleMakeups.map(savedMakeup => (
          <SavedMakeupCard
            key={savedMakeup.id}
            savedMakeup={savedMakeup}
            onApplyMakeup={onApplyMakeup}
            width={cardWidth}
          />
        ))}
      </View>
    </AppScreen>
  );
}

function mergeLatestReportWithReports(
  latestReport: FaceAnalysisReport | null | undefined,
  reports: readonly FaceAnalysisReport[],
): FaceAnalysisReport[] {
  if (!latestReport) {
    return [...reports];
  }

  return [
    latestReport,
    ...reports.filter(report => report.id !== latestReport.id),
  ];
}

function mapReportToSavedMakeups(report: FaceAnalysisReport): SavedRecommendedMakeup[] {
  return report.recommendedMakeups.map((makeup, index) => ({
    id: `${report.id}-${makeup.id}-${index}`,
    makeup,
    reportAnalyzedAt: report.analyzedAt,
    reportId: report.id,
    reportMood: report.recommendedMood,
    reportTitle: report.title,
  }));
}

function formatReportChipLabel(report: FaceAnalysisReport): string {
  const date = new Date(report.analyzedAt);

  if (Number.isNaN(date.getTime())) {
    return report.recommendedMood;
  }

  return `${date.getMonth() + 1}.${date.getDate()} ${report.recommendedMood}`;
}

function ReportChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 추천 메이크업 보기`}
      onPress={onPress}
      style={({pressed}) => [
        styles.reportChip,
        selected && styles.reportChipSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.reportChipText, selected && styles.reportChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SavedMakeupCard({
  savedMakeup,
  onApplyMakeup,
  width,
}: {
  savedMakeup: SavedRecommendedMakeup;
  onApplyMakeup?: (makeup: SavedRecommendedMakeup) => void;
  width: number;
}) {
  return (
    <View style={[styles.card, {width}]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder
          borderRadius={radius.md}
          resizeMode="cover"
          source={savedMakeup.makeup.imageSource}
        />
        <XStack style={styles.savedBadge}>
          <Text style={styles.savedBadgeText}>AI 추천</Text>
        </XStack>
      </View>

      <YStack style={styles.textArea}>
        <Text numberOfLines={1} style={styles.title}>
          {savedMakeup.makeup.title}
        </Text>
        <Text numberOfLines={1} style={styles.mood}>
          {savedMakeup.makeup.subtitle || savedMakeup.reportMood}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {savedMakeup.makeup.description}
        </Text>
      </YStack>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${savedMakeup.makeup.title} AR로 적용`}
        onPress={() => onApplyMakeup?.(savedMakeup)}
        style={({pressed}) => [styles.applyButton, pressed && styles.pressed]}>
        <WandSparkles color={colors.white} size={iconSize.xs} strokeWidth={2} />
        <Text style={styles.applyButtonText}>AR 적용</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  applyButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    minHeight: typography.lineHeight.xs * 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  mood: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
  },
  reportChip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reportChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reportChipSelected: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  reportChipText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  reportChipTextSelected: {
    color: colors.white,
  },
  savedBadge: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    left: spacing.sm,
    minHeight: 26,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
    top: spacing.sm,
  },
  savedBadgeText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  summaryDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  summaryTextGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  textArea: {
    gap: spacing.xs,
    minHeight: 92,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
