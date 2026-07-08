import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {BEARD_TYPE_DISPLAY, REGION_DISPLAY} from '../constants';
import type {BeardAnalysisCard, BeardRegion} from '../types';

function ScoreBar({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, {width: `${Math.round(value * 100)}%`}]} />
      </View>
      <Text style={styles.barValue}>{Math.round(value * 100)}</Text>
    </View>
  );
}

export function AnalysisCard({analysis}: {analysis: BeardAnalysisCard}) {
  const regions = Object.entries(analysis.regionCoverage) as [BeardRegion, number][];
  return (
    <View style={styles.card}>
      <Text style={styles.title}>수염 타입 분석</Text>
      <Text style={styles.type}>{BEARD_TYPE_DISPLAY[analysis.beardType]}</Text>
      <ScoreBar label="밀도" value={analysis.densityScore} />
      <ScoreBar label="그림자" value={analysis.shadowScore} />
      {regions.length ? (
        <Text style={styles.regions}>
          분포:{' '}
          {regions
            .filter(([, coverage]) => coverage > 0.05)
            .map(([region, coverage]) => `${REGION_DISPLAY[region]} ${Math.round(coverage * 100)}%`)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f7f7f9',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  title: {fontSize: 12, color: '#888'},
  type: {fontSize: 17, fontWeight: '700', color: '#1c1c1e'},
  barRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  barLabel: {width: 48, fontSize: 12, color: '#555'},
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e3e3e8',
    overflow: 'hidden',
  },
  barFill: {height: 6, borderRadius: 3, backgroundColor: '#5a67f2'},
  barValue: {width: 28, fontSize: 12, color: '#555', textAlign: 'right'},
  regions: {fontSize: 12, color: '#666', marginTop: 2},
});
