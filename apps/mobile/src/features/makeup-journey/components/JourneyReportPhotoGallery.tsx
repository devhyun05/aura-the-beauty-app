import {useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {ArrowUpRight, ImageOff} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyReport} from '../types';

export type JourneyReportPhotoGalleryProps = {
  onOpenReport: (reportId: string) => void;
  reports: MakeupJourneyReport[];
};

function getReportLabel(report: MakeupJourneyReport, index: number): string {
  return report.feedbackKind === 'initial' ? '최초 피드백' : `수정 피드백 ${index}`;
}

function ReportPhoto({
  index,
  onOpenReport,
  report,
  total,
  width,
}: {
  index: number;
  onOpenReport: (reportId: string) => void;
  report: MakeupJourneyReport & {imageUrl: string};
  total: number;
  width: number;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const label = getReportLabel(report, index);

  return (
    <Pressable
      accessibilityLabel={`${label} 사진, ${report.score}점, 전체 보고서 보기`}
      accessibilityRole="button"
      onPress={() => onOpenReport(report.reportId)}
      style={({pressed}) => [styles.photoItem, {width}, pressed ? styles.pressed : null]}>
      <View style={styles.photoFrame}>
        {hasError ? (
          <View style={styles.photoFallback}>
            <ImageOff color={colors.textTertiary} size={28} />
            <Text style={styles.photoFallbackText}>사진을 불러오지 못했어요.</Text>
          </View>
        ) : (
          <>
            <Image
              accessibilityIgnoresInvertColors
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
              onLoadEnd={() => setIsLoading(false)}
              resizeMode="cover"
              source={{uri: report.imageUrl}}
              style={styles.photo}
            />
            {isLoading ? (
              <View style={styles.photoLoading}>
                <ActivityIndicator color={colors.textPrimary} />
              </View>
            ) : null}
          </>
        )}
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{index + 1} / {total}</Text>
        </View>
        <View style={styles.photoMeta}>
          <View style={styles.photoMetaText}>
            <Text style={styles.photoLabel}>{label}</Text>
            <Text style={styles.photoScore}>{report.score}점</Text>
          </View>
          <View style={styles.openIcon}>
            <ArrowUpRight color={colors.white} size={20} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function JourneyReportPhotoGallery({
  onOpenReport,
  reports,
}: JourneyReportPhotoGalleryProps) {
  const {width: windowWidth} = useWindowDimensions();
  const photoWidth = Math.max(280, windowWidth - spacing.screenX * 2);
  const reportsWithImages = reports.filter(
    (report): report is MakeupJourneyReport & {imageUrl: string} =>
      typeof report.imageUrl === 'string' && report.imageUrl.length > 0,
  );

  if (reportsWithImages.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.eyebrow}>오늘의 메이크업</Text>
          <Text style={styles.reportCount}>{reportsWithImages.length}개의 기록</Text>
        </View>
        <Text style={styles.description}>사진을 누르면 자세한 AI 분석 보고서를 볼 수 있어요.</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.photoList}
        decelerationRate="fast"
        horizontal
        pagingEnabled
        snapToInterval={photoWidth + spacing.md}
        showsHorizontalScrollIndicator={false}>
        {reportsWithImages.map((report, index) => (
          <ReportPhoto
            index={index}
            key={report.reportId}
            onOpenReport={onOpenReport}
            report={report}
            total={reportsWithImages.length}
            width={photoWidth}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  countBadge: {
    backgroundColor: 'rgba(17, 17, 17, 0.56)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
  },
  countBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  header: {
    gap: spacing.xs,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  photoFallback: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  photoFallbackText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  photoFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    height: 438,
    overflow: 'hidden',
  },
  photoItem: {
    flexShrink: 0,
  },
  photoLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  photoList: {
    gap: spacing.md,
  },
  photoLoading: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  photoMeta: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.66)',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: 'absolute',
    right: 0,
  },
  photoScore: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  photoMetaText: {
    gap: 2,
  },
  openIcon: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.36)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: {
    opacity: 0.72,
  },
  reportCount: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  section: {
    gap: spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
