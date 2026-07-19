import {StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisDerivedResult,
  FaceAnalysisInsight,
  FaceAnalysisMetricEnvelope,
  FaceAnalysisStageStatus,
  FaceAnalysisV2,
} from '../services/faceAnalysisV2';

const stageLabels = [
  ['AI 보완 측정', 'aiMeasurement'],
  ['AI 인상 분석', 'aiPerception'],
  ['맞춤 컨설팅', 'aiConsulting'],
] as const;

const stageStatusLabels: Record<FaceAnalysisStageStatus, string> = {
  pending: '대기', processing: '분석 중', completed: '완료', partial: '일부 완료', failed: '실패',
};

const derivedLabels: Array<[string, keyof Omit<FaceAnalysisDerivedResult, 'rulesVersion'>]> = [
  ['얼굴형', 'faceShape'], ['세로 균형', 'verticalBalance'], ['눈·눈썹', 'eyeBrow'],
  ['홍채 노출', 'irisExposure'], ['컬러 축', 'colorAxes'], ['피부 컬러', 'skinColor'],
  ['코·인중·입술', 'nosePhiltrumLips'], ['좌우 균형', 'asymmetry'],
  ['광대·E-line', 'cheekboneAndEline'],
];

function metricValue(metric: FaceAnalysisMetricEnvelope): string {
  if (typeof metric.value === 'number') {
    return `${Number(metric.value.toFixed(3))}${metric.unit === 'deg' ? '°' : ''}`;
  }
  if (typeof metric.value === 'string') {
    return metric.value;
  }
  return '측정 보류';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function insightAt(value: unknown): FaceAnalysisInsight | null {
  const item = record(value);
  return item && typeof item.label === 'string' && typeof item.description === 'string'
    ? item as FaceAnalysisInsight
    : null;
}

export function FaceAnalysisV2ReportSections({analysis}: {analysis: FaceAnalysisV2}) {
  const aiMetrics = Object.entries(analysis.aiMeasurements).filter(
    ([, metric]) => metric.status === 'estimated',
  );
  const perception = record(analysis.perception);
  const gestalt = record(perception?.gestalt);
  const overallMood = insightAt(gestalt?.overallMood);
  const consulting = record(analysis.consulting);
  const consultingSummary = typeof consulting?.summary === 'string' ? consulting.summary : null;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.eyebrow}>AI ANALYSIS</Text>
        <Text style={styles.title}>
          {analysis.pipeline.overall === 'processing' ? '분석을 더하고 있어요' : '통합 분석 결과'}
        </Text>
      </View>

      <View style={styles.stageCard}>
        {stageLabels.map(([label, key]) => {
          const stage = analysis.pipeline[key];
          return (
            <View key={key} style={styles.stageRow}>
              <Text style={styles.stageLabel}>{label}</Text>
              <Text style={stage.status === 'failed' ? styles.failed : styles.stageStatus}>
                {stageStatusLabels[stage.status]}
              </Text>
            </View>
          );
        })}
      </View>

      {aiMetrics.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>AI 보완 측정</Text>
          <View style={styles.grid}>
            {aiMetrics.map(([key, metric]) => (
              <View key={key} style={styles.metricCard}>
                <Text numberOfLines={2} style={styles.metricKey}>{key}</Text>
                <Text style={styles.metricValue}>{metricValue(metric)}</Text>
                <Text style={styles.confidence}>신뢰도 {Math.round(metric.confidence * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>측정 기반 해석</Text>
        <View style={styles.grid}>
          {derivedLabels.map(([label, key]) => {
            const insight = analysis.derived[key];
            if (!insight) {
              return null;
            }
            return (
              <View key={key} style={styles.insightCard}>
                <Text style={styles.metricKey}>{label}</Text>
                <Text style={styles.insightLabel}>{insight.label}</Text>
                <Text style={styles.description}>{insight.description}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {overallMood ? (
        <View style={styles.summaryCard}>
          <Text style={styles.groupTitle}>AI 인상 분석 · {overallMood.label}</Text>
          <Text style={styles.summaryText}>{overallMood.description}</Text>
        </View>
      ) : null}

      {consultingSummary ? (
        <View style={styles.summaryCard}>
          <Text style={styles.groupTitle}>맞춤 컨설팅</Text>
          <Text style={styles.summaryText}>{consultingSummary}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  confidence: {color: colors.textTertiary, fontSize: typography.fontSize.xs},
  container: {gap: spacing.md},
  description: {color: colors.textSecondary, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  eyebrow: {color: colors.textTertiary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold},
  failed: {color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  group: {gap: spacing.sm},
  groupTitle: {color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold},
  insightCard: {backgroundColor: colors.white, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md, width: '48%'},
  insightLabel: {color: colors.textPrimary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold},
  metricCard: {backgroundColor: colors.white, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md, width: '48%'},
  metricKey: {color: colors.textSecondary, fontSize: typography.fontSize.xs},
  metricValue: {color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold},
  sectionHeader: {gap: spacing.xs},
  stageCard: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md},
  stageLabel: {color: colors.textSecondary, fontSize: typography.fontSize.sm},
  stageRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  stageStatus: {color: colors.textPrimary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold},
  summaryCard: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: spacing.xs, padding: spacing.md},
  summaryText: {color: colors.textSecondary, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  title: {color: colors.textPrimary, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold},
});
