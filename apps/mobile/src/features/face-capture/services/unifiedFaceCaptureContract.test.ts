import type {Face3DMetricKey} from '../../face-3d/types';
import {
  buildUnifiedFaceCaptureRequest,
  isUnifiedFaceCaptureCompletionCompatible,
  parseUnifiedFaceCaptureEvent,
  parseUnifiedFaceCaptureRequest,
} from './unifiedFaceCaptureContract';

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label);
  }
}

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const request = buildUnifiedFaceCaptureRequest({requestId: 'unified-request-1'});
expectEqual(request.minimumValidFrames, 5, 'product policy minimum');
expectEqual(request.targetValidFrames, 8, 'product policy target');
expectEqual(request.maximumDurationMs, 500, 'product policy duration');
expectEqual(request.retryAttemptCount, 0, 'first capture retry attempt');
expectEqual(parseUnifiedFaceCaptureRequest(request)?.requestId, request.requestId, 'request parses');
expectEqual(
  parseUnifiedFaceCaptureRequest({...request, targetValidFrames: 30}),
  null,
  'mutated policy tuple rejected',
);
expectEqual(
  parseUnifiedFaceCaptureRequest({...request, retryAttemptCount: 2}),
  null,
  'retry attempt outside 0/1 rejected',
);

let diagnosticsBlocked = false;
try {
  buildUnifiedFaceCaptureRequest({collectionPolicyId: 'diagnostics-exact-1-v1'});
} catch {
  diagnosticsBlocked = true;
}
expect(diagnosticsBlocked, 'diagnostics policy requires explicit gate');

const diagnostics = buildUnifiedFaceCaptureRequest({
  allowDiagnostics: true,
  collectionPolicyId: 'diagnostics-exact-1-v1',
  requestId: 'unified-diagnostics-1',
});
expectEqual(diagnostics.sampleMode, 'single_frame', 'single-frame diagnostics mode');
expectEqual(diagnostics.minimumValidFrames, 1, 'single-frame exact minimum');

const gate = parseUnifiedFaceCaptureEvent({
  cameraReady: true,
  faceReady: true,
  finalCaptureGreenlight: true,
  hairline: {
    confidence: 0.2,
    frameToken: 'camera-1',
    sensorTimestampMs: 100,
    stableDurationMs: 500,
    status: 'likely_occluded',
  },
  poseReady: true,
  requestId: request.requestId,
  type: 'unified_face_capture_gate',
});
expectEqual(gate?.type, 'unified_face_capture_gate', 'gate event parses');
expectEqual(
  gate?.type === 'unified_face_capture_gate' ? gate.finalCaptureGreenlight : false,
  true,
  'hairline advisory does not force shutter closed',
);
expectEqual(
  parseUnifiedFaceCaptureEvent({
    cameraReady: false,
    faceReady: true,
    finalCaptureGreenlight: true,
    hairline: {
      confidence: null,
      frameToken: null,
      sensorTimestampMs: null,
      stableDurationMs: 0,
      status: 'unknown',
    },
    poseReady: true,
    requestId: request.requestId,
    type: 'unified_face_capture_gate',
  }),
  null,
  'greenlight cannot bypass the general camera gate',
);
expectEqual(
  parseUnifiedFaceCaptureEvent({
    cameraReady: true,
    faceReady: true,
    finalCaptureGreenlight: false,
    hairline: {
      confidence: null,
      frameToken: null,
      sensorTimestampMs: null,
      stableDurationMs: 0,
      status: 'unknown',
    },
    poseReady: true,
    requestId: request.requestId,
    type: 'unified_face_capture_gate',
  })?.type,
  'unified_face_capture_gate',
  'an unexposed native sync gate may still keep the shutter closed',
);

const metricKeys: Face3DMetricKey[] = [
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
];
const metrics = Object.fromEntries(
  metricKeys.map((key, index) => [
    key,
    {
      confidence: 0.8,
      mad: 0.003,
      unit: 'normalized',
      validFrameCount: 8,
      value: 0.1 + index * 0.02,
    },
  ]),
);

function completedFixture(overrides: Record<string, unknown> = {}) {
  return {
    captureId: 'capture-1',
    face3d: {
      aggregation: 'median_mad',
      captureWindowMs: 280,
      collectionPolicyId: 'unified-micro-burst-5of8-v1',
      completionRatio: 1,
      confidenceCalibrationStatus: 'uncalibrated',
      gateVersion: 'face3d-gate-v2',
      metrics,
      sampleMode: 'micro_burst',
      schemaVersion: 'aura.face3d-profile.v2',
      source: 'arkit_face_mesh',
      targetFrameCount: 8,
      topologyFingerprint: 'synthetic-v2',
      validFrameCount: 8,
      warnings: [],
    },
    hairline: {
      analysisEligible: true,
      confidence: 0.82,
      normalizedPoint: {x: 0.5, y: 0.15},
      outcome: 'detected_high_confidence',
      provider: 'mediapipe_selfie_multiclass',
      retryRecommendation: {attemptCount: 0, recommended: false},
    },
    image: {
      format: 'jpg',
      height: 1920,
      mirrored: false,
      orientation: 'upright',
      uri: 'file:///tmp/unified.jpg',
      width: 1080,
    },
    requestId: request.requestId,
    schemaVersion: 'aura.unified-face-capture.v1',
    status: 'full_success',
    timestamps: {
      burstEndObservedAtMs: 1280,
      burstStartObservedAtMs: 1000,
      cameraFrameToken: 'camera-4',
      cameraObservedAtMs: 1120,
      cameraSensorTimestampMs: 5000,
      faceNativeFrameToken: 'arkit-4',
      faceObservedAtMs: 1130,
      maxAbsFaceSensorDeltaMs: 20,
      segmentationFrameToken: 'camera-4',
      segmentationSensorTimestampMs: 5000,
    },
    type: 'unified_face_capture_completed',
    warnings: [],
    ...overrides,
  };
}

const completed = parseUnifiedFaceCaptureEvent(completedFixture());
expectEqual(completed?.type, 'unified_face_capture_completed', 'completed parses');
const retryRequest = buildUnifiedFaceCaptureRequest({
  requestId: request.requestId,
  retryAttemptCount: 1,
});
expect(
  completed?.type === 'unified_face_capture_completed' &&
    !isUnifiedFaceCaptureCompletionCompatible(completed, retryRequest),
  'completion from another retry attempt is rejected',
);
expectEqual(
  completed?.type === 'unified_face_capture_completed'
    ? completed.hairline.analysisEligible
    : false,
  true,
  'matched MediaPipe H is eligible',
);
expectEqual(
  completed?.type === 'unified_face_capture_completed'
    ? isUnifiedFaceCaptureCompletionCompatible(completed, request)
    : false,
  true,
  'completed result matches its immutable request policy',
);

const mismatched = parseUnifiedFaceCaptureEvent(
  completedFixture({
    timestamps: {
      ...(completedFixture().timestamps as Record<string, unknown>),
      segmentationFrameToken: 'camera-stale',
    },
  }),
);
expectEqual(
  mismatched?.type === 'unified_face_capture_completed'
    ? mismatched.hairline.outcome
    : null,
  'omitted',
  'mismatched segmentation token omits H',
);
expectEqual(
  mismatched?.type === 'unified_face_capture_completed' ? mismatched.status : null,
  'partial_success',
  'mismatched segmentation remains partial capture success',
);

const sensorMismatched = parseUnifiedFaceCaptureEvent(
  completedFixture({
    timestamps: {
      ...(completedFixture().timestamps as Record<string, unknown>),
      segmentationSensorTimestampMs: 5002,
    },
  }),
);
expectEqual(
  sensorMismatched?.type === 'unified_face_capture_completed'
    ? sensorMismatched.hairline.outcome
    : null,
  'omitted',
  'matched token with a different sensor timestamp still omits H',
);

expectEqual(
  parseUnifiedFaceCaptureEvent(
    completedFixture({
      hairline: {
        analysisEligible: false,
        confidence: 0.2,
        normalizedPoint: {x: 0.5, y: 0.15},
        outcome: 'detected_low_confidence',
        provider: 'mediapipe_selfie_multiclass',
        retryRecommendation: {attemptCount: 0, recommended: false},
      },
    }),
  ),
  null,
  'a confidence below the measured-H floor cannot be reported as a real H',
);

expectEqual(
  parseUnifiedFaceCaptureEvent(
    completedFixture({
      hairline: {
        analysisEligible: true,
        confidence: 0.82,
        normalizedPoint: {x: 0.5, y: 0.15},
        outcome: 'detected_high_confidence',
        provider: 'mediapipe_selfie_multiclass',
        retryRecommendation: {
          attemptCount: 0,
          reason: 'hairline_occluded',
          recommended: true,
        },
      },
    }),
  ),
  null,
  'a successful H measurement cannot also recommend an occlusion retake',
);

const appleWithoutFrameEvidence = parseUnifiedFaceCaptureEvent(
  completedFixture({
    hairline: {
      analysisEligible: true,
      confidence: 0.85,
      normalizedPoint: {x: 0.5, y: 0.14},
      outcome: 'detected_high_confidence',
      provider: 'apple_semantic_matte',
      retryRecommendation: {attemptCount: 0, recommended: false},
    },
    timestamps: {
      ...(completedFixture().timestamps as Record<string, unknown>),
      segmentationFrameToken: undefined,
      segmentationSensorTimestampMs: undefined,
    },
  }),
);
expectEqual(
  appleWithoutFrameEvidence?.type === 'unified_face_capture_completed'
    ? appleWithoutFrameEvidence.hairline.outcome
    : null,
  'omitted',
  'Apple H without the captured image frame token is omitted',
);

expectEqual(
  completed?.type === 'unified_face_capture_completed'
    ? isUnifiedFaceCaptureCompletionCompatible(
        {
          ...completed,
          timestamps: {
            ...completed.timestamps,
            maxAbsFaceSensorDeltaMs: request.maxAbsFaceSensorDeltaMs + 1,
          },
        },
        request,
      )
    : true,
  false,
  'result exceeding the request native delta is rejected',
);

expectEqual(
  completed?.type === 'unified_face_capture_completed'
    ? isUnifiedFaceCaptureCompletionCompatible(
        {
          ...completed,
          face3d: {
            ...completed.face3d,
            collectionPolicyId: 'diagnostics-exact-8-v1',
          },
        },
        request,
      )
    : true,
  false,
  'result from another collection policy is rejected',
);

expectEqual(
  parseUnifiedFaceCaptureEvent(
    completedFixture({
      timestamps: {
        ...(completedFixture().timestamps as Record<string, unknown>),
        faceNativeFrameToken: undefined,
      },
    }),
  ),
  null,
  'completed event without native face-frame evidence rejected',
);
expectEqual(
  parseUnifiedFaceCaptureEvent(
    completedFixture({
      status: 'unknown_status',
    }),
  ),
  null,
  'unknown completion status rejected',
);
expectEqual(
  parseUnifiedFaceCaptureEvent(
    completedFixture({
      timestamps: {
        ...(completedFixture().timestamps as Record<string, unknown>),
        anchorFaceNativeTimestampMs: -1,
      },
    }),
  ),
  null,
  'negative optional native timestamp rejected',
);

const blocked = parseUnifiedFaceCaptureEvent({
  reason: 'native_face_frame_sync_unavailable',
  requestId: request.requestId,
  type: 'unified_face_capture_blocked',
  warnings: ['native_sync_unavailable'],
});
expectEqual(blocked?.type, 'unified_face_capture_blocked', 'native sync block parses');

expectEqual(
  parseUnifiedFaceCaptureEvent({
    reason: 'unsupported_custom_reason',
    requestId: request.requestId,
    type: 'unified_face_capture_blocked',
  }),
  null,
  'unknown blocked reason rejected',
);
