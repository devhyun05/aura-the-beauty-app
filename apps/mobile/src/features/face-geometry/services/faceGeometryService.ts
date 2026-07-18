import {requestFaceLandmarks} from '../../ar/services/unityMakeupBridge';
import {ROLL_CORRECTION_MAX_ABS_DEG} from '../../face-ratio/services/faceVerticalThirdsRollCorrection';
import type {
  FaceGeometryPose,
  FaceGeometryResult,
  FaceGeometryRollCorrection,
  FaceGeometryStatus,
} from '../types';
import {
  collectMissingIndices,
  computeFaceGeometryMetrics,
  createUnavailableFaceGeometryMetrics,
  rotatePixelLandmarkMap,
  toPixelLandmarkMap,
} from './faceGeometryCore/faceGeometryMath';
import {FACE_GEOMETRY_REQUIRED_INDICES} from './faceGeometryCore/landmarkIndices';
import {regionVisualsBuilder} from './faceGeometryCore/regionVisualsBuilder';

export type FaceGeometryInput = {
  captureId: string;
  createdAt: string;
  imageUri: string;
  sessionId: string;
};

const SKIPPED_ROLL_CORRECTION: FaceGeometryRollCorrection = {
  applied: false,
  rollCorrectionDeg: null,
};

function createTerminalResult(
  input: FaceGeometryInput,
  status: Extract<FaceGeometryStatus, 'blocked' | 'failed'>,
  statusReason: string,
  sourceImage?: FaceGeometryResult['sourceImage'],
  pose: FaceGeometryPose | null = null,
): FaceGeometryResult {
  return {
    captureId: input.captureId,
    createdAt: input.createdAt,
    metrics: createUnavailableFaceGeometryMetrics('not_computed'),
    pose,
    rollCorrection: SKIPPED_ROLL_CORRECTION,
    schemaVersion: 'aura-face-geometry-v1',
    sessionId: input.sessionId,
    sourceImage: sourceImage ?? {height: 0, uri: input.imageUri, width: 0},
    status,
    statusReason,
  };
}

// 촬영 사진 1장에서 2D 얼굴 기하 지표를 온디바이스로 계산한다(업로드 없음).
// 랜드마크는 Unity homuler(IMAGE 모드)에서 오며, 같은 이미지의 세로비율·퍼스널
// 컬러 요청과 requestFaceLandmarks 의 dedup 으로 단일 Unity 검출을 공유한다.
// 실패는 결과 status 로만 알린다(throw 없음) — 호출측은 null 격리로 이어붙인다.
export async function analyzeFaceGeometry2d(
  input: FaceGeometryInput,
): Promise<FaceGeometryResult> {
  let detected: Awaited<ReturnType<typeof requestFaceLandmarks>>;

  try {
    detected = await requestFaceLandmarks(input.imageUri);
  } catch (error) {
    console.info('[aura:face-geometry] landmarks:error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return createTerminalResult(input, 'failed', 'landmarks_unavailable');
  }

  const sourceImage = {
    height: detected.imageHeight,
    uri: input.imageUri,
    width: detected.imageWidth,
  };

  if (detected.status === 'error') {
    return createTerminalResult(
      input,
      'failed',
      'landmark_detection_failed',
      sourceImage,
      detected.pose,
    );
  }

  if (detected.status === 'no_face') {
    return createTerminalResult(
      input,
      'blocked',
      'face_not_detected',
      sourceImage,
      detected.pose,
    );
  }

  if (!(detected.imageWidth > 0) || !(detected.imageHeight > 0)) {
    return createTerminalResult(input, 'blocked', 'image_dimensions_invalid');
  }

  // 좌표 계약: StillFaceLandmarkService 는 정규화(0..1) 좌표를 방출한다 —
  // 휴리스틱 없이 항상 픽셀로 변환한다. toPixelLandmarkMap 은 새 객체를 만들어
  // dedup 으로 공유되는 결과를 오염시키지 않는다.
  const pixelMap = toPixelLandmarkMap(
    detected.landmarks,
    detected.imageWidth,
    detected.imageHeight,
  );

  const missingIndices = collectMissingIndices(pixelMap, FACE_GEOMETRY_REQUIRED_INDICES);
  if (missingIndices.length > 0) {
    console.info('[aura:face-geometry] landmarks:missing', {
      count: missingIndices.length,
      sample: missingIndices.slice(0, 8),
    });
    return createTerminalResult(
      input,
      'blocked',
      'required_landmarks_missing',
      sourceImage,
      detected.pose,
    );
  }

  // roll 좌표 보정 — 세로비율과 같은 정책(±5° 게이트, 이미지 중심 회전).
  // 게이트 밖이면 기울기·수직거리 계열 지표만 null(partial_success)로 격리된다.
  const rollDeg = detected.pose?.rollDeg;
  let rollCorrection: FaceGeometryRollCorrection;
  let correctedMap = pixelMap;

  if (typeof rollDeg !== 'number' || !Number.isFinite(rollDeg)) {
    rollCorrection = {...SKIPPED_ROLL_CORRECTION, skippedReason: 'roll_unavailable'};
  } else if (Math.abs(rollDeg) > ROLL_CORRECTION_MAX_ABS_DEG) {
    rollCorrection = {...SKIPPED_ROLL_CORRECTION, skippedReason: 'roll_out_of_range'};
  } else {
    const angleDeg = -rollDeg;
    correctedMap = rotatePixelLandmarkMap(pixelMap, angleDeg, {
      x: detected.imageWidth / 2,
      y: detected.imageHeight / 2,
    });
    rollCorrection = {
      applied: true,
      rollCorrectionDeg: Number(angleDeg.toFixed(3)),
    };
  }

  const metrics = computeFaceGeometryMetrics({
    map: correctedMap,
    rollCorrectionApplied: rollCorrection.applied,
  });
  const regionVisuals = regionVisualsBuilder(correctedMap, detected.imageWidth, detected.imageHeight);

  const nullCount = Object.values(metrics).filter(metric => metric.value === null).length;
  const status: FaceGeometryStatus = nullCount === 0 ? 'full_success' : 'partial_success';

  console.info('[aura:face-geometry] analysis:done', {
    captureId: input.captureId,
    nullMetricCount: nullCount,
    rollCorrectionApplied: rollCorrection.applied,
    rollSkippedReason: rollCorrection.skippedReason ?? null,
    status,
  });

  return {
    captureId: input.captureId,
    createdAt: input.createdAt,
    metrics,
    pose: detected.pose,
    regionVisuals: Object.keys(regionVisuals).length ? regionVisuals : undefined,
    rollCorrection,
    schemaVersion: 'aura-face-geometry-v1',
    sessionId: input.sessionId,
    sourceImage,
    status,
    statusReason: nullCount === 0 ? undefined : 'some_metrics_unavailable',
  };
}
