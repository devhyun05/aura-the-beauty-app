import type {
  RealtimeCaptureFrameMetadata,
  RealtimeFaceCaptureLandmarkPayload,
  RealtimeImageQualityPayload,
} from '../components/RealtimeFaceCaptureNativeView';
import {
  evaluateFaceCaptureGreenlight,
  type FaceCaptureGreenlightGuide,
  type GreenlightFailureReason,
} from './faceCaptureGreenlight';
import type {PoseGateLimits} from '../constants/facePoseGates';

/**
 * Conservative live acceptance band inside the server hard-retake thresholds.
 * Keep every tuneable value in this object and relax it only from paired
 * live-frame/post-capture device telemetry.
 */
export const MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS = Object.freeze({
  maxAbsPitchDeg: 12,
  maxAbsRollDeg: 10,
  maxAbsYawDeg: 15,
  maxCaptureFrameAgeMs: 500,
  maxContinuousFrameGapMs: 250,
  maxExposureMean: 208,
  maxFrameAgeMs: 1000,
  maxFaceAreaRatio: 0.7,
  maxFaceWidthRatio: 0.62,
  maxHighlightRatio: 0.58,
  maxShadowRatio: 0.58,
  minBlurScore: 22,
  minExposureMean: 52,
  minFaceAreaRatio: 0.12,
  minFaceWidthRatio: 0.3,
  minImageLongSidePx: 640,
  minImageShortSidePx: 480,
  minStableDurationMs: 400,
});

export const MAKEUP_FEEDBACK_REALTIME_POSE_GATE: PoseGateLimits = Object.freeze({
  maxAbsPitchDeg: MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.maxAbsPitchDeg,
  maxAbsRollDeg: MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.maxAbsRollDeg,
  maxAbsYawDeg: MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.maxAbsYawDeg,
  requireValidPose: true,
});

export type MakeupFeedbackRealtimeFailureReason =
  | 'analyzer_unavailable'
  | 'frame_pending'
  | 'capture_frame_unavailable'
  | 'frame_stale'
  | 'quality_stabilizing'
  | 'image_dimensions_unavailable'
  | 'image_resolution_too_low'
  | 'no_face'
  | 'multiple_faces'
  | 'landmark_missing'
  | 'face_geometry_unavailable'
  | 'face_too_close'
  | 'face_too_far'
  | 'pose_unavailable'
  | 'not_forward'
  | 'pitch_out_of_range'
  | 'not_centered'
  | 'quality_metrics_unavailable'
  | 'underexposed'
  | 'overexposed'
  | 'blurred'
  | 'camera_unstable';

export type MakeupFeedbackRealtimeQualityMetrics = {
  blurScore: number | null;
  exposureMean: number | null;
  faceAreaRatio: number | null;
  faceCount: number | null;
  faceWidthRatio: number | null;
  frameSequence: number | null;
  guideFaceWidthRatio: number | null;
  highlightRatio: number | null;
  imageHeight: number | null;
  imageLongSide: number | null;
  imageShortSide: number | null;
  imageWidth: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  shadowRatio: number | null;
  stableDurationMs: number | null;
  yawDeg: number | null;
};

export type MakeupFeedbackRealtimeQualityReport = {
  failureReasons: MakeupFeedbackRealtimeFailureReason[];
  isCaptureEnabled: boolean;
  message: string | null;
  metrics: MakeupFeedbackRealtimeQualityMetrics;
};

export type MakeupFeedbackRealtimeFrameSnapshot = {
  frame: RealtimeFaceCaptureLandmarkPayload;
  qualityPassingSinceMs: number | null;
  receivedAtMs: number;
};

const FAILURE_MESSAGES: Record<MakeupFeedbackRealtimeFailureReason, string> = {
  analyzer_unavailable:
    '이 실행 환경에서는 실시간 얼굴 품질을 확인할 수 없어요. 앨범을 사용하거나 앱 빌드에서 촬영해주세요',
  frame_pending: '얼굴과 촬영 환경을 확인하고 있어요. 잠시만 기다려주세요',
  capture_frame_unavailable: '촬영 준비가 잠시 끊겼어요. 가이드 안에서 잠시 멈춰주세요',
  frame_stale: '촬영 순간 얼굴 상태를 다시 확인하고 있어요. 가이드 안에서 잠시 멈춰주세요',
  quality_stabilizing: '좋아요. 이 상태로 잠시만 멈춰주세요',
  image_dimensions_unavailable: '카메라 해상도를 확인하고 있어요. 잠시만 기다려주세요',
  image_resolution_too_low: '선명한 분석을 위해 카메라 화질을 다시 확인해주세요',
  no_face: '얼굴이 인식되지 않았어요. 밝은 곳에서 가이드 안에 맞춰주세요',
  multiple_faces: '한 명의 얼굴만 가이드 안에 맞춰주세요',
  landmark_missing: '눈, 코, 입과 얼굴 윤곽이 모두 보이게 맞춰주세요',
  face_geometry_unavailable: '얼굴 거리를 확인하고 있어요. 잠시만 기다려주세요',
  face_too_close: '조금 멀리서 촬영해주세요',
  face_too_far: '조금 가까이서 촬영해주세요',
  pose_unavailable: '얼굴 각도를 확인할 수 없어요. 정면에서 얼굴 전체를 보여주세요',
  not_forward: '정면을 응시한 상태에서 촬영해주세요',
  pitch_out_of_range: '고개를 들거나 숙이지 말고 정면을 봐주세요',
  not_centered: '얼굴을 화면 중앙에 맞춰주세요',
  quality_metrics_unavailable: '빛과 선명도를 확인하고 있어요. 잠시만 기다려주세요',
  underexposed: '얼굴이 너무 어두워요. 더 밝은 곳으로 이동해주세요',
  overexposed: '빛이 너무 강해요. 강한 조명을 피해주세요',
  blurred: '휴대폰을 고정하고 잠시 멈춰주세요',
  camera_unstable: '잠시 움직이지 말아주세요',
};

function finiteNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readImageQuality(
  quality: RealtimeImageQualityPayload | undefined,
): Required<Record<keyof RealtimeImageQualityPayload, number | null>> {
  return {
    blurScore: finiteNumber(quality?.blurScore),
    exposureMean: finiteNumber(quality?.exposureMean),
    faceAreaRatio: finiteNumber(quality?.faceAreaRatio),
    faceWidthRatio: finiteNumber(quality?.faceWidthRatio),
    highlightRatio: finiteNumber(quality?.highlightRatio),
    shadowRatio: finiteNumber(quality?.shadowRatio),
  };
}

function createMetrics(
  frame: RealtimeFaceCaptureLandmarkPayload | undefined,
): MakeupFeedbackRealtimeQualityMetrics {
  const quality = readImageQuality(frame?.imageQuality);
  const imageHeight = finiteNumber(frame?.imageHeight);
  const imageWidth = finiteNumber(frame?.imageWidth);
  const imageShortSide =
    imageHeight === null || imageWidth === null
      ? null
      : Math.min(imageHeight, imageWidth);
  const imageLongSide =
    imageHeight === null || imageWidth === null
      ? null
      : Math.max(imageHeight, imageWidth);

  return {
    blurScore: quality.blurScore,
    exposureMean: quality.exposureMean,
    faceAreaRatio: quality.faceAreaRatio,
    faceCount: finiteNumber(frame?.faceCount),
    faceWidthRatio: quality.faceWidthRatio,
    frameSequence: finiteNumber(frame?.sequence),
    guideFaceWidthRatio: finiteNumber(frame?.mediaPipe?.faceWidthRatio),
    highlightRatio: quality.highlightRatio,
    imageHeight,
    imageLongSide,
    imageShortSide,
    imageWidth,
    pitchDeg: finiteNumber(frame?.mediaPipe?.pitchDeg),
    rollDeg: finiteNumber(frame?.mediaPipe?.rollDeg),
    shadowRatio: quality.shadowRatio,
    stableDurationMs: finiteNumber(frame?.cameraStability?.stableDurationMs),
    yawDeg: finiteNumber(frame?.mediaPipe?.yawDeg),
  };
}

function createReport(
  metrics: MakeupFeedbackRealtimeQualityMetrics,
  failureReasons: MakeupFeedbackRealtimeFailureReason[],
): MakeupFeedbackRealtimeQualityReport {
  const firstFailure = failureReasons[0];

  return {
    failureReasons,
    isCaptureEnabled: failureReasons.length === 0,
    message: firstFailure ? FAILURE_MESSAGES[firstFailure] : null,
    metrics,
  };
}

function mapGreenlightFailure(
  reason: GreenlightFailureReason,
): MakeupFeedbackRealtimeFailureReason {
  return reason;
}

function appendUnique(
  reasons: MakeupFeedbackRealtimeFailureReason[],
  reason: MakeupFeedbackRealtimeFailureReason,
) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

export function shouldRequireMakeupFeedbackRealtimeQuality(
  captureType: string | null | undefined,
): boolean {
  return captureType === 'makeup_feedback';
}

export function evaluateMakeupFeedbackRealtimeQuality({
  analyzerAvailable,
  frame,
  guide,
}: {
  analyzerAvailable: boolean;
  frame?: RealtimeFaceCaptureLandmarkPayload;
  guide: FaceCaptureGreenlightGuide;
}): MakeupFeedbackRealtimeQualityReport {
  const metrics = createMetrics(frame);

  if (!analyzerAvailable) {
    return createReport(metrics, ['analyzer_unavailable']);
  }
  if (!frame) {
    return createReport(metrics, ['frame_pending']);
  }
  if (frame.faceCount === 0 || frame.status === 'no_face') {
    return createReport(metrics, ['no_face']);
  }
  if (frame.faceCount !== 1) {
    return createReport(metrics, ['multiple_faces']);
  }

  const failureReasons: MakeupFeedbackRealtimeFailureReason[] = [];
  const mediaPipe = frame.mediaPipe;
  const limits = MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS;

  if (
    metrics.imageWidth === null ||
    metrics.imageHeight === null ||
    metrics.imageShortSide === null ||
    metrics.imageLongSide === null
  ) {
    appendUnique(failureReasons, 'image_dimensions_unavailable');
  } else if (
    metrics.imageShortSide < limits.minImageShortSidePx ||
    metrics.imageLongSide < limits.minImageLongSidePx
  ) {
    appendUnique(failureReasons, 'image_resolution_too_low');
  }

  if (frame.status !== 'ok' || mediaPipe?.status !== 'ok') {
    appendUnique(failureReasons, 'landmark_missing');
  }

  if (
    metrics.faceWidthRatio === null ||
    metrics.faceAreaRatio === null ||
    metrics.guideFaceWidthRatio === null
  ) {
    appendUnique(failureReasons, 'face_geometry_unavailable');
  } else {
    if (
      metrics.faceWidthRatio < limits.minFaceWidthRatio ||
      metrics.faceAreaRatio < limits.minFaceAreaRatio
    ) {
      appendUnique(failureReasons, 'face_too_far');
    }
    if (
      metrics.faceWidthRatio > limits.maxFaceWidthRatio ||
      metrics.faceAreaRatio > limits.maxFaceAreaRatio
    ) {
      appendUnique(failureReasons, 'face_too_close');
    }
  }

  const poseIsValid =
    metrics.yawDeg !== null &&
    metrics.pitchDeg !== null &&
    metrics.rollDeg !== null &&
    mediaPipe?.poseSource !== undefined &&
    mediaPipe.poseSource !== 'geometry_unavailable' &&
    mediaPipe.pitchMeasured !== false;

  if (!poseIsValid) {
    appendUnique(failureReasons, 'pose_unavailable');
  } else {
    if (
      Math.abs(metrics.yawDeg as number) > limits.maxAbsYawDeg ||
      Math.abs(metrics.rollDeg as number) > limits.maxAbsRollDeg
    ) {
      appendUnique(failureReasons, 'not_forward');
    }
    if (Math.abs(metrics.pitchDeg as number) > limits.maxAbsPitchDeg) {
      appendUnique(failureReasons, 'pitch_out_of_range');
    }
  }

  const greenlight = evaluateFaceCaptureGreenlight({
    cameraStability: frame.cameraStability,
    guide,
    mediaPipe,
    poseGate: MAKEUP_FEEDBACK_REALTIME_POSE_GATE,
  });
  for (const reason of greenlight.failureReasons) {
    if (reason === 'camera_unstable') {
      continue;
    }
    appendUnique(failureReasons, mapGreenlightFailure(reason));
  }

  const quality = readImageQuality(frame.imageQuality);
  const qualityComplete = Object.values(quality).every(value => value !== null);
  if (!qualityComplete) {
    appendUnique(failureReasons, 'quality_metrics_unavailable');
  } else {
    if (
      (quality.exposureMean as number) < limits.minExposureMean ||
      (quality.shadowRatio as number) > limits.maxShadowRatio
    ) {
      appendUnique(failureReasons, 'underexposed');
    }
    if (
      (quality.exposureMean as number) > limits.maxExposureMean ||
      (quality.highlightRatio as number) > limits.maxHighlightRatio
    ) {
      appendUnique(failureReasons, 'overexposed');
    }
    if ((quality.blurScore as number) < limits.minBlurScore) {
      appendUnique(failureReasons, 'blurred');
    }
  }

  const cameraStability = frame.cameraStability;
  const cameraInstantlyStable =
    cameraStability?.status === 'ok' &&
    (cameraStability.isStable === true || cameraStability.isStable === 1) &&
    cameraStability.adjustingExposure !== true &&
    cameraStability.adjustingFocus !== true &&
    cameraStability.adjustingWhiteBalance !== true;
  if (!cameraInstantlyStable) {
    appendUnique(failureReasons, 'camera_unstable');
  }

  return createReport(metrics, failureReasons);
}

/**
 * Validates the native video-frame snapshot frozen at the photo request.
 * photoPixelsAnalyzed is deliberately false: this closes request-time motion
 * races but is not a claim that the encoded JPEG/HEIC pixels were inspected.
 */
export function evaluateMakeupFeedbackCaptureFrameMetadata({
  analyzerAvailable,
  captureFrameMetadata,
  guide,
  minimumSequence,
}: {
  analyzerAvailable: boolean;
  captureFrameMetadata?: RealtimeCaptureFrameMetadata;
  guide: FaceCaptureGreenlightGuide;
  minimumSequence?: number;
}): MakeupFeedbackRealtimeQualityReport {
  const metrics = createMetrics(captureFrameMetadata?.frame);

  if (!analyzerAvailable) {
    return createReport(metrics, ['analyzer_unavailable']);
  }
  if (
    !captureFrameMetadata ||
    !captureFrameMetadata.frame ||
    captureFrameMetadata.source !== 'latest_pre_shutter_video_frame' ||
    captureFrameMetadata.photoPixelsAnalyzed !== false
  ) {
    return createReport(metrics, ['capture_frame_unavailable']);
  }

  const frameAgeMs = finiteNumber(
    captureFrameMetadata.frameAgeMsAtCaptureRequest,
  );
  const sequence = finiteNumber(captureFrameMetadata.frame.sequence);
  const minimum = finiteNumber(minimumSequence);
  if (
    captureFrameMetadata.isStale !== false ||
    frameAgeMs === null ||
    frameAgeMs < 0 ||
    frameAgeMs >
      MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.maxCaptureFrameAgeMs ||
    sequence === null ||
    (minimum !== null && sequence < minimum)
  ) {
    return createReport(metrics, ['frame_stale']);
  }

  return evaluateMakeupFeedbackRealtimeQuality({
    analyzerAvailable,
    frame: captureFrameMetadata.frame,
    guide,
  });
}

/**
 * Records whether every makeup-feedback condition has passed continuously.
 * A failed, missing, out-of-order, or excessively delayed frame starts a new
 * hold window; native camera stability alone never carries this history.
 */
export function advanceMakeupFeedbackRealtimeQualitySnapshot({
  analyzerAvailable,
  frame,
  guide,
  previousSnapshot,
  receivedAtMs,
}: {
  analyzerAvailable: boolean;
  frame: RealtimeFaceCaptureLandmarkPayload;
  guide: FaceCaptureGreenlightGuide;
  previousSnapshot?: MakeupFeedbackRealtimeFrameSnapshot | null;
  receivedAtMs: number;
}): MakeupFeedbackRealtimeFrameSnapshot {
  const frameReport = evaluateMakeupFeedbackRealtimeQuality({
    analyzerAvailable,
    frame,
    guide,
  });
  const sequence = finiteNumber(frame.sequence);
  const previousSequence = finiteNumber(previousSnapshot?.frame.sequence);
  const previousReceivedAtMs = finiteNumber(previousSnapshot?.receivedAtMs);
  const previousPassingSinceMs = finiteNumber(
    previousSnapshot?.qualityPassingSinceMs ?? undefined,
  );
  const elapsedSincePreviousFrame =
    previousReceivedAtMs === null ? null : receivedAtMs - previousReceivedAtMs;
  const continuesPreviousHold =
    frameReport.isCaptureEnabled &&
    previousPassingSinceMs !== null &&
    sequence !== null &&
    previousSequence !== null &&
    sequence > previousSequence &&
    elapsedSincePreviousFrame !== null &&
    elapsedSincePreviousFrame >= 0 &&
    elapsedSincePreviousFrame <=
      MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.maxContinuousFrameGapMs;

  return {
    frame,
    qualityPassingSinceMs: frameReport.isCaptureEnabled
      ? continuesPreviousHold
        ? previousPassingSinceMs
        : receivedAtMs
      : null,
    receivedAtMs,
  };
}

/**
 * Validates the event snapshot used at the shutter boundary.
 *
 * This proves the JS-observed pre-shutter hold and rejects stale/regressed
 * events. Native request-time frozen evidence is validated separately by
 * evaluateMakeupFeedbackCaptureFrameMetadata. Neither path inspects the encoded
 * JPEG/HEIC pixels.
 */
export function evaluateMakeupFeedbackRealtimeCaptureSnapshot({
  analyzerAvailable,
  guide,
  minimumSequence,
  nowMs,
  snapshot,
}: {
  analyzerAvailable: boolean;
  guide: FaceCaptureGreenlightGuide;
  minimumSequence?: number;
  nowMs: number;
  snapshot?: MakeupFeedbackRealtimeFrameSnapshot | null;
}): MakeupFeedbackRealtimeQualityReport {
  const report = evaluateMakeupFeedbackRealtimeQuality({
    analyzerAvailable,
    frame: snapshot?.frame,
    guide,
  });

  if (!report.isCaptureEnabled) {
    return report;
  }

  const receivedAtMs = finiteNumber(snapshot?.receivedAtMs);
  const qualityPassingSinceMs = finiteNumber(
    snapshot?.qualityPassingSinceMs ?? undefined,
  );
  const sequence = report.metrics.frameSequence;
  const minimum = finiteNumber(minimumSequence);
  const frameAgeMs = receivedAtMs === null ? null : nowMs - receivedAtMs;

  if (
    sequence === null ||
    receivedAtMs === null ||
    frameAgeMs === null ||
    frameAgeMs < 0 ||
    frameAgeMs > MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.maxFrameAgeMs ||
    (minimum !== null && sequence < minimum)
  ) {
    return createReport(report.metrics, ['frame_stale']);
  }

  const qualityHoldDurationMs =
    qualityPassingSinceMs === null || receivedAtMs === null
      ? null
      : receivedAtMs - qualityPassingSinceMs;
  if (
    qualityHoldDurationMs === null ||
    qualityHoldDurationMs < 0 ||
    qualityHoldDurationMs <
      MAKEUP_FEEDBACK_REALTIME_QUALITY_LIMITS.minStableDurationMs
  ) {
    return createReport(report.metrics, ['quality_stabilizing']);
  }

  return report;
}
