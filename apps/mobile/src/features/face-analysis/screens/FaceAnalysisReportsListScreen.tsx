import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {APP_HEADER_BASE_HEIGHT} from '../../../shared/ui/AppHeader';
import {
  deleteFaceAnalysisReport,
  getFaceAnalysisReports,
} from '../../../shared/services/faceAnalysisService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {FaceAnalysisReportCard} from '../components/FaceAnalysisReportCard';

type FaceAnalysisReportsListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
  onPressProducts?: (reportId: string) => void;
};

const FACE_ANALYSIS_REPORTS_PAGE_SIZE = 2;

export function FaceAnalysisReportsListScreen({
  onPressReport,
  onPressProducts,
}: FaceAnalysisReportsListScreenProps) {
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [pendingDeleteReportId, setPendingDeleteReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const cardGap = spacing.lg;
  const contentWidth = width - spacing.screenX * 2;
  const latestReport = reports[0];
  const pages = useMemo(
    () => chunkItems(reports, FACE_ANALYSIS_REPORTS_PAGE_SIZE),
    [reports],
  );
  const totalPages = Math.max(1, pages.length);
  const displayPage = Math.min(currentPage, totalPages);
  const heroTopPadding = APP_HEADER_BASE_HEIGHT + insets.top + spacing.lg;

  useEffect(() => {
    let isMounted = true;

    getFaceAnalysisReports().then((nextReports) => {
      if (isMounted) {
        setReports(nextReports);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / contentWidth) + 1;

    setCurrentPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  const handleDeleteReport = useCallback(async (reportId: string) => {
    setDeleteErrorMessage(null);

    if (pendingDeleteReportId !== reportId) {
      setPendingDeleteReportId(reportId);
      return;
    }

    setDeletingReportId(reportId);

    try {
      await deleteFaceAnalysisReport(reportId);
      setReports((currentReports) =>
        currentReports.filter((report) => report.id !== reportId),
      );
      setPendingDeleteReportId(null);
    } catch (error) {
      console.info('[aura:analysis] report-list:delete-failed', {
        message: error instanceof Error ? error.message : String(error),
        reportId,
      });
      setDeleteErrorMessage('보고서를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setDeletingReportId(null);
    }
  }, [pendingDeleteReportId]);

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <View style={[styles.hero, {paddingTop: heroTopPadding}]}>
        <View style={styles.heroTopRow}>
          <Text style={styles.eyebrow}>REPORT ARCHIVE</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{reports.length}개</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>얼굴 분석 결과</Text>
        <Text style={styles.heroDescription}>
          최근 분석한 얼굴 밸런스와 추천 무드를 모아 보고서처럼 다시 확인해요.
        </Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>최근 분석</Text>
            <Text numberOfLines={1} style={styles.summaryValue}>
              {latestReport ? formatArchiveDate(latestReport.analyzedAt) : '대기 중'}
            </Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>대표 톤</Text>
            <Text numberOfLines={1} style={styles.summaryValue}>
              {latestReport?.personalColor ?? '아직 없음'}
            </Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>페이지</Text>
            <Text style={styles.summaryValue}>
              {displayPage} / {totalPages}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.pager}>
        {pages.length > 0 ? (
          <ScrollView
            bounces={false}
            horizontal
            onMomentumScrollEnd={handleMomentumScrollEnd}
            pagingEnabled
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={{width: contentWidth}}>
            {pages.map((page, pageIndex) => (
              <View
                key={`face-analysis-reports-page-${pageIndex}`}
                style={[styles.grid, {gap: cardGap, width: contentWidth}]}>
                {page.map((report) => (
                  <FaceAnalysisReportCard
                    key={report.id}
                    isDeleteConfirming={pendingDeleteReportId === report.id}
                    isDeleting={deletingReportId === report.id}
                    onDelete={() => {
                      void handleDeleteReport(report.id);
                    }}
                    onPress={() => onPressReport?.(report.id)}
                    onPressProducts={() => onPressProducts?.(report.id)}
                    report={report}
                    style={{width: contentWidth}}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>저장된 얼굴 분석 결과가 없어요.</Text>
          </View>
        )}

        <Text style={styles.paginationText}>
          {displayPage} / {totalPages}
        </Text>
        {deleteErrorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.deleteErrorText}>
            {deleteErrorMessage}
          </Text>
        ) : null}
      </View>
    </AppScreen>
  );
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function formatArchiveDate(dateText: string) {
  const date = new Date(dateText);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${month}.${day}`;
}

const styles = StyleSheet.create({
  countBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing.md,
  },
  countBadgeText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  deleteErrorText: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  grid: {
    flexDirection: 'column',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
    width: '100%',
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  hero: {
    backgroundColor: '#F7F5F1',
    borderRadius: radius.lg,
    gap: spacing.md,
    overflow: 'hidden',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  heroDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    maxWidth: 300,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pager: {
    gap: spacing.md,
  },
  paginationText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  summaryCell: {
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderRadius: radius.md,
    flex: 1,
    gap: 2,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
});
