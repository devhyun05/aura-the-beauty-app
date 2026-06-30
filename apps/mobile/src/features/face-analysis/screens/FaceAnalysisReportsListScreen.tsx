import {useEffect, useMemo, useState} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View} from 'tamagui';

import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {colors, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {FaceAnalysisReportCard} from '../components/FaceAnalysisReportCard';

type FaceAnalysisReportsListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
};

const FACE_ANALYSIS_REPORTS_PAGE_SIZE = 4;

export function FaceAnalysisReportsListScreen({
  onPressReport,
}: FaceAnalysisReportsListScreenProps) {
  const {width} = useWindowDimensions();
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

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <View style={styles.pager}>
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
                  onPress={() => onPressReport?.(report.id)}
                  report={report}
                  style={{width: cardWidth}}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        <Text style={styles.paginationText}>
          {displayPage} / {totalPages}
        </Text>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
