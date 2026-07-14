import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceGeometryResult} from '../../face-geometry/types';
import {FACE_GEOMETRY_METRIC_KEYS} from '../../face-geometry/types';
import type {FaceVerticalThirdsResult} from '../../face-ratio/types';
import {TYPE_LABEL_KO} from '../../personal-color/services/personalColorCore/constants';
import type {PersonalColor12Type} from '../../personal-color/services/personalColorCore/contracts';
import type {IlluminationCorrectionReport} from '../../personal-color/services/personalColorCore/illuminationCorrection';
import type {PersonalColorCorrectionStatus} from '../../personal-color/types';
import type {MeasuredPersonalColorView} from '../services/faceAnalysisMeasurements';

// 측정 데이터 3-반영 규칙의 "표시" 축 — 요약 카드(세로비율 오버레이·3D 그리드·
// 퍼스널컬러 카드)가 보여주지 않는 나머지 실측 수치 전부를 접기식으로 노출한다.
// 3D 11지표는 Face3DMetricGrid 가 value·신뢰도·MAD·프레임을 이미 전량 표시하므로
// 여기서 중복하지 않는다.

type MeasurementRow = {label: string; value: string};

type MeasurementGroup = {caption?: string; rows: MeasurementRow[]; title: string};

function formatNumber(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? '—' : value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

function buildVerticalThirdsRows(result: FaceVerticalThirdsResult): MeasurementRow[] {
  const rows: MeasurementRow[] = [];
  const ratio = result.verticalThirds;

  if (ratio) {
    rows.push({
      label: '상·중·하 표시 비율',
      value: `${formatNumber(ratio.displayRatio.upper, 2)} : ${formatNumber(
        ratio.displayRatio.middle,
        2,
      )} : ${formatNumber(ratio.displayRatio.lower, 2)}`,
    });
    rows.push({
      label: '상안부',
      value: `${formatNumber(ratio.upperPx, 0)}px · ${formatPercent(ratio.upperNormalized)}`,
    });
    rows.push({
      label: '중안부',
      value: `${formatNumber(ratio.middlePx, 0)}px · ${formatPercent(ratio.middleNormalized)}`,
    });
    rows.push({
      label: '하안부',
      value: `${formatNumber(ratio.lowerPx, 0)}px · ${formatPercent(ratio.lowerNormalized)}`,
    });
    rows.push({label: '측정 신뢰도', value: formatPercent(ratio.confidence)});
  }

  if (result.faceLength) {
    rows.push({
      label: '세로/가로 비율',
      value: `${formatNumber(result.faceLength.ratio, 3)} (${formatNumber(
        result.faceLength.heightPx,
        0,
      )}px / ${formatNumber(result.faceLength.widthPx, 0)}px)`,
    });
  }

  rows.push({
    label: '촬영 자세 yaw/pitch/roll',
    value: `${formatNumber(result.quality.yaw, 1)}° / ${formatNumber(
      result.quality.pitch,
      1,
    )}° / ${formatNumber(result.quality.roll, 1)}°`,
  });

  if (result.postCorrection) {
    rows.push({
      label: '기울기 보정',
      value: result.postCorrection.applied
        ? `적용 (${formatNumber(result.postCorrection.rollCorrectionDeg, 2)}°)`
        : `미적용 (${result.postCorrection.skippedReason ?? '사유 없음'})`,
    });
  }

  const hairline = result.keypoints.H;
  if (hairline) {
    rows.push({
      label: '헤어라인 기준점',
      value: `${hairline.provider} · 신뢰도 ${formatPercent(hairline.confidence)}`,
    });
  }

  if (result.statusReason) {
    rows.push({label: '상태 사유', value: result.statusReason});
  }

  return rows;
}

function buildGeometryRows(result: FaceGeometryResult): MeasurementRow[] {
  const rows: MeasurementRow[] = [];

  if (result.pose) {
    rows.push({
      label: '촬영 자세 yaw/pitch/roll',
      value: `${formatNumber(result.pose.yawDeg, 1)}° / ${formatNumber(
        result.pose.pitchDeg,
        1,
      )}° / ${formatNumber(result.pose.rollDeg, 1)}°`,
    });
  }

  rows.push({
    label: '기울기 보정',
    value: result.rollCorrection.applied
      ? `적용 (${formatNumber(result.rollCorrection.rollCorrectionDeg, 2)}°)`
      : `미적용 (${result.rollCorrection.skippedReason ?? '사유 없음'})`,
  });

  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    const metric = result.metrics[key];
    if (metric.warnings.length > 0) {
      rows.push({label: `${key} 경고`, value: metric.warnings.join(', ')});
    }
  }

  if (result.statusReason) {
    rows.push({label: '상태 사유', value: result.statusReason});
  }

  return rows;
}

function buildPersonalColorRows(
  reported: MeasuredPersonalColorView,
  correction: PersonalColorCorrectionStatus | null,
  correctionReport: IlluminationCorrectionReport | null,
): MeasurementRow[] {
  const rows: MeasurementRow[] = [];
  const axisLabels: Array<[keyof MeasuredPersonalColorView['axes'], string]> = [
    ['temperature', '온도(쿨↔웜)'],
    ['value', '명도(라이트↔딥)'],
    ['chroma', '채도(뮤트↔비비드)'],
    ['clarity', '청탁(소프트↔클리어)'],
    ['contrast', '대비(저↔고)'],
  ];

  for (const [axis, label] of axisLabels) {
    const value = reported.axes[axis];
    rows.push({
      label,
      value: `${formatNumber(value.value, 2)} · 신뢰도 ${formatPercent(value.confidence)}`,
    });
  }

  rows.push({
    label: '피부-헤어 명도차/색차',
    value: `${formatNumber(reported.relations.dL_skinHair, 1)} / ${formatNumber(
      reported.relations.dE00_skinHair,
      1,
    )}`,
  });
  rows.push({
    label: '피부-입술 명도차/색차',
    value: `${formatNumber(reported.relations.dL_skinLip, 1)} / ${formatNumber(
      reported.relations.dE00_skinLip,
      1,
    )}`,
  });

  for (const region of reported.regions) {
    rows.push({
      label: `${region.region} Lab·LCh`,
      value: `L ${formatNumber(region.lab.L, 1)} a ${formatNumber(
        region.lab.a,
        1,
      )} b ${formatNumber(region.lab.b, 1)} · C ${formatNumber(
        region.lch.C,
        1,
      )} h ${formatNumber(region.lch.h, 0)}`,
    });
  }

  rows.push({
    label: '측정 신뢰도',
    value: formatPercent(reported.measurementConfidence),
  });

  if (reported.tone) {
    const tone = reported.tone;
    for (const type of Object.keys(TYPE_LABEL_KO) as PersonalColor12Type[]) {
      rows.push({
        label: TYPE_LABEL_KO[type],
        value: `확률 ${formatPercent(tone.probabilities[type])} · 거리 ${formatNumber(
          tone.distances[type],
          2,
        )}`,
      });
    }
  }

  if (correction) {
    rows.push({label: '조명 보정', value: correction.applied ? '적용' : '미적용'});
  }

  if (correctionReport) {
    rows.push({
      label: '보정 소스·강도·신뢰도',
      value: `${correctionReport.source} · ${formatNumber(
        correctionReport.strength,
        3,
      )} · ${formatPercent(correctionReport.confidence)}`,
    });

    if (correctionReport.gains) {
      rows.push({
        label: '보정 게인 R/G/B',
        value: `${formatNumber(correctionReport.gains.r, 3)} / ${formatNumber(
          correctionReport.gains.g,
          3,
        )} / ${formatNumber(correctionReport.gains.b, 3)}`,
      });
    }

    if (correctionReport.sclera.available) {
      rows.push({
        label: '흰자 실측',
        value: `눈 ${correctionReport.sclera.eyesUsed}개 · 표본 ${
          correctionReport.sclera.sampleCount
        } · 좌우차 ${formatNumber(correctionReport.sclera.leftRightAgreement, 3)}`,
      });
      if (correctionReport.sclera.measuredLab) {
        rows.push({
          label: '흰자 Lab',
          value: `L ${formatNumber(correctionReport.sclera.measuredLab.L, 1)} a ${formatNumber(
            correctionReport.sclera.measuredLab.a,
            1,
          )} b ${formatNumber(correctionReport.sclera.measuredLab.b, 1)}`,
        });
      }
    }

    if (correctionReport.wb.available) {
      rows.push({
        label: 'WB 비율 R/G · B/G',
        value: `${formatNumber(correctionReport.wb.rg, 3)} · ${formatNumber(
          correctionReport.wb.bg,
          3,
        )}`,
      });
    }
  }

  if (reported.warnings.length > 0) {
    rows.push({label: '경고', value: reported.warnings.join(', ')});
  }

  return rows;
}

export function MeasurementDetailSection({
  faceGeometry2d,
  personalColor,
  personalColorCorrection,
  personalColorCorrectionReport,
  verticalThirds,
}: {
  faceGeometry2d: FaceGeometryResult | null;
  personalColor: MeasuredPersonalColorView | null;
  personalColorCorrection: PersonalColorCorrectionStatus | null;
  personalColorCorrectionReport: IlluminationCorrectionReport | null;
  verticalThirds: FaceVerticalThirdsResult | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const groups: MeasurementGroup[] = [];

  if (verticalThirds) {
    groups.push({rows: buildVerticalThirdsRows(verticalThirds), title: '세로 3분할·비율'});
  }

  if (faceGeometry2d) {
    groups.push({rows: buildGeometryRows(faceGeometry2d), title: '2D 기하 측정 품질'});
  }

  if (personalColor) {
    groups.push({
      caption:
        '기기 상대 색 프레임 기준 수치예요 — 절대 색상 진단이 아니라 촬영 프레임 안에서의 상대값이에요.',
      rows: buildPersonalColorRows(
        personalColor,
        personalColorCorrection,
        personalColorCorrectionReport,
      ),
      title: '퍼스널 컬러 실측값',
    });
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel="측정 상세 수치 펼치기"
        accessibilityRole="button"
        onPress={() => setExpanded(current => !current)}
        style={styles.toggle}>
        <Text style={styles.toggleLabel}>측정 상세 수치</Text>
        <Text style={styles.toggleIndicator}>{expanded ? '접기' : '펼치기'}</Text>
      </Pressable>

      {expanded
        ? groups.map(group => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {group.caption ? (
                <Text style={styles.groupCaption}>{group.caption}</Text>
              ) : null}
              {group.rows.map(row => (
                <View key={`${group.title}-${row.label}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text selectable style={styles.rowValue}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  group: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  groupCaption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  groupTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  rowValue: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'right',
  },
  toggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toggleIndicator: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
