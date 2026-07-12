import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  FACE_3D_METRIC_KEYS,
  type Face3DMetricKey,
  type Face3DProfile,
} from '../types';

const METRIC_LABELS: Record<Face3DMetricKey, string> = {
  centralProjectionScore: '중앙부 입체감',
  chinProjection: '턱 전방점 돌출',
  lowerLipToELine: '아랫입술 · E-line',
  noseTipProjection: '코끝 돌출',
  upperLipToELine: '윗입술 · E-line',
};

function formatMetricValue(value: number | null): string {
  return value === null ? '측정 불가' : value.toFixed(3);
}

export function Face3DMetricGrid({profile}: {profile: Face3DProfile}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>정규화 3D 지표</Text>
        <Text style={styles.sectionCaption}>기기 거리와 얼굴 크기 영향을 줄인 상대값</Text>
      </View>

      <View style={styles.grid}>
        {FACE_3D_METRIC_KEYS.map(key => {
          const metric = profile.metrics[key];

          return (
            <View key={key} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{METRIC_LABELS[key]}</Text>
              <Text style={metric.value === null ? styles.metricUnavailable : styles.metricValue}>
                {formatMetricValue(metric.value)}
              </Text>
              <Text style={styles.metricMeta}>
                신뢰도 {Math.round(metric.confidence * 100)}% · {metric.validFrameCount}프레임
              </Text>
              <Text style={styles.metricMad}>
                MAD {metric.mad === null ? '—' : metric.mad.toFixed(4)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 148,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  metricMad: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  metricMeta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  metricUnavailable: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  metricValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  section: {
    gap: spacing.md,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
