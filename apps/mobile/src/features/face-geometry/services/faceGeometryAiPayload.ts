import type {
  FaceGeometryMetricKey,
  FaceGeometryMetricUnit,
  FaceGeometryResult,
} from '../types';
import {FACE_GEOMETRY_METRIC_KEYS} from '../types';

// 보고서 작성 AI(requestPayload.faceGeometry2d)로 보내는 압축 요약.
// raw 랜드마크는 보내지 않고, 산출에 성공한 지표 값만 담는다.
export type FaceGeometryAnalysisPayload = {
  metrics: Partial<
    Record<FaceGeometryMetricKey, {unit: FaceGeometryMetricUnit; value: number}>
  >;
  rollCorrectionApplied: boolean;
  status: string;
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

  const metrics: FaceGeometryAnalysisPayload['metrics'] = {};

  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    const metric = result.metrics[key];
    if (metric.value !== null) {
      metrics[key] = {unit: metric.unit, value: metric.value};
    }
  }

  return {
    metrics,
    rollCorrectionApplied: result.rollCorrection.applied,
    status: result.status,
  };
}
