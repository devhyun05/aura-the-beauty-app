import type {Face3DMetricKey, Face3DProfile} from '../types';
import {
  buildFace3DStartRequest,
  parseFace3DEvent,
  parseFace3DProfile,
} from './face3DContract';
import {
  INITIAL_FACE_3D_ANALYSIS_STATE,
  reduceFace3DAnalysisState,
} from './face3DState';
import {
  FACE_3D_NATIVE_CAPTURE_REQUIRED_MESSAGE,
  evaluateFace3DEntryEligibility,
} from './face3DEntryEligibility';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label);
  }
}

const METRIC_KEYS: Face3DMetricKey[] = [
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
];

function createProfile(): Face3DProfile {
  const metrics = Object.fromEntries(
    METRIC_KEYS.map((key, index) => [
      key,
      {
        confidence: 0.92 - index * 0.02,
        mad: 0.003 + index * 0.001,
        unit: 'normalized' as const,
        validFrameCount: 27,
        value: 0.12 + index * 0.03,
      },
    ]),
  ) as Face3DProfile['metrics'];

  return {
    gateVersion: 'face3d-gate-v1',
    metrics,
    schemaVersion: 'aura.face3d-profile.v1',
    source: 'arkit_face_mesh',
    targetFrameCount: 30,
    topologyFingerprint: 'synthetic-v8-i12-uv8-a1b2c3d4',
    validFrameCount: 27,
    warnings: ['slight_yaw'],
  };
}

const request = buildFace3DStartRequest('face3d-contract-1');
expectEqual(request.requestId, 'face3d-contract-1', 'request id');
expectEqual(request.targetValidFrames, 30, 'target valid frames');
expectEqual(request.minimumValidFrames, 20, 'minimum valid frames');
expectEqual(request.maximumDurationMs, 3000, 'maximum duration');
expectEqual(request.gateVersion, 'face3d-gate-v1', 'gate version');

const statusEvent = parseFace3DEvent(
  JSON.stringify({
    message: '유효 프레임 수집 중',
    requestId: request.requestId,
    status: 'collecting',
    currentMaximumFaceCount: 2,
    meshIndexCount: 12,
    meshUvCount: 8,
    meshVertexCount: 8,
    supportedFaceCount: 3,
    targetFrameCount: 30,
    topologyFingerprint: 'synthetic-v8-i12-uv8-a1b2c3d4',
    type: 'face3d_status',
    validFrameCount: 12,
    warnings: ['slight_yaw', 'slight_yaw'],
  }),
);
expectEqual(statusEvent?.type, 'face3d_status', 'canonical status event type');
expectEqual(
  statusEvent?.type === 'face3d_status' ? statusEvent.validFrameCount : -1,
  12,
  'status progress',
);
expectEqual(
  statusEvent?.type === 'face3d_status' ? statusEvent.warnings.length : -1,
  1,
  'warning de-duplication',
);

const camelStatusEvent = parseFace3DEvent({
  detail: '얼굴 추적 중',
  requestId: request.requestId,
  status: 'tracking',
  type: 'face3DStatus',
});
expectEqual(camelStatusEvent?.type, 'face3d_status', 'camel status compatibility');
expectEqual(
  camelStatusEvent?.type === 'face3d_status' ? camelStatusEvent.message : undefined,
  '얼굴 추적 중',
  'status detail fallback',
);

const profile = createProfile();
const analyzedEvent = parseFace3DEvent({
  profile,
  requestId: request.requestId,
  type: 'face3DAnalyzed',
});
expectEqual(analyzedEvent?.type, 'face3d_analyzed', 'camel analyzed compatibility');
expectEqual(
  analyzedEvent?.type === 'face3d_analyzed'
    ? analyzedEvent.profile.metrics.noseTipProjection.value
    : null,
  profile.metrics.noseTipProjection.value,
  'analyzed metric value',
);

expectEqual(parseFace3DEvent('{bad-json'), null, 'malformed event ignored');
expectEqual(
  parseFace3DEvent({status: 'tracking', type: 'face3d_status'}),
  null,
  'event without request id ignored',
);

const invalidProfile = {
  ...profile,
  metrics: {...profile.metrics, lowerLipToELine: undefined},
};
expectEqual(parseFace3DProfile(invalidProfile), null, 'missing metric rejected');
expectEqual(
  parseFace3DProfile({...profile, schemaVersion: 'aura.face3d-profile.v0'}),
  null,
  'unknown schema rejected',
);

let state = reduceFace3DAnalysisState(INITIAL_FACE_3D_ANALYSIS_STATE, {
  request,
  type: 'start_requested',
});
expectEqual(state.status, 'preparing', 'state starts preparing');
expectEqual(state.targetFrameCount, 30, 'state target set from request');

const staleEvent = parseFace3DEvent({
  requestId: 'face3d-stale',
  status: 'collecting',
  targetFrameCount: 30,
  type: 'face3d_status',
  validFrameCount: 29,
});
expect(Boolean(staleEvent), 'stale event fixture parses');
const stateBeforeStale = state;
state = reduceFace3DAnalysisState(state, {
  event: staleEvent!,
  type: 'event_received',
});
expectEqual(state, stateBeforeStale, 'stale request event ignored');

expect(Boolean(statusEvent), 'status event fixture parses');
state = reduceFace3DAnalysisState(state, {
  event: statusEvent!,
  type: 'event_received',
});
expectEqual(state.status, 'collecting', 'collecting event updates state');
expectEqual(state.validFrameCount, 12, 'collecting event updates progress');
expectEqual(state.meshVertexCount, 8, 'status stores mesh vertex count');
expectEqual(
  state.topologyFingerprint,
  'synthetic-v8-i12-uv8-a1b2c3d4',
  'status stores topology fingerprint before profile',
);

expect(Boolean(analyzedEvent), 'analyzed event fixture parses');
state = reduceFace3DAnalysisState(state, {
  event: analyzedEvent!,
  type: 'event_received',
});
expectEqual(state.status, 'completed', 'analyzed event completes state');
expectEqual(state.profile?.topologyFingerprint, profile.topologyFingerprint, 'profile stored');
expectEqual(state.warnings[0], 'slight_yaw', 'profile warnings stored');

const nativeGreenlight = {
  cameraStabilityGreenlight: true,
  failureReasons: [],
  finalCaptureGreenlight: true,
  mediaPipeAlignmentGreenlight: true,
  message: '좋아요. 촬영할 수 있어요',
  metrics: {},
  nativeCameraMetadata: {status: 'ok' as const},
};
expectEqual(
  evaluateFace3DEntryEligibility({
    greenlightReport: nativeGreenlight,
    source: 'camera',
  }).eligible,
  true,
  'native greenlight capture is eligible',
);
const galleryEligibility = evaluateFace3DEntryEligibility({
  source: 'gallery',
});
expectEqual(galleryEligibility.eligible, false, 'gallery capture is blocked');
expectEqual(
  galleryEligibility.eligible ? '' : galleryEligibility.message,
  FACE_3D_NATIVE_CAPTURE_REQUIRED_MESSAGE,
  'gallery block guidance',
);
expectEqual(
  evaluateFace3DEntryEligibility({
    greenlightReport: {...nativeGreenlight, nativeCameraMetadata: undefined},
    source: 'camera',
  }).eligible,
  false,
  'expo camera capture without native metadata is blocked',
);
