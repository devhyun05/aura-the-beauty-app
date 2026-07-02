import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View} from 'tamagui';

import {
  deleteFaceAnalysisReport,
  getFaceAnalysisReports,
} from '../../../shared/services/faceAnalysisService';
import {colors, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {FaceAnalysisReportCard} from '../components/FaceAnalysisReportCard';

type FaceAnalysisReportsListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
  onPressProducts?: (reportId: string) => void;
};

const FACE_ANALYSIS_REPORTS_PAGE_SIZE = 4;

export function FaceAnalysisReportsListScreen({
  onPressReport,
  onPressProducts,
}: FaceAnalysisReportsListScreenProps) {
  const {width} = useWindowDimensions();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [pendingDeleteReportId, setPendingDeleteReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const cardGap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);
  const pages = useMemo(
    () => chunkItems(reports, FACE_ANALYSIS_REPORTS_PAGE_SIZE),
    [reports],
  );
  const totalPages = Math.max(1, pages.length);
  const displayPage = Math.min(currentPage, totalPages);

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
                    style={{width: cardWidth}}
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

const styles = StyleSheet.create({
  deleteErrorText: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
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
});
