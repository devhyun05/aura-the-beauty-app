import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';

import {getImageAnalysisReports} from '../../../shared/services/imageAnalysisService';
import {spacing} from '../../../shared/theme';
import type {ImageAnalysisReport} from '../../../shared/types/imageAnalysis';
import {AppHeader, AppScreen, PagedGrid} from '../../../shared/ui';
import {ImageAnalysisReportCard} from '../components/ImageAnalysisReportCard';

type ImageAnalysisReportsListScreenProps = {
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
};

export function ImageAnalysisReportsListScreen({
  onBack,
  onPressReport,
}: ImageAnalysisReportsListScreenProps) {
  const {width} = useWindowDimensions();
  const [reports, setReports] = useState<ImageAnalysisReport[]>([]);
  const cardGap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);

  useEffect(() => {
    let isMounted = true;

    getImageAnalysisReports().then((nextReports) => {
      if (isMounted) {
        setReports(nextReports);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppScreen contentGap={spacing.xl}>
      <AppHeader onBack={onBack} title="이미지 분석 결과" />

      <PagedGrid
        data={reports}
        keyExtractor={(report) => report.id}
        pageSize={10}
        pageStyle={[styles.grid, {gap: cardGap}]}
        pageWidth={contentWidth}
        renderItem={(report) => (
          <ImageAnalysisReportCard
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
