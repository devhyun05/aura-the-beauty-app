import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';

import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {spacing} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen, PagedGrid} from '../../../shared/ui';
import {FaceAnalysisReportCard} from '../components/FaceAnalysisReportCard';

type FaceAnalysisReportsListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
};

export function FaceAnalysisReportsListScreen({
  onPressReport,
}: FaceAnalysisReportsListScreenProps) {
  const {width} = useWindowDimensions();
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const cardGap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);

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

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <PagedGrid
        data={reports}
        keyExtractor={(report) => report.id}
        pageSize={10}
        pageStyle={[styles.grid, {gap: cardGap}]}
        pageWidth={contentWidth}
        renderItem={(report) => (
          <FaceAnalysisReportCard
            onPress={() => onPressReport?.(report.id)}
            report={report}
            style={{width: cardWidth}}
          />
        )}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
