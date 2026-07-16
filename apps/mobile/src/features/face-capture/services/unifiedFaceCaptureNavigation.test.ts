import {
  getFaceAnalysisConfirmationDestination,
  getUnifiedHairlineConfirmationNotice,
  shouldUseUnifiedFaceCaptureRoute,
} from './unifiedFaceCaptureNavigation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: true,
    forceLegacyCapture: false,
    nativeViewSupported: true,
  }),
  true,
  'camera route enables unified capture',
);
expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: false,
    forceLegacyCapture: false,
    nativeViewSupported: true,
  }),
  false,
  'feature flag off preserves legacy route',
);
expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: true,
    forceLegacyCapture: false,
    initialSource: 'gallery',
    nativeViewSupported: true,
  }),
  false,
  'gallery never mounts unified camera',
);
expectEqual(
  shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: true,
    forceLegacyCapture: true,
    nativeViewSupported: true,
  }),
  false,
  'fallback forces legacy route',
);
expectEqual(
  getFaceAnalysisConfirmationDestination(true),
  'FaceAnalysisLoading',
  'unified confirmation skips legacy Face3D',
);
expectEqual(
  getFaceAnalysisConfirmationDestination(false),
  'Face3DMeasurement',
  'legacy confirmation keeps 30-frame Face3D',
);
expectEqual(
  getUnifiedHairlineConfirmationNotice({
    analysisEligible: false,
    confidence: null,
    outcome: 'omitted',
    provider: 'none',
    retryRecommendation: {
      attemptCount: 0,
      reason: 'hairline_occluded',
      recommended: true,
    },
  }),
  '헤어라인을 충분히 확인하지 못해 이마 비율은 제외돼요. 원하면 한 번 다시 촬영할 수 있어요.',
  'actionable omission offers one optional retake',
);
expectEqual(
  getUnifiedHairlineConfirmationNotice({
    analysisEligible: true,
    confidence: 0.82,
    normalizedPoint: {x: 0.5, y: 0.15},
    outcome: 'detected_high_confidence',
    provider: 'mediapipe_selfie_multiclass',
    retryRecommendation: {attemptCount: 0, recommended: false},
  }),
  null,
  'eligible H keeps the normal confirmation copy',
);
