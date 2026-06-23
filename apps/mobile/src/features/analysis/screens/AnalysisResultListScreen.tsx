import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {getAnalysisResults} from '../../../shared/services/analysisService';
import {colors, spacing, typography} from '../../../shared/theme';
import type {AnalysisResult} from '../../../shared/types/analysis';
import {AppHeader, AppScreen, PaginationDots} from '../../../shared/ui';
import {AnalysisResultCard} from '../components/AnalysisResultCard';

type AnalysisResultListScreenProps = {
  onBack?: () => void;
  onPressResult?: (resultId: string) => void;
};

export function AnalysisResultListScreen({
  onBack,
  onPressResult,
}: AnalysisResultListScreenProps) {
  const {width} = useWindowDimensions();
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const cardGap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);

  useEffect(() => {
    let isMounted = true;

    getAnalysisResults().then((nextResults) => {
      if (isMounted) {
        setResults(nextResults);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppScreen contentGap={spacing.xl}>
      <AppHeader onBack={onBack} title="분석 결과" />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>최근 분석 {results.length}개</Text>
        <Text style={styles.sortText}>최신순</Text>
      </View>

      <View style={[styles.grid, {gap: cardGap}]}>
        {results.map((result) => (
          <AnalysisResultCard
            key={result.id}
            onPress={() => onPressResult?.(result.id)}
            result={result}
            style={{width: cardWidth}}
          />
        ))}
      </View>

      <PaginationDots count={3} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sortText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
});
