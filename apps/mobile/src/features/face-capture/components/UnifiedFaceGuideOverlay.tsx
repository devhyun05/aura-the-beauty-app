// 통합 촬영 화면용 greenlight 오버레이 — 레거시 CameraFaceCaptureScreen 의
// 타원·중앙 가이드선·얼굴 중앙선·사유 메시지를 픽셀 단위로 재현한다.
// evaluateUnifiedFaceCaptureGreenlight 의 결과만 받아 그리므로 판정 로직은 없다.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, shadows, spacing, typography} from '../../../shared/theme';
import type {FaceEllipseGuideGeometry} from '../constants/faceEllipseGuide';
import {FACE_PITCH_GATE_MESSAGE} from '../services/faceCapturePitchGate';
import type {UnifiedGreenlightEvaluation} from '../services/unifiedFaceCaptureGreenlight';

const CENTERLINE_KEYS = ['forehead', 'noseBridge', 'noseTip', 'chin'] as const;

function resolveMessage(evaluation: UnifiedGreenlightEvaluation): string | null {
  // 레거시 우선순위: 기본 greenlight 미통과 → 그 메시지, 그다음 pitch 미통과 →
  // pitch 메시지. 둘 다 통과면 메시지 없음(초록).
  if (!evaluation.report.finalCaptureGreenlight) {
    return evaluation.report.message;
  }
  if (!evaluation.pitch.pitchOk) {
    return FACE_PITCH_GATE_MESSAGE;
  }
  return null;
}

function faceCenterLineX(evaluation: UnifiedGreenlightEvaluation): number | null {
  const xs = CENTERLINE_KEYS.map(key => evaluation.screenLandmarks[key]?.left).filter(
    (value): value is number => typeof value === 'number',
  );
  if (xs.length !== CENTERLINE_KEYS.length) {
    return null;
  }
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

export function UnifiedFaceGuideOverlay({
  guide,
  evaluation,
  messageBottom,
}: {
  guide: FaceEllipseGuideGeometry;
  evaluation: UnifiedGreenlightEvaluation;
  messageBottom: number;
}) {
  const tint = evaluation.greenlit ? colors.guideReady : colors.danger;
  const guideScaleY = guide.height / guide.width;
  const centerLineX = faceCenterLineX(evaluation);
  const isAligned =
    centerLineX !== null &&
    !evaluation.report.failureReasons.includes('not_centered');
  const message = resolveMessage(evaluation);

  return (
    <>
      {/* 타원 가이드: 정원(width×width)을 scaleY로 늘려 그린다(레거시와 동일). */}
      <View
        pointerEvents="none"
        style={[
          styles.faceGuide,
          {
            borderColor: tint,
            borderRadius: guide.width / 2,
            height: guide.width,
            left: guide.centerX - guide.width / 2,
            top: guide.centerY - guide.width / 2,
            transform: [{scaleY: guideScaleY}],
            width: guide.width,
          },
        ]}
      />

      {/* 정적 중앙 가이드선(목표 중심). */}
      <View
        pointerEvents="none"
        style={[
          styles.guideCenterLine,
          {
            height: guide.height,
            left: guide.centerX - StyleSheet.hairlineWidth,
            top: guide.centerY - guide.height / 2,
          },
        ]}
      />

      {/* 얼굴 실제 중앙선 — 정렬되면 초록, 아니면 빨강. */}
      {centerLineX !== null ? (
        <View
          pointerEvents="none"
          style={[
            styles.faceCenterLine,
            {
              backgroundColor: isAligned ? colors.guideReady : colors.danger,
              height: guide.height,
              left: centerLineX - 1,
              top: guide.centerY - guide.height / 2,
            },
          ]}
        />
      ) : null}

      {/* 사유 메시지 바. */}
      {message ? (
        <View pointerEvents="none" style={[styles.errorBar, {bottom: messageBottom}]}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  errorBar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.danger,
    justifyContent: 'center',
    minHeight: 66,
    paddingHorizontal: spacing.xxl,
    position: 'absolute',
    width: '100%',
  },
  errorText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  faceCenterLine: {
    opacity: 0.85,
    position: 'absolute',
    width: 2,
  },
  faceGuide: {
    alignItems: 'center',
    backgroundColor: colors.guideSurface,
    borderWidth: 5,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: shadows.guideGlow.shadowColor,
    shadowOffset: shadows.guideGlow.shadowOffset,
    shadowOpacity: shadows.guideGlow.shadowOpacity,
    shadowRadius: shadows.guideGlow.shadowRadius,
  },
  guideCenterLine: {
    backgroundColor: colors.white,
    opacity: 0.45,
    position: 'absolute',
    width: StyleSheet.hairlineWidth * 2,
  },
});
