import type {
  NativeCameraCaptureMetadata,
  RealtimeCameraStabilityPayload,
  RealtimeFaceCaptureScreenPoint,
  RealtimeMediaPipeLandmarkKey,
  RealtimeMediaPipePayload,
} from '../components/RealtimeFaceCaptureNativeView';
import {
  REALTIME_DEFAULT_POSE_GATE,
  type PoseGateLimits,
} from '../constants/facePoseGates';

export type GreenlightFailureReason =
  | 'landmark_missing'
  | 'not_centered'
  | 'not_forward'
  | 'face_too_close'
  | 'face_too_far'
  | 'camera_unstable';

export type FaceCaptureGreenlightGuide = {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
};

export type FaceCaptureGreenlightMetrics = {
  cameraStableDurationMs?: number;
  centerLineSpreadPx?: number;
  centerOffsetPx?: number;
  faceWidthRatio?: number;
  pitchDeg?: number;
  rollDeg?: number;
  yawDeg?: number;
};

export type FaceCaptureGreenlightReport = {
  cameraStabilityGreenlight: boolean;
  cameraStabilityStatus?: RealtimeCameraStabilityPayload['status'];
  failureReasons: GreenlightFailureReason[];
  finalCaptureGreenlight: boolean;
  mediaPipeAlignmentGreenlight: boolean;
  mediaPipeStatus?: RealtimeMediaPipePayload['status'];
  message: string;
  metrics: FaceCaptureGreenlightMetrics;
  nativeCameraMetadata?: NativeCameraCaptureMetadata;
};

// 중앙 오프셋 허용치: 가이드 폭 대비 비율. 0.12는 전형 화면(가이드 ~310pt)에서
// ±37pt 까지 통과시켜 "중앙선이 눈에 띄게 어긋나도 촬영 가능" 문제를 낳았다.
// 0.06(±~18pt)은 두 중앙선이 시각적으로 겹쳐 보이는 수준. 얼굴 중앙선 렌더와
// 게이트가 같은 수치를 쓰므로, 선이 빨간(미정렬) 동안은 셔터가 잠긴다.
// TODO(실기기): 지터로 초록불이 불안정하면 0.08까지 완화 검토
// (realtime-landmark-frame 로그의 metrics.centerOffsetPx 분포로 판단).
const CENTER_OFFSET_MAX_RATIO = 0.06;
const CENTER_LINE_SPREAD_MAX_RATIO = 0.1;
// yaw/roll 임계값은 facePoseGates 의 프로파일로 주입된다 — 촬영 타입별로
// 사후 게이트와의 정합(실시간 ≤ 사후)을 한 곳에서 보장하기 위함.
const FACE_WIDTH_TOO_CLOSE_RATIO = 0.62;
const FACE_WIDTH_TOO_FAR_RATIO = 0.3;

const REQUIRED_CENTERLINE_KEYS: readonly RealtimeMediaPipeLandmarkKey[] = [
  'forehead',
  'noseBridge',
  'noseTip',
  'chin',
];

function getScreenPoint(
  mediaPipe: RealtimeMediaPipePayload | undefined,
  key: RealtimeMediaPipeLandmarkKey,
): RealtimeFaceCaptureScreenPoint | null {
  const point = mediaPipe?.screenLandmarks?.[key];
  const left = point && Number.isFinite(point.left) ? point.left : point?.x;
  const top = point && Number.isFinite(point.top) ? point.top : point?.y;

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }

  return {
    left: left as number,
    top: top as number,
  };
}

function getFailureMessage(reasons: readonly GreenlightFailureReason[]): string {
  if (reasons.includes('landmark_missing')) {
    return '얼굴이 인식되지 않았어요. 밝은 곳에서 가이드 안에 맞춰주세요';
  }
  if (reasons.includes('face_too_close')) {
    return '조금 멀리서 촬영해주세요';
  }
  if (reasons.includes('face_too_far')) {
    return '조금 가까이서 촬영해주세요';
  }
  if (reasons.includes('not_forward')) {
    return '정면을 응시한 상태에서 촬영해주세요';
  }
  if (reasons.includes('not_centered')) {
    return '얼굴을 화면 중앙에 맞춰주세요';
  }
  if (reasons.includes('camera_unstable')) {
    return '잠시 움직이지 말아주세요';
  }

  return '좋아요. 촬영할 수 있어요';
}

function isCameraStabilityStable(
  cameraStability: RealtimeCameraStabilityPayload | undefined,
): boolean {
  return cameraStability?.isStable === true || cameraStability?.isStable === 1;
}

export function evaluateFaceCaptureGreenlight({
  cameraStability,
  guide,
  mediaPipe,
  nativeCameraMetadata,
  poseGate = REALTIME_DEFAULT_POSE_GATE,
}: {
  cameraStability?: RealtimeCameraStabilityPayload;
  guide: FaceCaptureGreenlightGuide;
  mediaPipe?: RealtimeMediaPipePayload;
  nativeCameraMetadata?: NativeCameraCaptureMetadata;
  // 촬영 타입별 pose 임계 프로파일. face_analysis 는
  // REALTIME_FACE_ANALYSIS_POSE_GATE(사후 게이트와 동치)를 전달할 것.
  poseGate?: PoseGateLimits;
}): FaceCaptureGreenlightReport {
  const failureReasons: GreenlightFailureReason[] = [];
  const metrics: FaceCaptureGreenlightMetrics = {
    cameraStableDurationMs: cameraStability?.stableDurationMs,
    faceWidthRatio: mediaPipe?.faceWidthRatio,
    pitchDeg: mediaPipe?.pitchDeg,
    rollDeg: mediaPipe?.rollDeg,
    yawDeg: mediaPipe?.yawDeg,
  };

  if (mediaPipe?.status !== 'ok') {
    failureReasons.push('landmark_missing');
  } else {
    const centerlinePoints = REQUIRED_CENTERLINE_KEYS
      .map(key => getScreenPoint(mediaPipe, key))
      .filter(Boolean) as RealtimeFaceCaptureScreenPoint[];

    if (centerlinePoints.length !== REQUIRED_CENTERLINE_KEYS.length) {
      failureReasons.push('landmark_missing');
    } else {
      const centerLineX =
        centerlinePoints.reduce((sum, point) => sum + point.left, 0) /
        centerlinePoints.length;
      const centerLineSpread = Math.max(
        ...centerlinePoints.map(point => Math.abs(point.left - centerLineX)),
      );
      const centerOffset = centerLineX - guide.centerX;

      metrics.centerOffsetPx = centerOffset;
      metrics.centerLineSpreadPx = centerLineSpread;

      if (
        Math.abs(centerOffset) > guide.width * CENTER_OFFSET_MAX_RATIO ||
        centerLineSpread > guide.width * CENTER_LINE_SPREAD_MAX_RATIO
      ) {
        failureReasons.push('not_centered');
      }
    }

    // pose 를 못 재면(NaN/결측/geometry_unavailable → 0/0/0) fail-closed:
    // face_analysis 는 "기울기 못 재면 재촬영" 정책이라 정면인 척 통과시키지 않는다.
    // 'geometry'(5점 근사)·'vision' 은 실측 각도이므로 유효로 본다.
    const poseInvalid =
      !Number.isFinite(mediaPipe.yawDeg) ||
      !Number.isFinite(mediaPipe.rollDeg) ||
      mediaPipe.poseSource === undefined ||
      mediaPipe.poseSource === 'geometry_unavailable';
    if (poseGate.requireValidPose && poseInvalid) {
      failureReasons.push('not_forward');
    } else if (
      Math.abs(mediaPipe.yawDeg ?? 0) > poseGate.maxAbsYawDeg ||
      Math.abs(mediaPipe.rollDeg ?? 0) > poseGate.maxAbsRollDeg
    ) {
      failureReasons.push('not_forward');
    }

    if (
      typeof mediaPipe.faceWidthRatio === 'number' &&
      mediaPipe.faceWidthRatio > FACE_WIDTH_TOO_CLOSE_RATIO
    ) {
      failureReasons.push('face_too_close');
    }
    if (
      typeof mediaPipe.faceWidthRatio === 'number' &&
      mediaPipe.faceWidthRatio < FACE_WIDTH_TOO_FAR_RATIO
    ) {
      failureReasons.push('face_too_far');
    }
  }

  const mediaPipeAlignmentGreenlight = failureReasons.length === 0;
  const cameraStabilityGreenlight =
    cameraStability?.status === 'ok' &&
    isCameraStabilityStable(cameraStability) &&
    (cameraStability.stableDurationMs ?? 0) >=
      (cameraStability.stableThresholdMs ?? 400);

  if (!cameraStabilityGreenlight) {
    failureReasons.push('camera_unstable');
  }

  const finalCaptureGreenlight =
    mediaPipeAlignmentGreenlight && cameraStabilityGreenlight;

  return {
    cameraStabilityGreenlight,
    cameraStabilityStatus: cameraStability?.status,
    failureReasons,
    finalCaptureGreenlight,
    mediaPipeAlignmentGreenlight,
    mediaPipeStatus: mediaPipe?.status,
    message: getFailureMessage(failureReasons),
    metrics,
    nativeCameraMetadata,
  };
}
