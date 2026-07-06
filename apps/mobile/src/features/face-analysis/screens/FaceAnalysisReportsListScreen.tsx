import {useEffect, useState} from 'react';
import {StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {FaceAnalysisReportCard} from '../components/FaceAnalysisReportCard';

type FaceAnalysisReportsListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onPressReport?: (reportId: string) => void;
};

export function FaceAnalysisReportsListScreen({
  onPressReport,
}: FaceAnalysisReportsListScreenProps) {
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);

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
    <AppScreen contentGap={spacing.xl} topPadding="belowOverlayHeader">
      <View style={styles.list}>
        {reports.length > 0 ? (
          reports.map((report) => (
            <FaceAnalysisReportCard
              key={report.id}
              onPress={() => onPressReport?.(report.id)}
              report={report}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>저장된 얼굴 분석 결과가 없어요.</Text>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
  list: {
    gap: spacing.sm,
  },
});
