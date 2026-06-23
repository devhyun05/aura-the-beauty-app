import {useEffect, useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';

import {getAnalysisResults} from '../../../shared/services/analysisService';
import {spacing} from '../../../shared/theme';
import type {AnalysisResult} from '../../../shared/types/analysis';
import {AppHeader, AppScreen, PagedGrid} from '../../../shared/ui';
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

      <PagedGrid
        data={results}
        keyExtractor={(result) => result.id}
        pageSize={10}
        pageStyle={[styles.grid, {gap: cardGap}]}
        pageWidth={contentWidth}
        renderItem={(result) => (
          <AnalysisResultCard
            onPress={() => onPressResult?.(result.id)}
            result={result}
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
