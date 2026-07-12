// 조명 보정 실험 A/B 비교 카드 — baseline(기존)과 corrected(흰자/WB 보정)를 나란히.
// 실험 레이어: 효과가 실측으로 입증되기 전까지 참고용으로만 병기한다.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TYPE_LABEL_KO } from '../services/personalColorCore/constants';
import type { IlluminationCorrectionReport } from '../services/personalColorCore/illuminationCorrection';
import type { AuraPersonalColorResult, AxisName } from '../types';

const AXIS_KO: Record<AxisName, string> = {
  temperature: '웜/쿨',
  value: '명도',
  chroma: '채도',
  clarity: '맑기',
  contrast: '대비',
};
const AXIS_NAMES: AxisName[] = ['temperature', 'value', 'chroma', 'clarity', 'contrast'];

const SOURCE_KO: Record<IlluminationCorrectionReport['source'], string> = {
  sclera: '흰자 기준',
  wb: 'WB 잔여 보정',
  none: '—',
};

function signed(v: number | null): string {
  return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

type Props = {
  baseline: AuraPersonalColorResult;
  corrected: AuraPersonalColorResult;
  report: IlluminationCorrectionReport;
};

export function PersonalColorCorrectionCompareCard({ baseline, corrected, report }: Props) {
  const baseTop = baseline.tone?.top ?? null;
  const corrTop = corrected.tone?.top ?? null;
  const same = baseTop === corrTop;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>조명 보정 실험 (A/B)</Text>
        <View style={[styles.badge, same ? styles.badgeSame : styles.badgeDiff]}>
          <Text style={[styles.badgeText, same ? styles.badgeTextSame : styles.badgeTextDiff]}>
            {same ? '타입 동일' : '타입 변경'}
          </Text>
        </View>
      </View>

      <Text style={styles.meta}>
        {SOURCE_KO[report.source]} · 신뢰도 {Math.round(report.confidence * 100)}% · 캐스트 크기{' '}
        {report.strength.toFixed(2)}
        {report.capped ? ' (캡 적용)' : ''}
      </Text>
      {report.sclera.measuredLab && (
        <Text style={styles.meta}>
          실측 흰자 a* {report.sclera.measuredLab.a.toFixed(1)} · b*{' '}
          {report.sclera.measuredLab.b.toFixed(1)} (기준 +1.5/+6.0 — a*가 크게 붉으면 오염/충혈
          의심)
        </Text>
      )}

      <View style={styles.toneRow}>
        <View style={styles.toneCol}>
          <Text style={styles.toneLabel}>기존</Text>
          <Text style={styles.toneValue}>{baseTop ? TYPE_LABEL_KO[baseTop] : '판정 불가'}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.toneCol}>
          <Text style={styles.toneLabel}>보정 후</Text>
          <Text style={styles.toneValue}>{corrTop ? TYPE_LABEL_KO[corrTop] : '판정 불가'}</Text>
        </View>
      </View>

      <View style={styles.axisHeader}>
        <Text style={styles.axisName} />
        <Text style={styles.axisColLabel}>기존</Text>
        <Text style={styles.axisColLabel}>보정</Text>
        <Text style={styles.axisColLabel}>Δ</Text>
      </View>
      {AXIS_NAMES.map(name => {
        const b = baseline.axes[name].value;
        const c = corrected.axes[name].value;
        const delta = b != null && c != null ? c - b : null;
        return (
          <View key={name} style={styles.axisRow}>
            <Text style={styles.axisName}>{AXIS_KO[name]}</Text>
            <Text style={styles.axisVal}>{signed(b)}</Text>
            <Text style={styles.axisVal}>{signed(c)}</Text>
            <Text style={[styles.axisDelta, delta != null && Math.abs(delta) >= 0.1 && styles.axisDeltaBig]}>
              {signed(delta)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.footnote}>
        실험 기능 — 흰자/WB 기반 캐스트 보정. 효과 검증 전이라 기존 결과가 기준입니다. 같은
        촬영에서의 Δ는 개선의 증거가 아니며, 조명을 바꾼 반복 촬영의 재현성으로만 검증됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeSame: { backgroundColor: '#eef1f5' },
  badgeDiff: { backgroundColor: '#fcf3e0' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextSame: { color: '#667' },
  badgeTextDiff: { color: '#8a6d3b' },
  meta: { fontSize: 12, color: '#888' },
  toneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toneCol: { flex: 1 },
  toneLabel: { fontSize: 11, color: '#999' },
  toneValue: { fontSize: 15, fontWeight: '700', color: '#222', marginTop: 2 },
  arrow: { fontSize: 16, color: '#bbb' },
  axisHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  axisColLabel: { width: 56, fontSize: 11, color: '#aaa', textAlign: 'right' },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  axisName: { width: 48, fontSize: 13, color: '#555' },
  axisVal: { width: 56, fontSize: 13, color: '#333', textAlign: 'right' },
  axisDelta: { width: 56, fontSize: 13, color: '#aaa', textAlign: 'right' },
  // 강조는 하되 오류/실패의 빨간색은 쓰지 않는다 — Δ 크기는 판정이 아니라 관찰값.
  axisDeltaBig: { color: '#445', fontWeight: '600' },
  footnote: { fontSize: 11, color: '#aaa', marginTop: 4 },
});
