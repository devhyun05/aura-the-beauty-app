import type {Face3DMetricKey, Face3DProfile} from '../types';
import {
  FACE_3D_CALIBRATION_PROMOTION_ENABLED,
  buildFace3DStartRequest,
  isFace3DProfileAnalysisEligible,
  parseFace3DEvent,
  parseFace3DProfile,
  parseTrustedServerFace3DProfile,
} from './face3DContract';
import {adaptFace3DRuntimeEvidence} from './face3DUnifiedEvidenceAdapter';
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

function createV2Profile(overrides: Record<string, unknown> = {}) {
  const metrics = Object.fromEntries(
    METRIC_KEYS.map((key, index) => [
      key,
      {
        confidence: 0.8 - index * 0.02,
        mad: 0.004 + index * 0.001,
        unit: 'normalized' as const,
        validFrameCount: 7,
        value: 0.1 + index * 0.02,
      },
    ]),
  );

  return {
    aggregation: 'median_mad',
    captureWindowMs: 420,
    collectionPolicyId: 'unified-micro-burst-5of8-v1',
    completionRatio: 7 / 8,
    confidenceCalibrationStatus: 'uncalibrated',
    gateVersion: 'face3d-gate-v2',
    metrics,
    sampleMode: 'micro_burst',
    schemaVersion: 'aura.face3d-profile.v2',
    source: 'arkit_face_mesh',
    targetFrameCount: 8,
    topologyFingerprint: 'synthetic-v8-i12-uv8-v2',
    validFrameCount: 7,
    warnings: ['micro_burst_target_not_reached'],
    ...overrides,
  };
}

function createV3Profile(overrides: Record<string, unknown> = {}) {
  const metrics = Object.fromEntries(
    METRIC_KEYS.map((key, index) => [
      key,
      {
        confidence: 0.8 - index * 0.02,
        mad: 0.004 + index * 0.001,
        unit: 'normalized' as const,
        validFrameCount: 7,
        value: 0.1 + index * 0.02,
        valueMm: 2.1 + index * 0.2,
        valueMmConfidence: 0.72 - index * 0.01,
        valueMmMad: 0.11 + index * 0.01,
        valueMmValidFrameCount: 6,
      },
    ]),
  );

  return {
    aggregation: 'median_mad',
    calibrationReceipt: null,
    captureNonce: 'capture-nonce-v3',
    captureWindowMs: 420,
    collectionPolicyId: 'unified-micro-burst-5of8-v1',
    completionRatio: 7 / 8,
    confidenceCalibrationStatus: 'uncalibrated',
    gateVersion: 'face3d-gate-v2',
    metrics,
    profileBindingSha256: null,
    sampleMode: 'micro_burst',
    schemaVersion: 'aura.face3d-profile.v3',
    sensorProvenance: {
      depthDataObservedRatio: null,
      deviceModel: null,
      faceTrackingSupported: null,
      trueDepthHardware: null,
    },
    source: 'arkit_face_mesh',
    targetFrameCount: 8,
    topologyFingerprint: 'synthetic-v8-i12-uv8-v3',
    validFrameCount: 7,
    warnings: ['micro_burst_target_not_reached'],
    ...overrides,
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
for (const [field, fieldValue] of [
  ['valueMm', 2.1],
  ['valueMmConfidence', 0.7],
  ['valueMmMad', 0.1],
  ['valueMmValidFrameCount', 20],
] as const) {
  expectEqual(
    parseFace3DProfile({
      ...profile,
      metrics: {
        ...profile.metrics,
        noseTipProjection: {
          ...profile.metrics.noseTipProjection,
          [field]: fieldValue,
        },
      },
    }),
    null,
    `v1 profile with ${field} is rejected fail-closed`,
  );
}

const v2Profile = parseFace3DProfile(createV2Profile());
expectEqual(v2Profile?.schemaVersion, 'aura.face3d-profile.v2', 'v2 schema parses');
expectEqual(
  v2Profile?.schemaVersion === 'aura.face3d-profile.v2'
    ? v2Profile.collectionPolicyId
    : null,
  'unified-micro-burst-5of8-v1',
  'v2 collection policy preserved',
);
expectEqual(
  isFace3DProfileAnalysisEligible(v2Profile),
  false,
  'legacy v2 is never product-analysis eligible',
);
const calibratedLegacyV2Profile = parseFace3DProfile(
  createV2Profile({confidenceCalibrationStatus: 'calibrated'}),
);
expectEqual(
  calibratedLegacyV2Profile?.schemaVersion,
  'aura.face3d-profile.v2',
  'legacy calibrated v2 remains wire-compatible',
);
expectEqual(
  isFace3DProfileAnalysisEligible(calibratedLegacyV2Profile),
  false,
  'legacy calibrated v2 cannot bypass v3 promotion',
);
const v2WithMisversionedMillimeters = parseFace3DProfile({
  ...createV2Profile(),
  calibrationReceipt: null,
  captureNonce: 'misversioned-v2-nonce',
  metrics: Object.fromEntries(
    METRIC_KEYS.map((key, index) => [
      key,
      {
        ...((createV2Profile().metrics as Record<string, unknown>)[
          key
        ] as Record<string, unknown>),
        valueMm: 2.1 + index * 0.2,
        valueMmConfidence: 0.7,
        valueMmMad: 0.1,
        valueMmValidFrameCount: 6,
      },
    ]),
  ),
  profileBindingSha256: null,
  sensorProvenance: {
    depthDataObservedRatio: 1,
    deviceModel: 'iPhone-test',
    faceTrackingSupported: true,
    trueDepthHardware: true,
  },
});
expectEqual(
  v2WithMisversionedMillimeters?.metrics.noseTipProjection.valueMm,
  undefined,
  'legacy v2 parser never carries v3-only millimeter fields',
);
expectEqual(
  Boolean(
    v2WithMisversionedMillimeters &&
      'captureNonce' in v2WithMisversionedMillimeters,
  ),
  false,
  'legacy v2 parser never carries v3-only trust fields',
);

const v3Profile = parseFace3DProfile(createV3Profile());
expectEqual(v3Profile?.schemaVersion, 'aura.face3d-profile.v3', 'v3 schema parses');
expectEqual(
  v3Profile?.metrics.noseTipProjection.valueMm,
  2.1,
  'v3 millimeter value is preserved without user exposure',
);
expectEqual(
  v3Profile?.metrics.noseTipProjection.valueMmValidFrameCount,
  6,
  'v3 millimeter quality preserves its independent inlier count',
);
expectEqual(
  v3Profile?.metrics.noseTipProjection.valueMmConfidence,
  0.72,
  'v3 millimeter quality does not reuse normalized confidence',
);
expectEqual(
  isFace3DProfileAnalysisEligible(v3Profile),
  false,
  'uncalibrated v3 micro-burst is not product-analysis eligible',
);
const profileBindingSha256 = 'a'.repeat(64);
const calibrationReceipt = {
  appBuild: 'ios-20260717.1',
  approvalArtifactSha256: 'b'.repeat(64),
  captureNonce: 'capture-nonce-v3',
  collectionPolicyId: 'unified-micro-burst-5of8-v1',
  expiresAtUtc: '2026-07-18T00:00:00.000Z',
  gateVersion: 'face3d-gate-v2',
  issuedAtUtc: '2026-07-17T00:00:00.000Z',
  profileBindingSha256,
  receiptId: 'receipt-v3-1',
  reportContextId: 'report-context-1',
  signature: 'c'.repeat(64),
  signatureAlgorithm: 'hmac-sha256-v1',
  signingKeyId: 'face3d-calibration-key-1',
  subjectContextId: 'subject-context-1',
};
const calibratedServerProfilePayload = createV3Profile({
  calibrationReceipt,
  confidenceCalibrationStatus: 'calibrated',
  profileBindingSha256,
  serverCalibrationReceiptStatus: 'verified',
  sensorProvenance: {
    depthDataObservedRatio: 1,
    deviceModel: 'iPhone-test',
    faceTrackingSupported: true,
    trueDepthHardware: true,
  },
});
expectEqual(
  parseFace3DProfile(calibratedServerProfilePayload),
  null,
  'device parser rejects forged backend-only receipt status',
);
const calibratedV3Profile = parseTrustedServerFace3DProfile(
  calibratedServerProfilePayload,
);
expectEqual(
  calibratedV3Profile?.schemaVersion === 'aura.face3d-profile.v3'
    ? calibratedV3Profile.serverCalibrationReceiptStatus
    : undefined,
  'verified',
  'trusted backend detail parser retains server receipt status',
);
expectEqual(
  FACE_3D_CALIBRATION_PROMOTION_ENABLED,
  false,
  'calibration promotion remains default off before Gate 6B approval',
);
expectEqual(
  isFace3DProfileAnalysisEligible(calibratedV3Profile),
  false,
  'signed calibrated v3 remains blocked while promotion flag is off',
);
expectEqual(
  parseFace3DProfile(
    createV3Profile({confidenceCalibrationStatus: 'calibrated'}),
  ),
  null,
  'v3 calibrated status without a bound signed receipt is rejected',
);
expectEqual(
  parseFace3DProfile(
    createV3Profile({
      calibrationReceipt: {...calibrationReceipt, captureNonce: 'replayed-nonce'},
      confidenceCalibrationStatus: 'calibrated',
      profileBindingSha256,
    }),
  ),
  null,
  'receipt capture nonce must bind to the profile capture nonce',
);
expectEqual(
  parseFace3DProfile(createV3Profile({gateVersion: 'face3d-gate-v1'})),
  null,
  'v3 profile with legacy gate rejected',
);
expectEqual(
  parseFace3DProfile(createV3Profile({validFrameCount: 4, completionRatio: 0.5})),
  null,
  'v3 product micro-burst below five valid frames rejected',
);
expectEqual(
  parseFace3DProfile(createV3Profile({captureWindowMs: 501})),
  null,
  'v3 product micro-burst beyond 500ms rejected',
);
expectEqual(
  parseFace3DProfile(createV3Profile({completionRatio: 1})),
  null,
  'v3 inconsistent completion ratio rejected',
);
expectEqual(
  parseFace3DProfile({
    ...createV3Profile(),
    metrics: {
      ...(createV3Profile().metrics as Record<string, unknown>),
      noseLength: {
        confidence: 0.8,
        mad: 0.004,
        unit: 'normalized',
        validFrameCount: 7,
        value: 0.2,
        valueMm: 'malformed',
        valueMmConfidence: 0.7,
        valueMmMad: 0.1,
        valueMmValidFrameCount: 6,
      },
    },
  }),
  null,
  'v3 present-but-malformed optional metric rejects the whole profile',
);

const singleFrameProfile = parseFace3DProfile(
  createV3Profile({
    aggregation: 'none',
    captureWindowMs: 0,
    collectionPolicyId: 'diagnostics-exact-1-v1',
    completionRatio: 1,
    metrics: Object.fromEntries(
      METRIC_KEYS.map((key, index) => [
        key,
        {
          confidence: 0,
          mad: null,
          unit: 'normalized',
          validFrameCount: 1,
          value: 0.1 + index * 0.02,
          valueMm: 2 + index * 0.2,
          valueMmConfidence: 0,
          valueMmMad: null,
          valueMmValidFrameCount: 1,
        },
      ]),
    ),
    sampleMode: 'single_frame',
    targetFrameCount: 1,
    validFrameCount: 1,
    warnings: ['single_frame_unaggregated'],
  }),
);
expectEqual(
  singleFrameProfile?.schemaVersion,
  'aura.face3d-profile.v3',
  'v3 diagnostics single-frame profile parses',
);
expectEqual(
  isFace3DProfileAnalysisEligible(singleFrameProfile),
  false,
  'single-frame diagnostics never enters product analysis',
);
expectEqual(
  parseFace3DProfile({
    ...createV3Profile(),
    metrics: Object.fromEntries(
      METRIC_KEYS.map((key, index) => [
        key,
        {
          confidence: 0.8,
          mad: 0.004,
          unit: 'normalized',
          validFrameCount: 7,
          value: 0.1 + index * 0.02,
          valueMm: 2 + index * 0.2,
        },
      ]),
    ),
  }),
  null,
  'v3 profile without independent millimeter quality metadata is rejected',
);
expectEqual(
  parseFace3DProfile({
    ...createV3Profile(),
    metrics: Object.fromEntries(
      METRIC_KEYS.map((key, index) => [
        key,
        {
          confidence: 0.8,
          mad: 0.004,
          unit: 'normalized',
          validFrameCount: 7,
          value: 0.1 + index * 0.02,
          valueMm: 2 + index * 0.2,
          valueMmConfidence: 0.2,
          valueMmMad: 4.5,
          valueMmValidFrameCount: 4,
        },
      ]),
    ),
  }),
  null,
  'product valueMm is rejected when raw inliers are below the 5-frame minimum',
);
expectEqual(
  parseFace3DProfile({
    ...createV3Profile(),
    metrics: Object.fromEntries(
      METRIC_KEYS.map((key, index) => [
        key,
        {
          confidence: 0.8,
          mad: 0.004,
          unit: 'normalized',
          validFrameCount: 7,
          value: 0.1 + index * 0.02,
          valueMm: null,
          valueMmConfidence: 0.2,
          valueMmMad: 4.5,
          valueMmValidFrameCount: 4,
        },
      ]),
    ),
  })?.schemaVersion,
  'aura.face3d-profile.v3',
  'suppressed valueMm retains below-minimum raw quality diagnostics',
);
expectEqual(
  parseFace3DProfile({
    ...createV3Profile({
      aggregation: 'none',
      collectionPolicyId: 'diagnostics-exact-1-v1',
      completionRatio: 1,
      sampleMode: 'single_frame',
      targetFrameCount: 1,
      validFrameCount: 1,
    }),
    warnings: [],
  }),
  null,
  'single-frame profile must disclose unaggregated warning',
);

const evidenceV3Profile =
  v3Profile?.schemaVersion === 'aura.face3d-profile.v3' ? v3Profile : null;
expect(evidenceV3Profile !== null, 'unified evidence fixture has a v3 profile');
const adaptedUnifiedEvidence = adaptFace3DRuntimeEvidence({
  captureId: 'unified-capture-1',
  face3d: evidenceV3Profile!,
  requestId: 'unified-request-1',
  type: 'unified_face_capture_completed',
});
expectEqual(
  adaptedUnifiedEvidence.event.type,
  'face3d_analyzed',
  'unified completion adapts to repeatability-compatible analyzed evidence',
);
expectEqual(
  adaptedUnifiedEvidence.unifiedCapture?.captureId,
  'unified-capture-1',
  'unified evidence preserves capture id without image data',
);

// ── Tier-2 optional 키 계약 (docs/face3d/TIER2_METRIC_CONTRACT.md §3) ─────────
// 위 케이스들이 v1(필수 5지표) 파싱 회귀를 고정한다. 여기서는 optional 키의
// 유/무/훼손이 v1 파싱 성공 여부에 영향을 주지 않음을 고정한다.
const tier2Metric = {
  confidence: 0.8,
  mad: 0.002,
  unit: 'normalized' as const,
  validFrameCount: 27,
  value: 0.41,
};

const profileWithTier2 = parseFace3DProfile({
  ...profile,
  metrics: {
    ...profile.metrics,
    malarProjectionLeft: tier2Metric,
    noseLength: tier2Metric,
  },
});
expect(profileWithTier2 !== null, 'tier-2 keys parse alongside required metrics');
expectEqual(
  profileWithTier2?.metrics.noseLength?.value,
  0.41,
  'tier-2 metric value preserved',
);
expectEqual(
  profileWithTier2?.metrics.malarProjectionLeft?.confidence,
  0.8,
  'tier-2 confidence preserved',
);

const profileWithoutTier2 = parseFace3DProfile(profile);
expect(
  profileWithoutTier2 !== null,
  'g1 profile without tier-2 keys still parses (v1 regression)',
);
expectEqual(
  profileWithoutTier2?.metrics.noseLength,
  undefined,
  'absent tier-2 key stays undefined',
);

const profileWithBrokenTier2 = parseFace3DProfile({
  ...profile,
  metrics: {...profile.metrics, alarWidth: {unit: 'mm', value: 3}},
});
expect(
  profileWithBrokenTier2 !== null,
  'malformed tier-2 key does not reject the profile',
);
expectEqual(
  profileWithBrokenTier2?.metrics.alarWidth,
  undefined,
  'malformed tier-2 key is dropped',
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
