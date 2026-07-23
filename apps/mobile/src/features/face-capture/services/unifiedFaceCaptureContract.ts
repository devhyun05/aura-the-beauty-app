import type {Face3DProfileV3} from '../../face-3d/types';
import {parseFace3DProfile} from '../../face-3d/services/face3DContract';
import {
  parseGoldenMaskCaptureArtifact,
  type GoldenMaskCaptureArtifact,
} from '../../../shared/contracts/goldenMask';

export const UNIFIED_FACE_CAPTURE_SCHEMA_VERSION =
  'aura.unified-face-capture.v1' as const;
export const UNIFIED_FACE_CAPTURE_GATE_VERSION = 'face3d-gate-v2' as const;
export const UNIFIED_FACE_CAPTURE_HAIRLINE_POLICY =
  'soft_nudge_post_capture_omit' as const;

export type UnifiedFaceCaptureCollectionPolicyId =
  | 'unified-micro-burst-5of8-v1'
  | 'diagnostics-exact-1-v1'
  | 'diagnostics-exact-3-v1'
  | 'diagnostics-exact-5-v1'
  | 'diagnostics-exact-8-v1'
  | 'diagnostics-exact-12-v1'
  | 'diagnostics-exact-30-v1';

export type UnifiedFaceCaptureRequest = {
  collectionPolicyId: UnifiedFaceCaptureCollectionPolicyId;
  gateVersion: typeof UNIFIED_FACE_CAPTURE_GATE_VERSION;
  hairlinePolicy: typeof UNIFIED_FACE_CAPTURE_HAIRLINE_POLICY;
  maximumDurationMs: number;
  maxAbsFaceSensorDeltaMs: number;
  minimumValidFrames: number;
  requestId: string;
  retryAttemptCount: 0 | 1;
  sampleMode: 'micro_burst' | 'single_frame';
  targetValidFrames: number;
};

export type HairlineAdvisoryStatus =
  | 'likely_visible'
  | 'likely_occluded'
  | 'environment_issue'
  | 'unknown';

export type HairlineActionableReason =
  | 'hairline_occluded'
  | 'low_light'
  | 'motion'
  | 'segmentation_temporarily_unavailable';

// 레거시 greenlight 오버레이·메시지를 RN 이 재현하기 위한 원시 신호.
// Unity SendGate 가 실어보내며(구버전 빌드엔 없어 optional), RN 이 화면 매핑 후
// evaluateFaceCaptureGreenlight/evaluateFacePitchGate 로 판정한다.
//
// faceBox = ARKit face mesh 를 preview 카메라로 투영한 화면 바운딩박스.
// 정규화[0,1]·top-left 원점·미러 반영됨(RN 은 previewSize 만 곱하면 화면 좌표).
export type UnifiedFaceCaptureGateFaceBox = {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
};

export type UnifiedFaceCaptureGateGreenlight = {
  cameraStability: {isStable: boolean; stableDurationMs: number};
  // null = 이 프레임에 추적 얼굴 없음.
  faceBox: UnifiedFaceCaptureGateFaceBox | null;
  pose: {pitchDeg: number; rollDeg: number; valid: boolean; yawDeg: number};
};

export type UnifiedFaceCaptureGateEvent = {
  cameraReady: boolean;
  faceReady: boolean;
  finalCaptureGreenlight: boolean;
  greenlight?: UnifiedFaceCaptureGateGreenlight;
  hairline: {
    actionableReason?: HairlineActionableReason;
    confidence: number | null;
    frameToken: string | null;
    messageCode?:
      | 'show_hairline_for_full_ratio'
      | 'improve_lighting'
      | 'hold_still';
    sensorTimestampMs: number | null;
    stableDurationMs: number;
    status: HairlineAdvisoryStatus;
  };
  poseReady: boolean;
  requestId: string;
  type: 'unified_face_capture_gate';
};

export type UnifiedFaceCaptureResult = {
  cameraMetadata?: {
    exposureDurationMs?: number;
    iso?: number;
    provider: 'arfoundation';
    whiteBalanceAvailable: boolean;
  };
  captureId: string;
  face3d: Face3DProfileV3;
  goldenMask?: GoldenMaskCaptureArtifact;
  hairline: {
    analysisEligible: boolean;
    confidence: number | null;
    normalizedPoint?: {x: number; y: number};
    outcome:
      | 'detected_high_confidence'
      | 'detected_low_confidence'
      | 'omitted';
    provider:
      | 'apple_semantic_matte'
      | 'mediapipe_selfie_multiclass'
      | 'none';
    retryRecommendation: {
      attemptCount: 0 | 1;
      reason?: HairlineActionableReason;
      recommended: boolean;
    };
  };
  image: {
    format: 'jpg' | 'png';
    height: number;
    mirrored: false;
    orientation: 'upright';
    uri: string;
    width: number;
  };
  requestId: string;
  schemaVersion: typeof UNIFIED_FACE_CAPTURE_SCHEMA_VERSION;
  status: 'full_success' | 'partial_success';
  timestamps: {
    anchorFaceNativeTimestampMs?: number;
    burstEndObservedAtMs: number;
    burstStartObservedAtMs: number;
    cameraFrameToken: string;
    cameraObservedAtMs: number;
    cameraSensorTimestampMs: number;
    faceNativeFrameToken?: string;
    faceObservedAtMs: number;
    maxAbsFaceSensorDeltaMs: number;
    segmentationFrameToken?: string;
    segmentationSensorTimestampMs?: number;
  };
  warnings: string[];
};

export type UnifiedFaceCaptureCompletedEvent = UnifiedFaceCaptureResult & {
  type: 'unified_face_capture_completed';
};

export type UnifiedFaceCaptureBlockedReason =
  | 'camera_unavailable'
  | 'native_face_frame_sync_unavailable'
  | 'native_face_frame_sync_out_of_range'
  | 'insufficient_valid_frames'
  | 'multiple_faces'
  | 'unsupported_device'
  | 'capture_failed';

export type UnifiedFaceCaptureBlockedEvent = {
  detail?: string;
  reason: UnifiedFaceCaptureBlockedReason;
  requestId: string;
  type: 'unified_face_capture_blocked';
  warnings: string[];
};

export type UnifiedFaceCaptureCancelledEvent = {
  reason?: string;
  requestId: string;
  type: 'unified_face_capture_cancelled';
};

export type UnifiedFaceCaptureEvent =
  | UnifiedFaceCaptureGateEvent
  | UnifiedFaceCaptureCompletedEvent
  | UnifiedFaceCaptureBlockedEvent
  | UnifiedFaceCaptureCancelledEvent;

type PolicyDefinition = Pick<
  UnifiedFaceCaptureRequest,
  | 'maximumDurationMs'
  | 'minimumValidFrames'
  | 'sampleMode'
  | 'targetValidFrames'
>;

const POLICY_DEFINITIONS: Record<
  UnifiedFaceCaptureCollectionPolicyId,
  PolicyDefinition
> = {
  'unified-micro-burst-5of8-v1': {
    maximumDurationMs: 500,
    minimumValidFrames: 5,
    sampleMode: 'micro_burst',
    targetValidFrames: 8,
  },
  'diagnostics-exact-1-v1': {
    maximumDurationMs: 500,
    minimumValidFrames: 1,
    sampleMode: 'single_frame',
    targetValidFrames: 1,
  },
  'diagnostics-exact-3-v1': {
    maximumDurationMs: 500,
    minimumValidFrames: 3,
    sampleMode: 'micro_burst',
    targetValidFrames: 3,
  },
  'diagnostics-exact-5-v1': {
    maximumDurationMs: 500,
    minimumValidFrames: 5,
    sampleMode: 'micro_burst',
    targetValidFrames: 5,
  },
  'diagnostics-exact-8-v1': {
    maximumDurationMs: 500,
    minimumValidFrames: 8,
    sampleMode: 'micro_burst',
    targetValidFrames: 8,
  },
  'diagnostics-exact-12-v1': {
    maximumDurationMs: 750,
    minimumValidFrames: 12,
    sampleMode: 'micro_burst',
    targetValidFrames: 12,
  },
  'diagnostics-exact-30-v1': {
    maximumDurationMs: 3000,
    minimumValidFrames: 30,
    sampleMode: 'micro_burst',
    targetValidFrames: 30,
  },
};

const HAIRLINE_ADVISORY_STATUSES = new Set<HairlineAdvisoryStatus>([
  'likely_visible',
  'likely_occluded',
  'environment_issue',
  'unknown',
]);
const HAIRLINE_ACTIONABLE_REASONS = new Set<HairlineActionableReason>([
  'hairline_occluded',
  'low_light',
  'motion',
  'segmentation_temporarily_unavailable',
]);
const BLOCKED_REASONS = new Set<UnifiedFaceCaptureBlockedReason>([
  'camera_unavailable',
  'native_face_frame_sync_unavailable',
  'native_face_frame_sync_out_of_range',
  'insufficient_valid_frames',
  'multiple_faces',
  'unsupported_device',
  'capture_failed',
]);
const HAIRLINE_LOW_CONFIDENCE_MINIMUM = 0.45;
const HAIRLINE_HIGH_CONFIDENCE_MINIMUM = 0.7;
const SEGMENTATION_SENSOR_TIMESTAMP_TOLERANCE_MS = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readFiniteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

// pose 각도(yaw/roll)는 음수가 될 수 있어 부호를 허용하는 유한 리더가 필요하다.
function readFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readUnitInterval(value: unknown): number | null {
  const number = readFiniteNonNegative(value);
  return number !== null && number <= 1 ? number : null;
}

function readWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map(item => item.trim())
            .filter(Boolean),
        ),
      )
    : [];
}

function parseMessage(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(value) ? value : null;
}

function parsePoint(value: unknown): {x: number; y: number} | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = readUnitInterval(value.x);
  const y = readUnitInterval(value.y);
  return x === null || y === null ? null : {x, y};
}

export function createUnifiedFaceCaptureRequestId(now = Date.now()): string {
  return `unified-face-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildUnifiedFaceCaptureRequest({
  allowDiagnostics = false,
  collectionPolicyId = 'unified-micro-burst-5of8-v1',
  maxAbsFaceSensorDeltaMs = 40,
  requestId = createUnifiedFaceCaptureRequestId(),
  retryAttemptCount = 0,
}: {
  allowDiagnostics?: boolean;
  collectionPolicyId?: UnifiedFaceCaptureCollectionPolicyId;
  maxAbsFaceSensorDeltaMs?: number;
  requestId?: string;
  retryAttemptCount?: 0 | 1;
} = {}): UnifiedFaceCaptureRequest {
  if (!allowDiagnostics && collectionPolicyId !== 'unified-micro-burst-5of8-v1') {
    throw new Error('Diagnostics capture policy requires an explicit diagnostics gate.');
  }
  if (!requestId.trim()) {
    throw new Error('Unified capture requestId must not be empty.');
  }
  if (!Number.isFinite(maxAbsFaceSensorDeltaMs) || maxAbsFaceSensorDeltaMs < 0) {
    throw new Error('Unified capture native sensor delta limit must be non-negative.');
  }
  if (retryAttemptCount !== 0 && retryAttemptCount !== 1) {
    throw new Error('Unified capture retry attempt count must be 0 or 1.');
  }

  return {
    ...POLICY_DEFINITIONS[collectionPolicyId],
    collectionPolicyId,
    gateVersion: UNIFIED_FACE_CAPTURE_GATE_VERSION,
    hairlinePolicy: UNIFIED_FACE_CAPTURE_HAIRLINE_POLICY,
    maxAbsFaceSensorDeltaMs,
    requestId: requestId.trim(),
    retryAttemptCount,
  };
}

export function parseUnifiedFaceCaptureRequest(
  value: unknown,
): UnifiedFaceCaptureRequest | null {
  const payload = parseMessage(value);
  if (!payload) {
    return null;
  }

  const requestId = readString(payload.requestId);
  const collectionPolicyId = readString(payload.collectionPolicyId);
  const maxAbsFaceSensorDeltaMs = readFiniteNonNegative(
    payload.maxAbsFaceSensorDeltaMs,
  );
  const retryAttemptCount =
    payload.retryAttemptCount === 0 || payload.retryAttemptCount === 1
      ? payload.retryAttemptCount
      : null;
  if (
    !requestId ||
    !collectionPolicyId ||
    !(collectionPolicyId in POLICY_DEFINITIONS) ||
    maxAbsFaceSensorDeltaMs === null ||
    retryAttemptCount === null ||
    payload.gateVersion !== UNIFIED_FACE_CAPTURE_GATE_VERSION ||
    payload.hairlinePolicy !== UNIFIED_FACE_CAPTURE_HAIRLINE_POLICY
  ) {
    return null;
  }

  const policyId = collectionPolicyId as UnifiedFaceCaptureCollectionPolicyId;
  const policy = POLICY_DEFINITIONS[policyId];
  if (
    payload.maximumDurationMs !== policy.maximumDurationMs ||
    payload.minimumValidFrames !== policy.minimumValidFrames ||
    payload.sampleMode !== policy.sampleMode ||
    payload.targetValidFrames !== policy.targetValidFrames
  ) {
    return null;
  }

  return {
    ...policy,
    collectionPolicyId: policyId,
    gateVersion: UNIFIED_FACE_CAPTURE_GATE_VERSION,
    hairlinePolicy: UNIFIED_FACE_CAPTURE_HAIRLINE_POLICY,
    maxAbsFaceSensorDeltaMs,
    requestId,
    retryAttemptCount,
  };
}

export function isUnifiedFaceCaptureCompletionCompatible(
  result: UnifiedFaceCaptureCompletedEvent,
  request: UnifiedFaceCaptureRequest,
): boolean {
  if (result.hairline.retryRecommendation.attemptCount !== request.retryAttemptCount) {
    return false;
  }

  const faceTimestampDelta =
    result.timestamps.anchorFaceNativeTimestampMs === undefined
      ? null
      : Math.abs(
          result.timestamps.cameraSensorTimestampMs -
            result.timestamps.anchorFaceNativeTimestampMs,
        );

  return (
    result.requestId === request.requestId &&
    result.face3d.gateVersion === request.gateVersion &&
    result.face3d.collectionPolicyId === request.collectionPolicyId &&
    result.face3d.sampleMode === request.sampleMode &&
    result.face3d.targetFrameCount === request.targetValidFrames &&
    result.face3d.validFrameCount >= request.minimumValidFrames &&
    result.face3d.validFrameCount <= request.targetValidFrames &&
    result.face3d.captureWindowMs <= request.maximumDurationMs &&
    result.timestamps.maxAbsFaceSensorDeltaMs <=
      request.maxAbsFaceSensorDeltaMs &&
    (faceTimestampDelta === null ||
      faceTimestampDelta <= request.maxAbsFaceSensorDeltaMs)
  );
}

// greenlight 원시 신호 파싱. 구버전 Unity 빌드엔 이 필드가 없으므로 부재는
// null 반환(게이트 이벤트 자체는 유효 — 오버레이만 안 뜬다). pose 는 필수,
// faceBox 는 프레임에 추적 얼굴이 없으면 null 일 수 있다.
function parseGateGreenlight(
  value: unknown,
): UnifiedFaceCaptureGateGreenlight | null {
  if (!isRecord(value) || !isRecord(value.pose) || !isRecord(value.cameraStability)) {
    return null;
  }

  const yawDeg = readFinite(value.pose.yawDeg);
  const pitchDeg = readFinite(value.pose.pitchDeg);
  const rollDeg = readFinite(value.pose.rollDeg);
  if (yawDeg === null || pitchDeg === null || rollDeg === null) {
    return null;
  }

  const isStable = value.cameraStability.isStable;
  const stableDurationMs = readFiniteNonNegative(value.cameraStability.stableDurationMs);
  if (typeof isStable !== 'boolean' || stableDurationMs === null) {
    return null;
  }

  let faceBox: UnifiedFaceCaptureGateFaceBox | null = null;
  if (isRecord(value.faceBox)) {
    const centerX = readFinite(value.faceBox.centerX);
    const centerY = readFinite(value.faceBox.centerY);
    const width = readFiniteNonNegative(value.faceBox.width);
    const height = readFiniteNonNegative(value.faceBox.height);
    if (centerX !== null && centerY !== null && width !== null && height !== null) {
      faceBox = {centerX, centerY, height, width};
    }
  }

  return {
    cameraStability: {isStable, stableDurationMs},
    faceBox,
    pose: {pitchDeg, rollDeg, valid: value.pose.valid === true, yawDeg},
  };
}

function parseGateEvent(
  payload: Record<string, unknown>,
  requestId: string,
): UnifiedFaceCaptureGateEvent | null {
  if (!isRecord(payload.hairline)) {
    return null;
  }
  const hairline = payload.hairline;
  const status = readString(hairline.status);
  const confidence =
    hairline.confidence === null ? null : readUnitInterval(hairline.confidence);
  const stableDurationMs = readFiniteNonNegative(hairline.stableDurationMs);
  const frameToken = hairline.frameToken === null ? null : readString(hairline.frameToken);
  const sensorTimestampMs =
    hairline.sensorTimestampMs === null
      ? null
      : readFiniteNonNegative(hairline.sensorTimestampMs);
  const actionableReason = readString(hairline.actionableReason);
  const messageCode = readString(hairline.messageCode);

  if (
    typeof payload.cameraReady !== 'boolean' ||
    typeof payload.faceReady !== 'boolean' ||
    typeof payload.poseReady !== 'boolean' ||
    typeof payload.finalCaptureGreenlight !== 'boolean' ||
    !status ||
    !HAIRLINE_ADVISORY_STATUSES.has(status as HairlineAdvisoryStatus) ||
    (hairline.confidence !== null && confidence === null) ||
    stableDurationMs === null ||
    (hairline.frameToken !== null && !frameToken) ||
    (hairline.sensorTimestampMs !== null && sensorTimestampMs === null) ||
    (actionableReason !== null &&
      !HAIRLINE_ACTIONABLE_REASONS.has(actionableReason as HairlineActionableReason)) ||
    (messageCode !== null &&
      !['show_hairline_for_full_ratio', 'improve_lighting', 'hold_still'].includes(
        messageCode,
      )) ||
    (payload.finalCaptureGreenlight &&
      !(payload.cameraReady && payload.faceReady && payload.poseReady))
  ) {
    return null;
  }

  // Unity SendGate 는 pose/landmarks/faceWidthRatio/cameraStability 를 gate 의
  // 최상위 필드로 내보낸다(중첩 greenlight 래퍼 없음). payload 자체를 넘긴다.
  const greenlight = parseGateGreenlight(payload);

  return {
    cameraReady: payload.cameraReady,
    faceReady: payload.faceReady,
    finalCaptureGreenlight: payload.finalCaptureGreenlight,
    ...(greenlight ? {greenlight} : {}),
    hairline: {
      ...(actionableReason
        ? {actionableReason: actionableReason as HairlineActionableReason}
        : {}),
      confidence,
      frameToken,
      ...(messageCode
        ? {
            messageCode: messageCode as UnifiedFaceCaptureGateEvent['hairline']['messageCode'],
          }
        : {}),
      sensorTimestampMs,
      stableDurationMs,
      status: status as HairlineAdvisoryStatus,
    },
    poseReady: payload.poseReady,
    requestId,
    type: 'unified_face_capture_gate',
  };
}

function parseCompletedEvent(
  payload: Record<string, unknown>,
  requestId: string,
): UnifiedFaceCaptureCompletedEvent | null {
  if (
    payload.schemaVersion !== UNIFIED_FACE_CAPTURE_SCHEMA_VERSION ||
    !isRecord(payload.image) ||
    !isRecord(payload.timestamps) ||
    !isRecord(payload.hairline)
  ) {
    return null;
  }

  const captureId = readString(payload.captureId);
  const image = payload.image;
  const uri = readString(image.uri);
  const width = readPositiveInteger(image.width);
  const height = readPositiveInteger(image.height);
  const timestamps = payload.timestamps;
  const cameraFrameToken = readString(timestamps.cameraFrameToken);
  const cameraSensorTimestampMs = readFiniteNonNegative(
    timestamps.cameraSensorTimestampMs,
  );
  const cameraObservedAtMs = readFiniteNonNegative(timestamps.cameraObservedAtMs);
  const faceObservedAtMs = readFiniteNonNegative(timestamps.faceObservedAtMs);
  const burstStartObservedAtMs = readFiniteNonNegative(
    timestamps.burstStartObservedAtMs,
  );
  const burstEndObservedAtMs = readFiniteNonNegative(timestamps.burstEndObservedAtMs);
  const maxAbsFaceSensorDeltaMs = readFiniteNonNegative(
    timestamps.maxAbsFaceSensorDeltaMs,
  );
  const faceNativeFrameToken = readString(timestamps.faceNativeFrameToken);
  const anchorFaceNativeTimestampMs = readFiniteNonNegative(
    timestamps.anchorFaceNativeTimestampMs,
  );
  const segmentationFrameToken = readString(timestamps.segmentationFrameToken);
  const segmentationSensorTimestampMs = readFiniteNonNegative(
    timestamps.segmentationSensorTimestampMs,
  );
  const parsedFace3D = parseFace3DProfile(payload.face3d);
  const parsedGoldenMask =
    payload.goldenMask === undefined || payload.goldenMask === null
      ? null
      : parseGoldenMaskCaptureArtifact(payload.goldenMask);
  const goldenMask =
    parsedGoldenMask?.captureId === captureId &&
    parsedGoldenMask.trueDepthHardware
      ? parsedGoldenMask
      : null;

  if (
    (payload.status !== 'full_success' && payload.status !== 'partial_success') ||
    !captureId ||
    !uri ||
    width === null ||
    height === null ||
    (image.format !== 'jpg' && image.format !== 'png') ||
    image.orientation !== 'upright' ||
    image.mirrored !== false ||
    !cameraFrameToken ||
    cameraSensorTimestampMs === null ||
    cameraObservedAtMs === null ||
    faceObservedAtMs === null ||
    burstStartObservedAtMs === null ||
    burstEndObservedAtMs === null ||
    burstEndObservedAtMs < burstStartObservedAtMs ||
    maxAbsFaceSensorDeltaMs === null ||
    (timestamps.faceNativeFrameToken !== undefined && !faceNativeFrameToken) ||
    (timestamps.anchorFaceNativeTimestampMs !== undefined &&
      anchorFaceNativeTimestampMs === null) ||
    (timestamps.segmentationFrameToken !== undefined && !segmentationFrameToken) ||
    (timestamps.segmentationSensorTimestampMs !== undefined &&
      segmentationSensorTimestampMs === null) ||
    (!faceNativeFrameToken && anchorFaceNativeTimestampMs === null) ||
    !parsedFace3D ||
    parsedFace3D.schemaVersion !== 'aura.face3d-profile.v3'
  ) {
    return null;
  }

  const rawHairline = payload.hairline;
  const rawProvider = readString(rawHairline.provider);
  const rawOutcome = readString(rawHairline.outcome);
  const rawConfidence =
    rawHairline.confidence === null
      ? null
      : readUnitInterval(rawHairline.confidence);
  const rawPoint = parsePoint(rawHairline.normalizedPoint);
  const retry = rawHairline.retryRecommendation;
  if (
    !rawProvider ||
    !['apple_semantic_matte', 'mediapipe_selfie_multiclass', 'none'].includes(
      rawProvider,
    ) ||
    !rawOutcome ||
    !['detected_high_confidence', 'detected_low_confidence', 'omitted'].includes(
      rawOutcome,
    ) ||
    typeof rawHairline.analysisEligible !== 'boolean' ||
    (rawHairline.confidence !== null && rawConfidence === null) ||
    !isRecord(retry) ||
    typeof retry.recommended !== 'boolean' ||
    (retry.attemptCount !== 0 && retry.attemptCount !== 1)
  ) {
    return null;
  }

  const retryReason = readString(retry.reason);
  if (
    (retryReason !== null &&
      !HAIRLINE_ACTIONABLE_REASONS.has(retryReason as HairlineActionableReason)) ||
    (retry.recommended && (!retryReason || retry.attemptCount !== 0)) ||
    (!retry.recommended && retryReason !== null) ||
    (retry.recommended &&
      (rawOutcome !== 'omitted' || rawProvider !== 'none'))
  ) {
    return null;
  }

  const detectedHairlineTokenMatches =
    rawProvider === 'none' ||
    (Boolean(segmentationFrameToken) && segmentationFrameToken === cameraFrameToken);
  const detectedHairlineSensorTimestampMatches =
    rawProvider === 'none' ||
    (segmentationSensorTimestampMs !== null &&
      Math.abs(segmentationSensorTimestampMs - cameraSensorTimestampMs) <=
        SEGMENTATION_SENSOR_TIMESTAMP_TOLERANCE_MS);
  const detectedHairlineEvidenceMatches =
    detectedHairlineTokenMatches && detectedHairlineSensorTimestampMatches;
  const hasValidDetectedHairline =
    rawProvider !== 'none' && rawConfidence !== null && rawPoint !== null;
  const highConfidenceClaimIsValid =
    rawOutcome === 'detected_high_confidence' &&
    rawHairline.analysisEligible === true &&
    rawConfidence !== null &&
    rawConfidence >= HAIRLINE_HIGH_CONFIDENCE_MINIMUM &&
    hasValidDetectedHairline &&
    detectedHairlineEvidenceMatches;
  const lowConfidenceClaimIsValid =
    rawOutcome === 'detected_low_confidence' &&
    rawHairline.analysisEligible === false &&
    rawConfidence !== null &&
    rawConfidence >= HAIRLINE_LOW_CONFIDENCE_MINIMUM &&
    rawConfidence < HAIRLINE_HIGH_CONFIDENCE_MINIMUM &&
    hasValidDetectedHairline &&
    detectedHairlineEvidenceMatches;
  const omittedClaimIsValid =
    rawOutcome === 'omitted' &&
    rawProvider === 'none' &&
    rawHairline.analysisEligible === false &&
    rawHairline.confidence === null &&
    rawHairline.normalizedPoint === undefined;

  if (
    detectedHairlineEvidenceMatches &&
    !highConfidenceClaimIsValid &&
    !lowConfidenceClaimIsValid &&
    !omittedClaimIsValid
  ) {
    return null;
  }

  const warnings = readWarnings(payload.warnings);
  if (
    payload.goldenMask !== undefined &&
    payload.goldenMask !== null &&
    !goldenMask
  ) {
    warnings.push('golden_mask_contract_invalid');
  }
  const shouldOmitForEvidenceMismatch =
    rawProvider !== 'none' && !detectedHairlineEvidenceMatches;
  if (!detectedHairlineTokenMatches) {
    warnings.push('hairline_frame_token_mismatch');
  }
  if (!detectedHairlineSensorTimestampMatches) {
    warnings.push('hairline_sensor_timestamp_mismatch');
  }
  const normalizedWarnings = Array.from(new Set(warnings));
  const normalizedHairline: UnifiedFaceCaptureResult['hairline'] =
    shouldOmitForEvidenceMismatch
      ? {
          analysisEligible: false,
          confidence: null,
          outcome: 'omitted',
          provider: 'none',
          retryRecommendation: {
            attemptCount: retry.attemptCount,
            ...(retryReason
              ? {reason: retryReason as HairlineActionableReason}
              : {}),
            recommended: retry.recommended,
          },
        }
      : {
          analysisEligible: rawHairline.analysisEligible,
          confidence: rawConfidence,
          ...(rawPoint ? {normalizedPoint: rawPoint} : {}),
          outcome: rawOutcome as UnifiedFaceCaptureResult['hairline']['outcome'],
          provider: rawProvider as UnifiedFaceCaptureResult['hairline']['provider'],
          retryRecommendation: {
            attemptCount: retry.attemptCount,
            ...(retryReason
              ? {reason: retryReason as HairlineActionableReason}
              : {}),
            recommended: retry.recommended,
          },
        };

  let cameraMetadata: UnifiedFaceCaptureResult['cameraMetadata'];
  if (payload.cameraMetadata !== undefined) {
    if (!isRecord(payload.cameraMetadata) || payload.cameraMetadata.provider !== 'arfoundation') {
      return null;
    }
    const exposureDurationMs = readFiniteNonNegative(
      payload.cameraMetadata.exposureDurationMs,
    );
    const iso = readFiniteNonNegative(payload.cameraMetadata.iso);
    if (
      typeof payload.cameraMetadata.whiteBalanceAvailable !== 'boolean' ||
      (payload.cameraMetadata.exposureDurationMs !== undefined &&
        exposureDurationMs === null) ||
      (payload.cameraMetadata.iso !== undefined && iso === null)
    ) {
      return null;
    }
    cameraMetadata = {
      ...(exposureDurationMs !== null ? {exposureDurationMs} : {}),
      ...(iso !== null ? {iso} : {}),
      provider: 'arfoundation',
      whiteBalanceAvailable: payload.cameraMetadata.whiteBalanceAvailable,
    };
  }

  const normalizedStatus: UnifiedFaceCaptureResult['status'] =
    normalizedHairline.analysisEligible && payload.status === 'full_success'
      ? 'full_success'
      : 'partial_success';

  return {
    ...(cameraMetadata ? {cameraMetadata} : {}),
    captureId,
    face3d: parsedFace3D,
    ...(goldenMask ? {goldenMask} : {}),
    hairline: normalizedHairline,
    image: {
      format: image.format,
      height,
      mirrored: false,
      orientation: 'upright',
      uri,
      width,
    },
    requestId,
    schemaVersion: UNIFIED_FACE_CAPTURE_SCHEMA_VERSION,
    status: normalizedStatus,
    timestamps: {
      ...(anchorFaceNativeTimestampMs !== null
        ? {anchorFaceNativeTimestampMs}
        : {}),
      burstEndObservedAtMs,
      burstStartObservedAtMs,
      cameraFrameToken,
      cameraObservedAtMs,
      cameraSensorTimestampMs,
      ...(faceNativeFrameToken ? {faceNativeFrameToken} : {}),
      faceObservedAtMs,
      maxAbsFaceSensorDeltaMs,
      ...(segmentationFrameToken ? {segmentationFrameToken} : {}),
      ...(segmentationSensorTimestampMs !== null
        ? {segmentationSensorTimestampMs}
        : {}),
    },
    type: 'unified_face_capture_completed',
    warnings: normalizedWarnings,
  };
}

export function parseUnifiedFaceCaptureEvent(
  value: unknown,
): UnifiedFaceCaptureEvent | null {
  const payload = parseMessage(value);
  if (!payload) {
    return null;
  }
  const requestId = readString(payload.requestId);
  if (!requestId) {
    return null;
  }

  if (payload.type === 'unified_face_capture_gate') {
    return parseGateEvent(payload, requestId);
  }
  if (payload.type === 'unified_face_capture_completed') {
    return parseCompletedEvent(payload, requestId);
  }
  if (payload.type === 'unified_face_capture_blocked') {
    const reason = readString(payload.reason);
    if (!reason || !BLOCKED_REASONS.has(reason as UnifiedFaceCaptureBlockedReason)) {
      return null;
    }
    return {
      ...(readString(payload.detail) ? {detail: readString(payload.detail)!} : {}),
      reason: reason as UnifiedFaceCaptureBlockedReason,
      requestId,
      type: 'unified_face_capture_blocked',
      warnings: readWarnings(payload.warnings),
    };
  }
  if (payload.type === 'unified_face_capture_cancelled') {
    return {
      ...(readString(payload.reason) ? {reason: readString(payload.reason)!} : {}),
      requestId,
      type: 'unified_face_capture_cancelled',
    };
  }

  return null;
}
