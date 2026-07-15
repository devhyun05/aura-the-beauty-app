import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  FACE_3D_EXPOSED_METRIC_KEYS,
  type Face3DMetricKey,
  type Face3DProfile,
} from '../types';

export const FACE_3D_METRIC_PRESENTATION: Record<
  Face3DMetricKey,
  {description: string; label: string}
> = {
  alarWidth: {
    description: '값이 클수록 얼굴 폭에 비해 콧볼 좌우 폭이 넓어요.',
    label: '콧볼 폭',
  },
  centralProjectionScore: {
    description: '값이 클수록 얼굴 중앙부가 기준면보다 앞으로 나와 있어요.',
    label: '중앙부 입체감',
  },
  chinProjection: {
    description: '값이 클수록 턱의 앞쪽 볼록면이 기준면보다 앞으로 나와 있어요.',
    label: '턱 전방 돌출',
  },
  lowerLipToELine: {
    description: '0은 E-line 부근, 양수는 앞쪽, 음수는 뒤쪽을 뜻해요.',
    label: '아랫입술 · E-line',
  },
  malarProjectionLeft: {
    description: '값이 클수록 왼쪽 앞광대가 기준면보다 더 앞으로 나와 있어요.',
    label: '앞광대 돌출 · 왼쪽',
  },
  malarProjectionRight: {
    description: '값이 클수록 오른쪽 앞광대가 기준면보다 더 앞으로 나와 있어요.',
    label: '앞광대 돌출 · 오른쪽',
  },
  nasalAxisDeviation: {
    description: '0은 중앙, 음수는 내 왼쪽, 양수는 내 오른쪽 방향이에요.',
    label: '코축 좌우 치우침',
  },
  nasalBridgeStraightness: {
    description: '값이 작을수록 코뿌리–코끝 기준선에 더 가까워요.',
    label: '콧대 직선 이탈량',
  },
  noseLength: {
    description: '값이 클수록 얼굴 폭에 비해 코뿌리–코끝 길이가 길어요.',
    label: '코 길이',
  },
  noseTipProjection: {
    description: '값이 클수록 코끝이 얼굴 기준면보다 앞으로 나와 있어요.',
    label: '코끝 돌출',
  },
  upperLipToELine: {
    description: '0은 E-line 부근, 양수는 앞쪽, 음수는 뒤쪽을 뜻해요.',
    label: '윗입술 · E-line',
  },
};

function formatMetricValue(value: number | null): string {
  return value === null ? '측정 불가' : value.toFixed(3);
}

export function Face3DMetricGrid({profile}: {profile: Face3DProfile}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>정규화 3D 지표</Text>
        <Text style={styles.sectionCaption}>
          얼굴 크기로 나눈 상대값이에요. 절대 mm나 의학적 진단값은 아니에요.
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
                {formatMetricValue(metric.value)}
              </Text>
              <Text style={styles.metricDescription}>
                {metric.value === null
                  ? '이번 측정에서는 이 값을 계산하지 못했어요.'
                  : presentation.description}
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
  metricDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
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
