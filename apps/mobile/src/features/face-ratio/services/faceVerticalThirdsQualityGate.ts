import type {
  FaceVerticalThirdsQuality,
  NativeFaceRatioAnalyzeResult,
  VerticalThirdsKeypointMap,
} from '../types';
import {APPLE_HAIRLINE_FULL_CONFIDENCE, HAIRLINE_WARNING} from '../constants';
import {POST_CAPTURE_POSE_GATE} from '../../face-capture/constants/facePoseGates';
import {isActualHairlineProvider} from './faceVerticalThirdsHairlineSelection';

// 단일 소스(facePoseGates)에서 온다 — 실시간 게이트와의 정합(실시간 ≤ 사후)은
// facePoseGates.test.ts 가 CI 에서 강제한다.
const MAX_ABS_YAW_DEG = POST_CAPTURE_POSE_GATE.maxAbsYawDeg;
const MAX_ABS_PITCH_DEG = POST_CAPTURE_POSE_GATE.maxAbsPitchDeg;
const MAX_ABS_ROLL_DEG = POST_CAPTURE_POSE_GATE.maxAbsRollDeg;

export type FaceVerticalThirdsQualityGateResult = {
  keypoints: VerticalThirdsKeypointMap;
  quality: FaceVerticalThirdsQuality;
  statusReason?: string;
};

function isWithinPoseGate(value: number, limit: number) {
  // 유효성(유한·존재)은 호출 전에 isPoseMeasured 로 검증됐다. 여기선 범위만 본다.
  return Math.abs(value) <= limit;
}

// pose 를 실제로 잰 것인지 판정. 0/0/0(결측 기본값)은 "완벽 정면"과 값이 같아
// 구분 불가이므로, poseSource='unavailable' 또는 결측/비유한을 "못 잼"으로 본다 —
// face_analysis 는 "기울기 못 재면 재촬영" 정책이라 이 경우 fail-closed 한다.
function isPoseMeasured(nativeResult: NativeFaceRatioAnalyzeResult): boolean {
  const pose = nativeResult.pose;
  return (
    !!pose &&
    pose.poseSource !== 'unavailable' &&
    Number.isFinite(pose.yawDeg) &&
    Number.isFinite(pose.pitchDeg) &&
    Number.isFinite(pose.rollDeg)
  );
}

function createBlockedResult(
  keypoints: VerticalThirdsKeypointMap,
  nativeResult: NativeFaceRatioAnalyzeResult,
  statusReason: string,
  warnings: string[],
): FaceVerticalThirdsQualityGateResult {
  return {
    keypoints,
    quality: {
      pitch: nativeResult.pose?.pitchDeg,
      roll: nativeResult.pose?.rollDeg,
      usable: false,
      warnings,
      yaw: nativeResult.pose?.yawDeg,
    },
    statusReason,
  };
}

export function evaluateFaceVerticalThirdsQuality(
  nativeResult: NativeFaceRatioAnalyzeResult,
  keypoints: VerticalThirdsKeypointMap,
): FaceVerticalThirdsQualityGateResult {
  const warnings: string[] = [];

  if (nativeResult.status === 'no_face' || nativeResult.faceCount === 0) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'face_not_detected',
      ['face_not_detected'],
    );
  }

  if (nativeResult.faceCount !== 1) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'multiple_faces_detected',
      ['multiple_faces_detected'],
    );
  }

  // pose 를 못 쟀으면(결측/비유한/poseSource unavailable) 재촬영으로 차단 —
  // 0/0/0 을 "완벽 정면"으로 오인해 기울어진 얼굴을 통과시키던 fail-open 방지.
  if (!isPoseMeasured(nativeResult)) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'pose_unavailable',
      ['pose_unavailable'],
    );
  }

  const pose = nativeResult.pose!;
  if (
    !isWithinPoseGate(pose.yawDeg, MAX_ABS_YAW_DEG) ||
    !isWithinPoseGate(pose.pitchDeg, MAX_ABS_PITCH_DEG) ||
    !isWithinPoseGate(pose.rollDeg, MAX_ABS_ROLL_DEG)
  ) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'pose_gate_failed',
      ['pose_gate_failed'],
    );
  }

  const glabella = keypoints.G;
  const subnasale = keypoints.Sn;
  const menton = keypoints.Me;

  if (!glabella || !subnasale || !menton) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'required_keypoints_missing',
      ['required_keypoints_missing'],
    );
  }

  if (!(glabella.y < subnasale.y && subnasale.y < menton.y)) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'vertical_keypoint_order_invalid',
      ['vertical_keypoint_order_invalid'],
    );
  }

  const nextKeypoints = {...keypoints};
  const hairline = nextKeypoints.H;

  if (!hairline) {
    nextKeypoints.H = null;
    warnings.push(HAIRLINE_WARNING.unavailable);
  } else if (!isActualHairlineProvider(hairline.provider)) {
    nextKeypoints.H = null;
    warnings.push(HAIRLINE_WARNING.proxyRejected);
  } else if (!(hairline.y < glabella.y)) {
    nextKeypoints.H = null;
    warnings.push(HAIRLINE_WARNING.invalidOrder);
  } else if (hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE) {
    warnings.push(
      hairline.provider === 'apple_semantic_matte'
        ? HAIRLINE_WARNING.appleMatte
        : HAIRLINE_WARNING.detected,
    );
  } else {
    warnings.push(HAIRLINE_WARNING.lowConfidence);
  }

  return {
    keypoints: nextKeypoints,
    quality: {
      pitch: nativeResult.pose?.pitchDeg,
      roll: nativeResult.pose?.rollDeg,
      usable: true,
      warnings,
      yaw: nativeResult.pose?.yawDeg,
    },
  };
}
