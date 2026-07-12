import type {
  FaceVerticalThirdsQuality,
  NativeFaceRatioAnalyzeResult,
  VerticalThirdsKeypointMap,
} from '../types';
import {APPLE_HAIRLINE_FULL_CONFIDENCE, HAIRLINE_WARNING} from '../constants';
import {POST_CAPTURE_POSE_GATE} from '../../face-capture/constants/facePoseGates';

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

function isWithinPoseGate(value: number | undefined, limit: number) {
  return typeof value !== 'number' || Math.abs(value) <= limit;
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

  if (
    !isWithinPoseGate(nativeResult.pose?.yawDeg, MAX_ABS_YAW_DEG) ||
    !isWithinPoseGate(nativeResult.pose?.pitchDeg, MAX_ABS_PITCH_DEG) ||
    !isWithinPoseGate(nativeResult.pose?.rollDeg, MAX_ABS_ROLL_DEG)
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
  } else if (!(hairline.y < glabella.y)) {
    nextKeypoints.H = null;
    warnings.push(
      hairline.provider === 'apple_semantic_matte'
        ? HAIRLINE_WARNING.invalidOrder
        : HAIRLINE_WARNING.approximatedUnusable,
    );
  } else if (hairline.provider === 'apple_semantic_matte') {
    warnings.push(
      hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE
        ? HAIRLINE_WARNING.appleMatte
        : HAIRLINE_WARNING.appleMatteLowConfidence,
    );
  } else {
    warnings.push(HAIRLINE_WARNING.approximated);
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
