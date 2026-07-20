import type {
  FaceGeometryMetricKey,
  FaceGeometryMetricUnit,
  FaceGeometryResult,
} from '../types';
import {FACE_GEOMETRY_METRIC_KEYS} from '../types';

// 보고서 작성 AI(requestPayload.faceGeometry2d)로 보내는 요약.
// 측정 데이터 3-반영 규칙: 18키 전량(미산출 지표도 null+warnings로), pose,
// roll 보정 상세, statusReason까지 싣는다. raw 랜드마크 좌표는 보내지 않는다.
export type FaceGeometryAnalysisPayload = {
  metrics: Record<
    FaceGeometryMetricKey,
    {unit: FaceGeometryMetricUnit; value: number | null; warnings: string[]}
  >;
  pose: {pitchDeg: number; rollDeg: number; yawDeg: number} | null;
  rollCorrection: {
    applied: boolean;
    rollCorrectionDeg: number | null;
    skippedReason: string | null;
  };
  status: string;
  statusReason: string | null;
};

export function buildFaceGeometryAnalysisPayload(
  result: FaceGeometryResult | null,
): FaceGeometryAnalysisPayload | undefined {
  if (
    !result ||
    (result.status !== 'full_success' && result.status !== 'partial_success')
  ) {
    return undefined;
  }

  const metrics = {} as FaceGeometryAnalysisPayload['metrics'];

  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    const metric = result.metrics[key];
    metrics[key] = {
      unit: metric.unit,
      value: metric.value,
      warnings: metric.warnings,
    };
  }

  return {
    metrics,
    pose: result.pose,
    rollCorrection: {
      applied: result.rollCorrection.applied,
      rollCorrectionDeg: result.rollCorrection.rollCorrectionDeg,
      skippedReason: result.rollCorrection.skippedReason ?? null,
    },
    status: result.status,
    statusReason: result.statusReason ?? null,
  };
}
