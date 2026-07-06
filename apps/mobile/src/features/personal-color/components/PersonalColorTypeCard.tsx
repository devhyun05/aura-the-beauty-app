import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TYPE_LABEL_KO } from '../services/personalColorCore/constants';
import type { AuraPersonalColorResult, AxisName } from '../types';

const AXIS_LABELS: Record<AxisName, [string, string]> = {
  temperature: ['쿨', '웜'],
  value: ['라이트', '딥'],
  chroma: ['뮤트', '비비드'],
  clarity: ['소프트', '클리어'],
  contrast: ['저대비', '고대비'],
};

const STATUS_KO: Record<AuraPersonalColorResult['status'], string> = {
  definitive: '확정',
  mixed: '걸침(혼합)',
  provisional: '참고(보정 전)',
  insufficient: '판정 불가',
};

function AxisBar({ name, value }: { name: AxisName; value: number | null }) {
  const [lo, hi] = AXIS_LABELS[name];
  const pct = value == null ? 0 : Math.round(((value + 1) / 2) * 100);
  return (
    <View style={styles.axisRow}>
      <Text style={styles.axisEnd}>{lo}</Text>
      <View style={styles.axisTrack}>
        <View style={styles.axisCenterMark} />
        {value != null && (
          <View style={[styles.axisDot, { left: `${pct}%` }]} />
        )}
        {value == null && <Text style={styles.axisNull}>측정 불가</Text>}
      </View>
      <Text style={styles.axisEnd}>{hi}</Text>
    </View>
  );
}

export function PersonalColorTypeCard({ result }: { result: AuraPersonalColorResult }) {
  const { tone, status, measurementConfidence } = result;
  const confidencePct = Math.round(measurementConfidence * 100);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.headline}>
          {tone ? TYPE_LABEL_KO[tone.top] : '판정 불가'}
        </Text>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>{STATUS_KO[status]}</Text>
        </View>
      </View>

      {tone?.secondary && (
        <Text style={styles.secondary}>
          {tone.isMixed ? '걸친 톤: ' : '가까운 톤: '}
          {TYPE_LABEL_KO[tone.secondary]}
        </Text>
      )}

      {result.preCalibrationHedge && tone && (
        <Text style={styles.hedge}>보정 전 참고용 결과예요. 조명에 따라 달라질 수 있어요.</Text>
      )}

      <Text style={styles.confidence}>측정 신뢰도 {confidencePct}%</Text>

      <View style={styles.axes}>
        {(Object.keys(AXIS_LABELS) as AxisName[]).map(name => (
          <AxisBar key={name} name={name} value={result.axes[name].value} />
        ))}
      </View>

      {result.palette.best.length > 0 && (
        <View style={styles.paletteBlock}>
          <Text style={styles.paletteTitle}>잘 어울리는 색 계열</Text>
          <View style={styles.chipRow}>
            {result.palette.best.slice(0, 4).map(item => (
              <View key={item.family.id} style={styles.bestChip}>
                <Text style={styles.chipText}>{item.family.labelKo}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {result.palette.worst.length > 0 && (
        <View style={styles.paletteBlock}>
          <Text style={styles.paletteTitle}>포인트로 쓰면 좋은 색 계열</Text>
          <View style={styles.chipRow}>
            {result.palette.worst.slice(0, 3).map(item => (
              <View key={item.family.id} style={styles.worstChip}>
                <Text style={styles.chipText}>{item.family.labelKo}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {result.warnings.length > 0 && (
        <Text style={styles.warnings}>참고: {result.warnings.join(', ')}</Text>
      )}

      <Text style={styles.footnote}>
        기기 내 분석 · 절대 색이 아닌 한 장면 내 상대 측정 기준
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headline: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' },
  statusChip: { backgroundColor: '#eef0f4', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusChipText: { fontSize: 12, color: '#555' },
  secondary: { fontSize: 15, color: '#444' },
  hedge: { fontSize: 13, color: '#8a6d3b', backgroundColor: '#fcf6e6', padding: 8, borderRadius: 8 },
  confidence: { fontSize: 13, color: '#666' },
  axes: { gap: 10, marginTop: 4 },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  axisEnd: { width: 48, fontSize: 12, color: '#777', textAlign: 'center' },
  axisTrack: { flex: 1, height: 20, backgroundColor: '#f1f2f5', borderRadius: 10, justifyContent: 'center' },
  axisCenterMark: { position: 'absolute', left: '50%', width: 1, height: 20, backgroundColor: '#d0d3da' },
  axisDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#3a6df0', marginLeft: -6, top: 4 },
  axisNull: { textAlign: 'center', fontSize: 11, color: '#aaa' },
  paletteBlock: { gap: 6 },
  paletteTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bestChip: { backgroundColor: '#e7f0ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  worstChip: { backgroundColor: '#f3eef7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, color: '#333' },
  warnings: { fontSize: 12, color: '#999' },
  footnote: { fontSize: 11, color: '#aaa', marginTop: 4 },
});
