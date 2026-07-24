import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  FACE_3D_EXPOSED_METRIC_KEYS,
  type Face3DMetricKey,
  type Face3DReportProfile,
} from '../types';

export const FACE_3D_METRIC_PRESENTATION: Record<
  Face3DMetricKey,
  {description: string; label: string}
> = {
  alarWidth: {
    description: '얼굴 폭을 기준으로 콧볼의 좌우 폭을 확인한 항목이에요.',
    label: '콧볼 폭',
  },
  centralProjectionScore: {
    description: '얼굴 중앙부와 기준면의 앞뒤 관계를 확인한 항목이에요.',
    label: '중앙부 입체감',
  },
  chinProjection: {
    description: '턱의 앞쪽 볼록면과 기준면의 관계를 확인한 항목이에요.',
    label: '턱 전방 돌출',
  },
  lowerLipToELine: {
    description: '아랫입술과 E-line의 앞뒤 관계를 확인한 항목이에요.',
    label: '아랫입술 · E-line',
  },
  malarProjectionLeft: {
    description: '왼쪽 앞광대와 기준면의 앞뒤 관계를 확인한 항목이에요.',
    label: '앞광대 돌출 · 왼쪽',
  },
  malarProjectionRight: {
    description: '오른쪽 앞광대와 기준면의 앞뒤 관계를 확인한 항목이에요.',
    label: '앞광대 돌출 · 오른쪽',
  },
  nasalAxisDeviation: {
    description: '얼굴 중앙선을 기준으로 코축의 방향을 확인한 항목이에요.',
    label: '코축 좌우 치우침',
  },
  nasalBridgeStraightness: {
    description: '코뿌리에서 코끝까지 이어지는 선의 흐름을 확인한 항목이에요.',
    label: '콧대 직선 이탈량',
  },
  noseLength: {
    description: '얼굴 폭을 기준으로 코뿌리–코끝 길이를 확인한 항목이에요.',
    label: '코 길이',
  },
  noseTipProjection: {
    description: '코끝과 얼굴 기준면의 앞뒤 관계를 확인한 항목이에요.',
    label: '코끝 돌출',
  },
  upperLipToELine: {
    description: '윗입술과 E-line의 앞뒤 관계를 확인한 항목이에요.',
    label: '윗입술 · E-line',
  },
};

export function Face3DMetricGrid({profile}: {profile: Face3DReportProfile}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>3D 측정 항목</Text>
        <Text style={styles.sectionCaption}>
          TrueDepth로 확인한 얼굴 입체 측정 항목이에요.
        </Text>
      </View>

      <View style={styles.grid}>
        {FACE_3D_EXPOSED_METRIC_KEYS.map(key => {
          const metric = profile.metrics[key];
          const presentation = FACE_3D_METRIC_PRESENTATION[key];

          // 노출 리스트의 Tier-2 키가 구버전 프레임워크 프로필에는 없을 수 있다
          // (optional 계약) — 그 키만 조용히 건너뛴다.
          if (!metric) {
            return null;
          }

          return (
            <View key={key} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{presentation.label}</Text>
              <Text style={metric.value === null ? styles.metricUnavailable : styles.metricValue}>
                {metric.value === null ? '측정 불가' : '측정 완료'}
              </Text>
              <Text style={styles.metricDescription}>
                {metric.value === null
                  ? '이번 측정에서는 이 값을 계산하지 못했어요.'
                  : presentation.description}
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
  metricDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
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
