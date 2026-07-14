// 2D face-geometry 실기기 증적 record (A0) — 순수 빌더.
//
// FileSystem 의존이 없어 계약 러너(tsc→node)에서 그대로 테스트된다. 실제 파일
// append 는 faceGeometryRuntimeEvidenceLogger 가 이 빌더를 재사용해 수행한다.
// face3d/face-ratio 증적 규율을 승계: 원시 랜드마크 좌표 미포함(파생 지표만) +
// sourceImage.uri(로컬 경로) 제외 → rawFaceDataIncluded:false.

import {FACE_GEOMETRY_METRIC_KEYS, type FaceGeometryResult} from '../types';

export const FACE_GEOMETRY_EVIDENCE_SCHEMA_VERSION =
  'aura.face-geometry-runtime-evidence.v1' as const;

export type FaceGeometryEvidenceRecord = {
  captureId: string;
  createdAt: string;
  sessionId: string;
  status: FaceGeometryResult['status'];
  statusReason: string | null;
  pose: FaceGeometryResult['pose'];
  rollCorrection: FaceGeometryResult['rollCorrection'];
  metrics: Record<string, {value: number | null; warnings: string[]}>;
  sourceImage: {height: number; width: number};
  rawFaceDataIncluded: false;
  schemaVersion: typeof FACE_GEOMETRY_EVIDENCE_SCHEMA_VERSION;
};

export function buildFaceGeometryEvidenceRecord(
  result: FaceGeometryResult,
): FaceGeometryEvidenceRecord {
  const metrics: Record<string, {value: number | null; warnings: string[]}> = {};
  for (const key of FACE_GEOMETRY_METRIC_KEYS) {
    const metric = result.metrics[key];
    // 값 + 사유(warnings)만 남긴다. roll 게이트로 null 이 된 각도 지표는 그 사유가
    // warnings 에 담겨 실기기에서 게이트 실동작을 눈으로 확인할 수 있다.
    metrics[key] = {value: metric.value, warnings: metric.warnings};
  }

  return {
    captureId: result.captureId,
    createdAt: result.createdAt,
    sessionId: result.sessionId,
    status: result.status,
    statusReason: result.statusReason ?? null,
    // pose 는 roll/pitch/yaw 전부 기록한다 — pitch 는 게이트하지 않지만 촬영
    // 견고성(발산 없이 유한 유지) 확인을 위해 증적에 남긴다.
    pose: result.pose,
    rollCorrection: result.rollCorrection,
    metrics,
    // sourceImage.uri(로컬 file:// 경로) 제외, width/height 만 유지.
    sourceImage: {height: result.sourceImage.height, width: result.sourceImage.width},
    rawFaceDataIncluded: false,
    schemaVersion: FACE_GEOMETRY_EVIDENCE_SCHEMA_VERSION,
  };
}
