import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TYPE_LABEL_KO } from '../services/personalColorCore/constants';
import type { RepeatabilityReport, RepeatabilityVerdict } from '../services/personalColorCore/personalColorRepeatability';
import type { AxisName } from '../types';

const AXIS_KO: Record<AxisName, string> = {
  temperature: '웜/쿨',
  value: '명도',
  chroma: '채도',
  clarity: '맑기',
  contrast: '대비',
};

const VERDICT_META: Record<RepeatabilityVerdict, { label: string; color: string; bg: string }> = {
  pass: { label: '통과 · 재현 안정', color: '#1e7d4f', bg: '#e6f6ec' },
  marginal: { label: '주의 · 부분 안정', color: '#8a6d3b', bg: '#fcf3e0' },
  fail: { label: '실패 · 재현 불안정', color: '#b0342a', bg: '#fbeceb' },
};

const REASON_KO: Record<string, string> = {
  too_few_samples: '표본 부족(2회 이상 필요)',
  low_usable_fraction: '유효 촬영 비율 낮음',
  season_flips: '동일 촬영에서 시즌이 뒤집힘',
  load_bearing_axis_unstable: '핵심 축(웜쿨·명도) 불안정',
  fine_type_flips: '세부 타입이 자주 바뀜',
  axis_moderately_noisy: '축 값이 다소 흔들림',
  insufficient_load_bearing_coverage: '핵심 축 측정 누락 잦음',
  hair_matte_low_hit_rate: '헤어 매트 인식률 낮음',
};

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}
function num(v: number | null): string {
  return v == null ? '—' : v.toFixed(3);
}

export function PersonalColorRepeatabilityReportCard({ report }: { report: RepeatabilityReport }) {
  const meta = VERDICT_META[report.verdict];
  const axisNames: AxisName[] = ['temperature', 'value', 'chroma', 'clarity', 'contrast'];

  return (
    <View style={styles.card}>
      <View style={[styles.verdictBadge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.verdictText, { color: meta.color }]}>{meta.label}</Text>
      </View>

      <Text style={styles.summary}>
        {report.sampleCount}회 촬영 · 유효 {report.usableCount}회 ({pct(report.usableFraction)})
      </Text>

      <View style={styles.metricGrid}>
        <Metric label="타입 흔들림" value={pct(report.topTypeFlipRate)} />
        <Metric label="시즌 흔들림" value={pct(report.seasonFlipRate)} />
        <Metric label="헤어 매트 인식률" value={pct(report.matteHitRate.hair)} />
        <Metric label="피부 매트 인식률" value={pct(report.matteHitRate.skin)} />
      </View>

      {report.modeTopType != null && (
        <Text style={styles.mode}>
          최빈 타입: {TYPE_LABEL_KO[report.modeTopType]}
          {report.distinctTopTypes.length > 1 ? ` (관측 ${report.distinctTopTypes.length}종)` : ''}
        </Text>
      )}

      <Text style={styles.sectionTitle}>축별 재현성 (표준편차 / 범위)</Text>
      {axisNames.map(name => {
        const a = report.axes[name];
        return (
          <View key={name} style={styles.axisRow}>
            <Text style={styles.axisName}>{AXIS_KO[name]}</Text>
            <Text style={styles.axisStat}>σ {num(a.stdev)}</Text>
            <Text style={styles.axisStat}>범위 {num(a.spread)}</Text>
            <Text style={styles.axisCount}>n={a.presentCount}</Text>
          </View>
        );
      })}

      {report.reasons.length > 0 && (
        <View style={styles.reasons}>
          {report.reasons.map(r => (
            <Text key={r} style={styles.reason}>· {REASON_KO[r] ?? r}</Text>
          ))}
        </View>
      )}

      <Text style={styles.footnote}>
        보정 전 참고. 시즌이 뒤집히면(fail) ROI·조명·lock부터 점검하세요.
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 12 },
  verdictBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  verdictText: { fontSize: 15, fontWeight: '700' },
  summary: { fontSize: 14, color: '#444' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { minWidth: '45%', flexGrow: 1, backgroundColor: '#f6f7f9', borderRadius: 10, padding: 12 },
  metricValue: { fontSize: 20, fontWeight: '700', color: '#222' },
  metricLabel: { fontSize: 12, color: '#777', marginTop: 2 },
  mode: { fontSize: 14, color: '#333' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  axisName: { width: 56, fontSize: 13, color: '#555' },
  axisStat: { fontSize: 13, color: '#333', minWidth: 78 },
  axisCount: { fontSize: 12, color: '#aaa' },
  reasons: { backgroundColor: '#faf9f7', borderRadius: 10, padding: 12, gap: 4 },
  reason: { fontSize: 13, color: '#8a6d3b' },
  footnote: { fontSize: 11, color: '#aaa', marginTop: 4 },
});
